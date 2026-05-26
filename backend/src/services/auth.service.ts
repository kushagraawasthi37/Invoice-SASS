import bcrypt from "bcryptjs";
import { prisma } from "../config/database";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";
import { generateSecureToken } from "../utils/helpers";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  EmailNotVerifiedError,
  TooManyRequestsError,
} from "../middleware/errorHandler";
import { emailService } from "./email.service";
import { env } from "../config/env";
import { getRedis } from "../config/redis";
import { logger } from "../utils/logger";

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    role: string;
    emailVerified: boolean;
    workspaceId: string;
  };
  tokens: TokenPair;
}

export interface RegisterResult {
  requiresVerification: true;
  email: string;
  name: string;
}

async function issueTokens(
  userId: string,
  email: string,
  role: string,
): Promise<TokenPair> {
  const tokenId = generateSecureToken(16);

  const accessToken = signAccessToken({ sub: userId, email, role });
  const refreshToken = signRefreshToken({ sub: userId, tokenId });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId, expiresAt },
  });

  return { accessToken, refreshToken };
}

async function ensureWorkspace(userId: string): Promise<string> {
  let workspace = await prisma.workspace.findUnique({ where: { userId } });

  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        userId,
        subscription: { create: { plan: "FREE", status: "ACTIVE" } },
        usageTracking: { create: {} },
      },
      include: { subscription: true },
    });
  }

  return workspace.id;
}

// Redis rate-limit keys for email verification resend
const RESEND_COOLDOWN_TTL = 60;      // seconds between resends
const RESEND_HOURLY_MAX = 5;         // max resends per hour
const RESEND_HOURLY_TTL = 3600;      // 1 hour window

export const authService = {
  async register(input: RegisterInput): Promise<RegisterResult> {
    const email = input.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      if (existing.emailVerified) {
        throw new ConflictError("An account with this email already exists");
      }
      // Unverified account — refresh the token and resend the email
      const emailVerifyToken = generateSecureToken();
      await prisma.user.update({
        where: { id: existing.id },
        data: { emailVerifyToken },
      });
      await emailService
        .sendVerification(existing.email, existing.name, emailVerifyToken)
        .catch((err) => logger.error("Verification email failed", { err }));
      return { requiresVerification: true, email: existing.email, name: existing.name };
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const emailVerifyToken = generateSecureToken();

    const user = await prisma.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash,
        emailVerifyToken,
      },
    });

    await ensureWorkspace(user.id);

    await emailService
      .sendVerification(user.email, user.name, emailVerifyToken)
      .catch((err) => {
        logger.error("Verification email failed", { err });
      });

    return {
      requiresVerification: true,
      email: user.email,
      name: user.name,
    };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const email = input.email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email },
      include: { workspace: true },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (!user.emailVerified) {
      throw new EmailNotVerifiedError(
        "Please verify your email before signing in. Check your inbox for the verification link.",
      );
    }

    const workspaceId = user.workspace?.id ?? (await ensureWorkspace(user.id));
    const tokens = await issueTokens(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
        emailVerified: user.emailVerified,
        workspaceId,
      },
      tokens,
    };
  },

  async resendVerification(emailInput: string): Promise<void> {
    const email = emailInput.toLowerCase().trim();
    const redis = await getRedis();

    // Check hourly limit (max 5 per hour)
    const countKey = `verify_count:${email}`;
    const countStr = await redis.get(countKey);
    const count = countStr ? parseInt(countStr, 10) : 0;
    if (count >= RESEND_HOURLY_MAX) {
      throw new TooManyRequestsError(
        "You've reached the maximum of 5 verification emails per hour. Please check your spam folder.",
      );
    }

    // Check per-resend cooldown (60 seconds)
    const cooldownKey = `verify_cooldown:${email}`;
    const inCooldown = await redis.get(cooldownKey);
    if (inCooldown) {
      throw new TooManyRequestsError(
        "Please wait 1 minute before requesting another verification email.",
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerified) {
      // Silently succeed — don't leak whether email exists
      return;
    }

    const emailVerifyToken = generateSecureToken();
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifyToken },
    });

    await emailService
      .sendVerification(user.email, user.name, emailVerifyToken)
      .catch((err) => logger.error("Resend verification failed", { err }));

    // Set cooldown (60s)
    await redis.set(cooldownKey, "1", "EX", RESEND_COOLDOWN_TTL);

    // Increment hourly counter
    const newCount = await redis.incr(countKey);
    if (newCount === 1) {
      await redis.expire(countKey, RESEND_HOURLY_TTL);
    }
  },

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const payload = verifyRefreshToken(refreshToken);

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!stored) throw new UnauthorizedError("Invalid refresh token");

    if (stored.expiresAt < new Date()) {
      await prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new UnauthorizedError("Refresh token expired");
    }

    if (stored.userId !== payload.sub) {
      throw new UnauthorizedError("Token mismatch");
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedError("User not found");

    await prisma.refreshToken.delete({ where: { id: stored.id } });

    return issueTokens(user.id, user.email, user.role);
  },

  async logout(refreshToken: string): Promise<void> {
    await prisma.refreshToken
      .deleteMany({ where: { token: refreshToken } })
      .catch(() => {});
  },

  async forgotPassword(emailInput: string): Promise<void> {
    const email = emailInput.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const resetToken = generateSecureToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { resetPasswordToken: resetToken, resetPasswordExpires: expires },
    });

    await emailService
      .sendPasswordReset(user.email, user.name, resetToken)
      .catch((err) => logger.error("Reset email failed", { err }));
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: { gt: new Date() },
      },
    });

    if (!user) throw new ValidationError("Invalid or expired reset token");

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetPasswordToken: null, resetPasswordExpires: null },
    });

    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  },

  async verifyEmail(token: string): Promise<void> {
    const user = await prisma.user.findFirst({ where: { emailVerifyToken: token } });

    if (!user) throw new NotFoundError("Verification token");

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null },
    });
  },

  async handleGoogleOAuth(profile: {
    id: string;
    emails: Array<{ value: string }>;
    displayName: string;
    photos: Array<{ value: string }>;
  }): Promise<AuthResult> {
    const email = profile.emails[0].value.toLowerCase().trim();
    const avatarUrl = profile.photos[0]?.value;

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: profile.displayName.trim(),
          googleId: profile.id,
          avatarUrl,
          emailVerified: true,
        },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: profile.id, avatarUrl: avatarUrl || user.avatarUrl },
      });
    }

    const workspaceId = await ensureWorkspace(user.id);
    const tokens = await issueTokens(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
        emailVerified: user.emailVerified,
        workspaceId,
      },
      tokens,
    };
  },
};

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import { env } from '../config/env';

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/, 'Must contain uppercase').regex(/[0-9]/, 'Must contain number'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotSchema = z.object({ email: z.string().email() });

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
});

export const authController = {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const body = registerSchema.parse(req.body);
      const result = await authService.register(body);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const body = loginSchema.parse(req.body);
      const result = await authService.login(body);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async resendVerification(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      await authService.resendVerification(email);
      res.json({ success: true, message: 'Verification email sent. Check your inbox.' });
    } catch (err) {
      next(err);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
      const tokens = await authService.refreshTokens(refreshToken);
      res.json({ success: true, data: { tokens } });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = z.object({ refreshToken: z.string().optional() }).parse(req.body);
      if (refreshToken) await authService.logout(refreshToken);
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  },

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = forgotSchema.parse(req.body);
      await authService.forgotPassword(email);
      res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    } catch (err) {
      next(err);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, password } = resetSchema.parse(req.body);
      await authService.resetPassword(token, password);
      res.json({ success: true, message: 'Password reset successfully.' });
    } catch (err) {
      next(err);
    }
  },

  async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = z.object({ token: z.string() }).parse(req.query);
      await authService.verifyEmail(token);
      // Return JSON so the frontend VerifyEmailPage can control navigation
      res.json({ success: true, message: 'Email verified successfully.' });
    } catch (err) {
      next(err);
    }
  },

  googleCallback(req: Request, res: Response) {
    const result = (req as Request & { user?: { tokens: { accessToken: string; refreshToken: string } } }).user;
    if (!result) {
      res.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
      return;
    }
    const { accessToken, refreshToken } = result.tokens;
    res.redirect(
      `${env.FRONTEND_URL}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`,
    );
  },
};

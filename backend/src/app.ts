import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from './config/env';
import { globalLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { authService } from './services/auth.service';
import router from './routes';
import { logger } from './utils/logger';

export function createApp(): express.Application {
  const app = express();

  // ── Security ─────────────────────────────────────────────────
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.use(
    cors({
      origin: [env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  // ── Body parsing ─────────────────────────────────────────────
  // Raw body for Stripe webhooks (must come before JSON parser)
  app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());
  app.use(compression());

  // ── Rate limiting ─────────────────────────────────────────────
  app.use(globalLimiter);

  // ── Passport / OAuth ──────────────────────────────────────────
  app.use(passport.initialize());

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          callbackURL: env.GOOGLE_CALLBACK_URL || `${env.FRONTEND_URL}/api/v1/auth/google/callback`,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const result = await authService.handleGoogleOAuth(profile as never);
            done(null, result);
          } catch (err) {
            done(err, false);
          }
        },
      ),
    );
  }

  // ── Static uploads (local fallback) ──────────────────────────
  app.use('/uploads', express.static('uploads'));

  // ── Logging ───────────────────────────────────────────────────
  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.url}`);
    next();
  });

  // ── API Routes ────────────────────────────────────────────────
  app.use('/api/v1', router);

  // ── 404 handler ───────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
  });

  // ── Error handler ────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}

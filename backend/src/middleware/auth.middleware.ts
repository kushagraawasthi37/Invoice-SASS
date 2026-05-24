import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { verifyAccessToken } from '../utils/jwt';
import { UnauthorizedError } from './errorHandler';
import { AuthenticatedRequest } from '../types';

export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        workspace: {
          include: { subscription: true },
        },
      },
    });

    if (!user) throw new UnauthorizedError('User not found');
    if (!user.workspace) throw new UnauthorizedError('Workspace not found');

    req.user = user as AuthenticatedRequest['user'];
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
    } else {
      next(new UnauthorizedError('Invalid or expired token'));
    }
  }
}

export function requireAdmin(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (req.user.role !== 'ADMIN') {
    next(new UnauthorizedError('Admin access required'));
    return;
  }
  next();
}

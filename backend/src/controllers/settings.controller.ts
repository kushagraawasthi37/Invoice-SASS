import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../config/database';
import { s3Service } from '../services/s3.service';
import multer from 'multer';

const settingsSchema = z.object({
  bizName: z.string().max(200).optional(),
  abn: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  website: z.string().url().optional().or(z.literal('')),
  providerLabel: z.string().max(50).optional(),
  clientLabel: z.string().max(50).optional(),
  defaultProviderTitle: z.string().max(100).optional(),
  defaultClientName: z.string().max(200).optional(),
  defaultDescription: z.string().max(500).optional(),
  defaultRate: z.number().min(0).optional(),
  invoicePrefix: z.string().max(10).optional(),
  currency: z.enum(['AUD', 'USD', 'EUR', 'GBP']).optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

export const settingsController = {
  async get(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: req.user.workspace.id },
        include: { subscription: true, usageTracking: true },
      });
      res.json({ success: true, data: workspace });
    } catch (err) {
      next(err);
    }
  },

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const body = settingsSchema.parse(req.body);
      const workspace = await prisma.workspace.update({
        where: { id: req.user.workspace.id },
        data: body,
      });
      res.json({ success: true, data: workspace });
    } catch (err) {
      next(err);
    }
  },

  async uploadLogo(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }

      const key = s3Service.generateKey(req.user.workspace.id, 'logo', 'company-logo');
      const url = await s3Service.upload(req.file.buffer, key, req.file.mimetype);

      await prisma.workspace.update({
        where: { id: req.user.workspace.id },
        data: { logoUrl: url },
      });

      res.json({ success: true, data: { logoUrl: url } });
    } catch (err) {
      next(err);
    }
  },

  async getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, name: true, email: true, avatarUrl: true, emailVerified: true, role: true, createdAt: true },
      });
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },

  async updateProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const body = z.object({
        name: z.string().min(2).max(100).optional(),
      }).parse(req.body);

      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: body,
        select: { id: true, name: true, email: true, avatarUrl: true, emailVerified: true },
      });
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },
};

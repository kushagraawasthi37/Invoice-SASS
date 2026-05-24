import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../config/database';
import { s3Service } from '../services/s3.service';
import {
  aiAnalysisService,
  generateTemplateFingerprint,
  applyLearnedMappings,
  FieldMapping,
} from '../services/ai-analysis.service';
import { NotFoundError, ForbiddenError, PaymentRequiredError, ValidationError } from '../middleware/errorHandler';
import { FREE_CUSTOM_TEMPLATES_LIMIT } from '../config/stripe';
import { logger } from '../utils/logger';

const updateMetaSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fontFamily: z.string().optional(),
  isDefault: z.boolean().optional(),
});

const correctMappingSchema = z.object({
  label: z.string().min(1),
  mappedTo: z.string().min(1),
});

// ─── Internal types ───────────────────────────────────────────────────────────

interface MappingCorrection {
  label: string;
  mappedTo: string;
  correctedAt: string;
  confidence: number;
}

interface StoredMappingMemory {
  corrections: MappingCorrection[];
  version: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMemory(raw: unknown): StoredMappingMemory {
  if (!raw || typeof raw !== 'object') return { corrections: [], version: 0 };
  const m = raw as Record<string, unknown>;
  return {
    corrections: Array.isArray(m.corrections) ? (m.corrections as MappingCorrection[]) : [],
    version: typeof m.version === 'number' ? m.version : 0,
  };
}

// Run analysis and save results — shared by upload and reanalyze flows
async function runAnalysisAndSave(templateId: string, pdfBuffer: Buffer): Promise<void> {
  try {
    const result = await aiAnalysisService.analyze(pdfBuffer);
    const fingerprint = result.fingerprint ?? generateTemplateFingerprint(result);

    // Check for a prior template with the same fingerprint — apply learned corrections
    let finalMappings: FieldMapping[] = result.fieldMappings;
    try {
      const priorTemplate = await prisma.template.findFirst({
        where: {
          templateFingerprint: fingerprint,
          analysisStatus: 'READY',
          id: { not: templateId },
        },
        select: { mappingMemory: true },
      });

      if (priorTemplate?.mappingMemory) {
        const memory = parseMemory(priorTemplate.mappingMemory);
        if (memory.corrections.length > 0) {
          finalMappings = applyLearnedMappings(result.fieldMappings, memory.corrections);
          logger.info(
            `Template ${templateId}: applied ${memory.corrections.length} learned corrections from prior fingerprint match`,
          );
        }
      }
    } catch (matchErr) {
      logger.warn('Fingerprint similarity lookup failed (non-critical):', matchErr);
    }

    await prisma.template.update({
      where: { id: templateId },
      data: {
        analysisStatus: 'READY',
        pageCount: result.pageCount,
        templateFingerprint: fingerprint,
        analysisJson: {
          pdfType: result.pdfType,
          pageCount: result.pageCount,
          acroFields: result.acroFields,
          tableConfig: result.tableConfig,
        } as object,
        fieldMappings: finalMappings as object,
      },
    });

    logger.info(
      `Template ${templateId} analysis complete. ${finalMappings.length} fields mapped. fingerprint=${fingerprint}`,
    );
  } catch (err) {
    logger.error(`Template ${templateId} analysis failed:`, err);
    await prisma.template.update({
      where: { id: templateId },
      data: {
        analysisStatus: 'FAILED',
        analysisError: String(err),
      },
    });
  }
}

// ─── Controller ───────────────────────────────────────────────────────────────

export const templateController = {
  // ── List templates ───────────────────────────────────────────────────────
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const templates = await prisma.template.findMany({
        where: {
          OR: [{ scope: 'SYSTEM' }, { workspaceId: req.user.workspace.id }],
        },
        select: {
          id: true,
          name: true,
          description: true,
          scope: true,
          thumbnailUrl: true,
          brandColor: true,
          fontFamily: true,
          isDefault: true,
          analysisStatus: true,
          pageCount: true,
          originalPdfUrl: true,
          createdAt: true,
        },
        orderBy: [{ scope: 'asc' }, { createdAt: 'asc' }],
      });
      res.json({ success: true, data: templates });
    } catch (err) {
      next(err);
    }
  },

  // ── Get single template ──────────────────────────────────────────────────
  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const template = await prisma.template.findFirst({
        where: {
          id: req.params.id,
          OR: [{ scope: 'SYSTEM' }, { workspaceId: req.user.workspace.id }],
        },
      });
      if (!template) throw new NotFoundError('Template');
      res.json({ success: true, data: template });
    } catch (err) {
      next(err);
    }
  },

  // ── Upload and analyse a PDF ─────────────────────────────────────────────
  async upload(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) throw new ValidationError('PDF file is required');
      if (req.file.mimetype !== 'application/pdf') throw new ValidationError('Only PDF files are accepted');
      if (req.file.size > 20 * 1024 * 1024) throw new ValidationError('PDF must be under 20 MB');

      const sub = req.user.workspace.subscription;
      if (sub?.plan === 'FREE') {
        const count = await prisma.template.count({
          where: { workspaceId: req.user.workspace.id, scope: 'USER' },
        });
        if (count >= FREE_CUSTOM_TEMPLATES_LIMIT) {
          next(
            new PaymentRequiredError(
              `Free plan limited to ${FREE_CUSTOM_TEMPLATES_LIMIT} custom template. Upgrade to Pro for unlimited.`,
            ),
          );
          return;
        }
      }

      const name =
        (req.body?.name as string) ||
        req.file.originalname.replace(/\.pdf$/i, '') ||
        'Uploaded Template';
      const description = (req.body?.description as string) || '';

      const pdfBuffer = req.file.buffer;
      const key = s3Service.generateKey(req.user.workspace.id, 'template', `tpl-${Date.now()}`);
      const pdfUrl = await s3Service.upload(pdfBuffer, key, 'application/pdf');

      const template = await prisma.template.create({
        data: {
          workspaceId: req.user.workspace.id,
          scope: 'USER',
          name,
          description,
          originalPdfKey: key,
          originalPdfUrl: pdfUrl,
          analysisStatus: 'PROCESSING',
        },
      });

      // Run AI analysis in the background
      setImmediate(() => {
        runAnalysisAndSave(template.id, pdfBuffer).catch((err) => {
          logger.error(`Background analysis error for template ${template.id}:`, err);
        });
      });

      res.status(201).json({ success: true, data: template });
    } catch (err) {
      next(err);
    }
  },

  // ── Poll analysis status ─────────────────────────────────────────────────
  async getAnalysis(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const template = await prisma.template.findFirst({
        where: {
          id: req.params.id,
          OR: [{ scope: 'SYSTEM' }, { workspaceId: req.user.workspace.id }],
        },
        select: {
          id: true,
          analysisStatus: true,
          analysisError: true,
          fieldMappings: true,
          analysisJson: true,
          pageCount: true,
          templateFingerprint: true,
        },
      });
      if (!template) throw new NotFoundError('Template');
      res.json({ success: true, data: template });
    } catch (err) {
      next(err);
    }
  },

  // ── Correct a field mapping (AI learning) ────────────────────────────────
  async correctMapping(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { label, mappedTo } = correctMappingSchema.parse(req.body);

      const template = await prisma.template.findFirst({
        where: { id: req.params.id, workspaceId: req.user.workspace.id },
      });
      if (!template) throw new NotFoundError('Template');
      if (template.scope === 'SYSTEM') throw new ForbiddenError('Cannot modify system templates');

      // Update the field mappings array
      const currentMappings = (template.fieldMappings as Array<Record<string, unknown>>) || [];
      const updatedMappings = currentMappings.map((m) =>
        m.label === label ? { ...m, mappedTo, confidence: 1.0, correctedByUser: true } : m,
      );

      // Update the mapping memory (persistent learning store)
      const memory = parseMemory(template.mappingMemory);
      const correctionIndex = memory.corrections.findIndex((c) => c.label === label);
      const newCorrection: MappingCorrection = {
        label,
        mappedTo,
        correctedAt: new Date().toISOString(),
        confidence: 1.0,
      };

      if (correctionIndex >= 0) {
        memory.corrections[correctionIndex] = newCorrection;
      } else {
        memory.corrections.push(newCorrection);
      }
      memory.version += 1;

      await prisma.template.update({
        where: { id: template.id },
        data: {
          fieldMappings: updatedMappings as object,
          mappingMemory: memory as unknown as object,
        },
      });

      logger.info(`Template ${template.id}: correction saved — "${label}" → "${mappedTo}"`);
      res.json({ success: true, message: 'Mapping corrected' });
    } catch (err) {
      next(err);
    }
  },

  // ── Re-trigger analysis ──────────────────────────────────────────────────
  async reanalyze(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const template = await prisma.template.findFirst({
        where: { id: req.params.id, workspaceId: req.user.workspace.id },
      });
      if (!template) throw new NotFoundError('Template');
      if (!template.originalPdfKey) throw new ValidationError('Template has no uploaded PDF');

      await prisma.template.update({
        where: { id: template.id },
        data: { analysisStatus: 'PROCESSING', analysisError: null },
      });

      setImmediate(async () => {
        try {
          const pdfBuffer = await s3Service.download(template.originalPdfKey!);
          await runAnalysisAndSave(template.id, pdfBuffer);
        } catch (err) {
          logger.error(`Re-analysis error for template ${template.id}:`, err);
          await prisma.template.update({
            where: { id: template.id },
            data: { analysisStatus: 'FAILED', analysisError: String(err) },
          });
        }
      });

      res.json({ success: true, message: 'Re-analysis triggered' });
    } catch (err) {
      next(err);
    }
  },

  // ── Update template metadata ─────────────────────────────────────────────
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.template.findFirst({
        where: { id: req.params.id, workspaceId: req.user.workspace.id },
      });
      if (!existing) throw new NotFoundError('Template');
      if (existing.scope === 'SYSTEM') throw new ForbiddenError('Cannot modify system templates');

      const body = updateMetaSchema.parse(req.body);
      const template = await prisma.template.update({
        where: { id: req.params.id },
        data: body,
      });
      res.json({ success: true, data: template });
    } catch (err) {
      next(err);
    }
  },

  // ── Delete template ──────────────────────────────────────────────────────
  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.template.findFirst({
        where: { id: req.params.id, workspaceId: req.user.workspace.id },
      });
      if (!existing) throw new NotFoundError('Template');
      if (existing.scope === 'SYSTEM') throw new ForbiddenError('Cannot delete system templates');

      if (existing.originalPdfKey) {
        await s3Service.delete(existing.originalPdfKey).catch(() => {});
      }

      await prisma.template.delete({ where: { id: req.params.id } });
      res.json({ success: true, message: 'Template deleted' });
    } catch (err) {
      next(err);
    }
  },
};

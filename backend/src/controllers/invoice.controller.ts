import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../types';
import { invoiceService } from '../services/invoice.service';
import { pdfService } from '../services/pdf.service';

const lineItemSchema = z.object({
  serviceDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  description: z.string().default(''),
  hours: z.number().min(0).default(0),
  rate: z.number().min(0).default(0),
  amount: z.number().min(0).default(0),
  sortOrder: z.number().int().optional(),
});

const createInvoiceSchema = z.object({
  type: z.enum(['INVOICE', 'QUOTE', 'PURCHASE_ORDER']).optional(),
  number: z.string().optional(),
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'VOID', 'OVERDUE']).optional(),
  issueDate: z.string(),
  dueDate: z.string().optional(),
  serviceMonth: z.string().optional(),
  providerName: z.string().min(1),
  providerTitle: z.string().optional(),
  providerAddress: z.string().optional(),
  providerEmail: z.string().email().optional().or(z.literal('')),
  providerPhone: z.string().optional(),
  providerABN: z.string().optional(),
  clientName: z.string().min(1),
  clientAddress: z.string().optional(),
  clientEmail: z.string().email().optional().or(z.literal('')),
  ndisNumber: z.string().optional(),
  fiscalAgent: z.string().optional(),
  supportCoordinator: z.string().optional(),
  legalGuardian: z.string().optional(),
  bsbAccount: z.string().optional(),
  clientSigData: z.string().optional(),
  providerSigData: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1),
  totalHours: z.number().min(0),
  subtotal: z.number().min(0),
  gstAmount: z.number().min(0).optional(),
  totalAmount: z.number().min(0),
  currency: z.string().optional(),
  templateId: z.string().optional(),
  notes: z.string().optional(),
  clientId: z.string().optional(),
});

const listQuerySchema = z.object({
  page: z.string().optional().transform(v => v ? parseInt(v, 10) : 1),
  limit: z.string().optional().transform(v => v ? parseInt(v, 10) : 20),
  search: z.string().optional(),
  status: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const invoiceController = {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const query = listQuerySchema.parse(req.query);
      const result = await invoiceService.list(req.user.workspace.id, query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const invoice = await invoiceService.getById(req.params.id, req.user.workspace.id);
      res.json({ success: true, data: invoice });
    } catch (err) {
      next(err);
    }
  },

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const body = createInvoiceSchema.parse(req.body);
      const invoice = await invoiceService.create(req.user.workspace.id, body);
      res.status(201).json({ success: true, data: invoice });
    } catch (err) {
      next(err);
    }
  },

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const body = createInvoiceSchema.partial().parse(req.body);
      const invoice = await invoiceService.update(req.params.id, req.user.workspace.id, body);
      res.json({ success: true, data: invoice });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await invoiceService.delete(req.params.id, req.user.workspace.id);
      res.json({ success: true, message: 'Invoice deleted' });
    } catch (err) {
      next(err);
    }
  },

  async duplicate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const invoice = await invoiceService.duplicate(req.params.id, req.user.workspace.id);
      res.status(201).json({ success: true, data: invoice });
    } catch (err) {
      next(err);
    }
  },

  async generatePdf(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const download = String(req.query.download ?? '');
      const body = req.body as Record<string, unknown> | undefined;
      const templateId = typeof body?.templateId === 'string' ? body.templateId : undefined;

      if (download === 'stream') {
        const buffer = await pdfService.generateBuffer(req.params.id, req.user.workspace.id, templateId);
        // Track download BEFORE sending so the limit is enforced on the very next request
        await pdfService.trackDownload(req.user.workspace.id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="invoice.pdf"`);
        res.send(buffer);
        return;
      }

      const pdfUrl = await pdfService.generateAndStore(req.params.id, req.user.workspace.id);
      res.json({ success: true, data: { pdfUrl } });
    } catch (err) {
      next(err);
    }
  },

  async getStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const stats = await invoiceService.getStats(req.user.workspace.id);
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  },
};

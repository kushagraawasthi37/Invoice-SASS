import { Prisma, InvoiceStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { s3Service } from './s3.service';
import { autoInvoiceNumber, calcHours } from '../utils/helpers';
import { NotFoundError, ForbiddenError, ValidationError } from '../middleware/errorHandler';
import { CreateInvoiceInput, PaginationQuery } from '../types';

async function getNextNumber(workspaceId: string): Promise<{ number: string; nextSeq: number }> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) throw new NotFoundError('Workspace');

  const year = new Date().getFullYear();
  const number = autoInvoiceNumber(workspace.invoicePrefix, year, workspace.nextNumber);

  return { number, nextSeq: workspace.nextNumber + 1 };
}

async function storeSignature(
  workspaceId: string,
  type: 'client' | 'provider',
  dataUrl: string,
): Promise<string | null> {
  if (!dataUrl?.startsWith('data:image')) return null;
  try {
    const base64 = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');
    const key = s3Service.generateKey(workspaceId, 'signature', `${type}-${Date.now()}`);
    return s3Service.upload(buffer, key, 'image/png');
  } catch {
    return null;
  }
}

export const invoiceService = {
  async list(workspaceId: string, query: PaginationQuery) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, query.limit || 20);
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = { workspaceId };

    if (query.search) {
      where.OR = [
        { number: { contains: query.search, mode: 'insensitive' } },
        { clientName: { contains: query.search, mode: 'insensitive' } },
        { providerName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.status && query.status !== 'ALL') {
      where.status = query.status as InvoiceStatus;
    }

    const orderBy: Prisma.InvoiceOrderByWithRelationInput = {};
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    (orderBy as Record<string, string>)[sortBy] = sortOrder;

    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          number: true,
          type: true,
          status: true,
          issueDate: true,
          dueDate: true,
          clientName: true,
          ndisNumber: true,
          totalAmount: true,
          currency: true,
          pdfUrl: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      invoices,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async getById(id: string, workspaceId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id, workspaceId },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } }, template: true, client: true },
    });
    if (!invoice) throw new NotFoundError('Invoice');
    return invoice;
  },

  async create(workspaceId: string, input: CreateInvoiceInput) {
    const { number, nextSeq } = await getNextNumber(workspaceId);

    const clientSigUrl = input.clientSigData
      ? await storeSignature(workspaceId, 'client', input.clientSigData)
      : null;
    const providerSigUrl = input.providerSigData
      ? await storeSignature(workspaceId, 'provider', input.providerSigData)
      : null;

    const lineItems = (input.lineItems || []).map((li, idx) => {
      const hours = li.hours || calcHours(li.startTime || '', li.endTime || '');
      const amount = hours * (li.rate || 0);
      return {
        sortOrder: idx,
        serviceDate: li.serviceDate ? new Date(li.serviceDate) : null,
        startTime: li.startTime || '',
        endTime: li.endTime || '',
        description: li.description || '',
        hours,
        rate: li.rate || 0,
        amount,
      };
    });

    const invoice = await prisma.invoice.create({
      data: {
        workspaceId,
        type: input.type || 'INVOICE',
        number: input.number || number,
        status: input.status || 'DRAFT',
        issueDate: new Date(input.issueDate),
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        serviceMonth: input.serviceMonth,
        providerName: input.providerName,
        providerTitle: input.providerTitle || '',
        providerAddress: input.providerAddress || '',
        providerEmail: input.providerEmail || '',
        providerPhone: input.providerPhone || '',
        providerABN: input.providerABN || '',
        clientName: input.clientName,
        clientAddress: input.clientAddress || '',
        clientEmail: input.clientEmail || '',
        ndisNumber: input.ndisNumber || '',
        fiscalAgent: input.fiscalAgent || '',
        supportCoordinator: input.supportCoordinator || '',
        legalGuardian: input.legalGuardian || '',
        bsbAccount: input.bsbAccount || '',
        clientSigUrl,
        providerSigUrl,
        totalHours: input.totalHours || 0,
        subtotal: input.subtotal || 0,
        gstAmount: input.gstAmount || 0,
        totalAmount: input.totalAmount || 0,
        currency: input.currency || 'AUD',
        templateId: input.templateId || null,
        notes: input.notes || '',
        clientId: input.clientId || null,
        lineItems: { createMany: { data: lineItems } },
      },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { nextNumber: nextSeq },
    });

    await prisma.usageTracking.upsert({
      where: { workspaceId },
      update: { invoicesCreated: { increment: 1 } },
      create: { workspaceId, invoicesCreated: 1 },
    });

    return invoice;
  },

  async update(id: string, workspaceId: string, input: Partial<CreateInvoiceInput>) {
    const existing = await prisma.invoice.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundError('Invoice');

    if (existing.status === 'PAID' && input.status !== 'PAID') {
      throw new ValidationError('Paid invoices can only have their status changed');
    }

    let clientSigUrl = existing.clientSigUrl;
    let providerSigUrl = existing.providerSigUrl;

    if (input.clientSigData) {
      clientSigUrl = await storeSignature(workspaceId, 'client', input.clientSigData);
    }
    if (input.providerSigData) {
      providerSigUrl = await storeSignature(workspaceId, 'provider', input.providerSigData);
    }

    const updateData: Prisma.InvoiceUpdateInput = {};

    const scalarFields = [
      'type', 'number', 'status', 'serviceMonth', 'providerName', 'providerTitle',
      'providerAddress', 'providerEmail', 'providerPhone', 'providerABN',
      'clientName', 'clientAddress', 'clientEmail', 'ndisNumber', 'fiscalAgent',
      'supportCoordinator', 'legalGuardian', 'bsbAccount', 'totalHours',
      'subtotal', 'gstAmount', 'totalAmount', 'currency', 'notes',
    ] as const;

    scalarFields.forEach((field) => {
      if (input[field as keyof typeof input] !== undefined) {
        (updateData as Record<string, unknown>)[field] = input[field as keyof typeof input];
      }
    });

    if (input.issueDate) updateData.issueDate = new Date(input.issueDate);
    if (input.dueDate) updateData.dueDate = new Date(input.dueDate);
    if (clientSigUrl !== existing.clientSigUrl) updateData.clientSigUrl = clientSigUrl;
    if (providerSigUrl !== existing.providerSigUrl) updateData.providerSigUrl = providerSigUrl;

    if (input.lineItems) {
      await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: id } });

      const lineItems = input.lineItems.map((li, idx) => {
        const hours = li.hours || calcHours(li.startTime || '', li.endTime || '');
        const amount = hours * (li.rate || 0);
        return {
          invoiceId: id,
          sortOrder: idx,
          serviceDate: li.serviceDate ? new Date(li.serviceDate) : null,
          startTime: li.startTime || '',
          endTime: li.endTime || '',
          description: li.description || '',
          hours,
          rate: li.rate || 0,
          amount,
        };
      });

      await prisma.invoiceLineItem.createMany({ data: lineItems });
    }

    updateData.pdfUrl = null;
    updateData.pdfGeneratedAt = null;

    const updated = await prisma.invoice.update({
      where: { id },
      data: updateData,
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });

    return updated;
  },

  async delete(id: string, workspaceId: string): Promise<void> {
    const invoice = await prisma.invoice.findFirst({ where: { id, workspaceId } });
    if (!invoice) throw new NotFoundError('Invoice');
    if (invoice.status === 'PAID') throw new ForbiddenError('Cannot delete a paid invoice');

    await prisma.invoice.delete({ where: { id } });
  },

  async duplicate(id: string, workspaceId: string) {
    const original = await prisma.invoice.findFirst({
      where: { id, workspaceId },
      include: { lineItems: true },
    });
    if (!original) throw new NotFoundError('Invoice');

    const { number, nextSeq } = await getNextNumber(workspaceId);

    const duplicated = await prisma.invoice.create({
      data: {
        workspaceId,
        type: original.type,
        number,
        status: 'DRAFT',
        issueDate: new Date(),
        dueDate: original.dueDate,
        serviceMonth: original.serviceMonth,
        providerName: original.providerName,
        providerTitle: original.providerTitle,
        providerAddress: original.providerAddress,
        providerEmail: original.providerEmail,
        providerPhone: original.providerPhone,
        providerABN: original.providerABN,
        clientName: original.clientName,
        clientAddress: original.clientAddress,
        clientEmail: original.clientEmail,
        ndisNumber: original.ndisNumber,
        fiscalAgent: original.fiscalAgent,
        supportCoordinator: original.supportCoordinator,
        legalGuardian: original.legalGuardian,
        bsbAccount: original.bsbAccount,
        totalHours: original.totalHours,
        subtotal: original.subtotal,
        gstAmount: original.gstAmount,
        totalAmount: original.totalAmount,
        currency: original.currency,
        templateId: original.templateId,
        notes: original.notes,
        clientId: original.clientId,
        lineItems: {
          createMany: {
            data: original.lineItems.map((li) => ({
              sortOrder: li.sortOrder,
              serviceDate: li.serviceDate,
              startTime: li.startTime,
              endTime: li.endTime,
              description: li.description,
              hours: li.hours,
              rate: li.rate,
              amount: li.amount,
            })),
          },
        },
      },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { nextNumber: nextSeq },
    });

    return duplicated;
  },

  async getStats(workspaceId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, draft, sent, paid, overdue, thisMonth, usage] = await Promise.all([
      prisma.invoice.count({ where: { workspaceId } }),
      prisma.invoice.count({ where: { workspaceId, status: 'DRAFT' } }),
      prisma.invoice.count({ where: { workspaceId, status: 'SENT' } }),
      prisma.invoice.count({ where: { workspaceId, status: 'PAID' } }),
      prisma.invoice.count({
        where: { workspaceId, status: 'SENT', dueDate: { lt: now } },
      }),
      prisma.invoice.aggregate({
        where: { workspaceId, status: 'PAID', issueDate: { gte: startOfMonth } },
        _sum: { totalAmount: true },
      }),
      prisma.usageTracking.findUnique({ where: { workspaceId } }),
    ]);

    return { total, draft, sent, paid, overdue, thisMonthRevenue: thisMonth._sum.totalAmount || 0, usage };
  },
};

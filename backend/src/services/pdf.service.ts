import { prisma } from '../config/database';
import { s3Service } from './s3.service';
import { pdfFillService, generateScratchPdf, InvoiceData } from './pdf-fill.service';
import { type AnalysisResult, correctTableColumns } from './ai-analysis.service';
import { formatMoney } from '../utils/helpers';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';

// ─── Build normalised InvoiceData from a DB invoice ───────────────────────────

async function buildInvoiceData(invoiceId: string, workspaceId: string): Promise<{
  data: InvoiceData;
  invoice: Awaited<ReturnType<typeof fetchInvoice>>;
}> {
  const invoice = await fetchInvoice(invoiceId, workspaceId);
  const currency = invoice.currency || 'AUD';

  // If the stored total is $0 (e.g. draft not yet finalised), compute from line item amounts
  const storedTotal = Number(invoice.totalAmount);
  const computedTotal = invoice.lineItems.reduce((s, li) => s + Number(li.amount), 0);
  const effectiveTotal = storedTotal > 0 ? storedTotal : computedTotal;

  const storedSubtotal = Number(invoice.subtotal);
  const effectiveSubtotal = storedSubtotal > 0 ? storedSubtotal : computedTotal;

  const data: InvoiceData = {
    businessName: invoice.providerName || '',
    clientName: invoice.clientName || '',
    number: invoice.number || '',
    issueDate: invoice.issueDate.toLocaleDateString('en-AU'),
    dueDate: invoice.dueDate?.toLocaleDateString('en-AU') ?? '',
    totalAmount: formatMoney(effectiveTotal, currency),
    subtotal: formatMoney(effectiveSubtotal, currency),
    gstAmount: formatMoney(Number(invoice.gstAmount), currency),
    providerABN: invoice.providerABN || '',
    providerAddress: invoice.providerAddress || '',
    providerEmail: invoice.providerEmail || '',
    providerPhone: invoice.providerPhone || '',
    clientAddress: invoice.clientAddress || '',
    ndisNumber: invoice.ndisNumber || '',
    notes: invoice.notes || '',
    supportCoordinator: invoice.supportCoordinator || '',
    legalGuardian: invoice.legalGuardian || '',
    fiscalAgent: invoice.fiscalAgent || '',
    lineItems: invoice.lineItems.map((li) => ({
      description: li.description || '',
      serviceDate: li.serviceDate?.toLocaleDateString('en-AU') ?? '',
      startTime: li.startTime || '',
      endTime: li.endTime || '',
      hours: Number(li.hours).toFixed(2),
      rate: formatMoney(Number(li.rate), currency),
      amount: formatMoney(Number(li.amount), currency),
    })),
  };

  return { data, invoice };
}

async function fetchInvoice(invoiceId: string, workspaceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
    // Do NOT include template here — we fetch it separately using only the new fields
    include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!invoice) throw new NotFoundError('Invoice');
  return invoice;
}

// ─── Core generation ──────────────────────────────────────────────────────────

async function generatePdfBuffer(invoiceId: string, workspaceId: string, templateId?: string): Promise<Buffer> {
  const { data, invoice } = await buildInvoiceData(invoiceId, workspaceId);

  // Determine which template to use
  const resolvedTemplateId = templateId ?? invoice.templateId ?? null;
  let template: { originalPdfKey: string | null; analysisJson: unknown; fieldMappings: unknown } | null = null;

  if (resolvedTemplateId) {
    try {
      template = await prisma.template.findFirst({
        where: {
          id: resolvedTemplateId,
          analysisStatus: 'READY',
          OR: [{ scope: 'SYSTEM' }, { workspaceId }],
        },
        select: { originalPdfKey: true, analysisJson: true, fieldMappings: true },
      });
    } catch (err) {
      // Template table may not be migrated yet — fall back to scratch PDF
      logger.warn('Template fetch failed (run prisma db push?), using scratch PDF:', err);
    }
  }

  if (!template?.originalPdfKey || !template.fieldMappings) {
    // No AI template — generate a clean PDF from scratch
    logger.info(`Generating scratch PDF for invoice ${invoice.number}`);
    return generateScratchPdf(data);
  }

  // Load the original uploaded PDF from S3
  let originalPdfBuffer: Buffer;
  try {
    originalPdfBuffer = await s3Service.download(template.originalPdfKey);
  } catch (err) {
    logger.error('Failed to download original PDF template, falling back to scratch:', err);
    return generateScratchPdf(data);
  }

  // Build analysis object from stored JSON
  const rawTableConfig = (template.analysisJson as Record<string, unknown>)?.tableConfig as AnalysisResult['tableConfig'] ?? null;

  // Apply runtime column correction to fix any cached wrong mappings
  // (e.g. templates analyzed before Start/End time support was added)
  const correctedTableConfig = rawTableConfig
    ? { ...rawTableConfig, columns: correctTableColumns(rawTableConfig.columns) }
    : null;

  const analysis: Pick<AnalysisResult, 'pdfType' | 'fieldMappings' | 'tableConfig'> = {
    pdfType: (template.analysisJson as Record<string, unknown>)?.pdfType as 'acroform' | 'flat' ?? 'flat',
    fieldMappings: template.fieldMappings as AnalysisResult['fieldMappings'],
    tableConfig: correctedTableConfig,
  };

  return pdfFillService.fill(originalPdfBuffer, analysis, data);
}

// ─── Public service ───────────────────────────────────────────────────────────

export const pdfService = {
  async generateAndStore(invoiceId: string, workspaceId: string): Promise<string> {
    const { invoice } = await buildInvoiceData(invoiceId, workspaceId);
    const pdfBuffer = await generatePdfBuffer(invoiceId, workspaceId);

    const key = s3Service.generateKey(workspaceId, 'pdf', `invoice-${invoice.number}`);
    const pdfUrl = await s3Service.upload(pdfBuffer, key, 'application/pdf');

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { pdfUrl, pdfGeneratedAt: new Date() },
    });

    await prisma.usageTracking.upsert({
      where: { workspaceId },
      update: { pdfDownloads: { increment: 1 } },
      create: { workspaceId, pdfDownloads: 1 },
    });

    return pdfUrl;
  },

  async generateBuffer(invoiceId: string, workspaceId: string, templateId?: string): Promise<Buffer> {
    return generatePdfBuffer(invoiceId, workspaceId, templateId);
  },

  async trackDownload(workspaceId: string): Promise<void> {
    await prisma.usageTracking.upsert({
      where: { workspaceId },
      update: { pdfDownloads: { increment: 1 } },
      create: { workspaceId, pdfDownloads: 1 },
    });
  },
};

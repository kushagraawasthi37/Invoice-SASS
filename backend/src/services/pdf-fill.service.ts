import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
  PDFTextField,
  PDFCheckBox,
} from 'pdf-lib';
import { FieldMapping, TableConfig, AnalysisResult } from './ai-analysis.service';
import { logger } from '../utils/logger';

// ─── Invoice data shape ───────────────────────────────────────────────────────

export interface InvoiceData {
  businessName: string;
  clientName: string;
  number: string;
  issueDate: string;
  dueDate: string;
  totalAmount: string;
  subtotal: string;
  gstAmount: string;
  providerABN: string;
  providerAddress: string;
  providerEmail: string;
  providerPhone: string;
  clientAddress: string;
  ndisNumber: string;
  notes: string;
  supportCoordinator: string;
  legalGuardian: string;
  fiscalAgent: string;
  lineItems: Array<{
    description: string;
    serviceDate: string;
    startTime: string;
    endTime: string;
    hours: string;
    rate: string;
    amount: string;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFieldValue(mappedTo: string, data: InvoiceData): string {
  const map: Record<string, string> = {
    businessName: data.businessName,
    clientName: data.clientName,
    number: data.number,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    totalAmount: data.totalAmount,
    subtotal: data.subtotal,
    gstAmount: data.gstAmount,
    providerABN: data.providerABN,
    providerAddress: data.providerAddress,
    providerEmail: data.providerEmail,
    providerPhone: data.providerPhone,
    clientAddress: data.clientAddress,
    ndisNumber: data.ndisNumber,
    notes: data.notes,
    supportCoordinator: data.supportCoordinator,
    legalGuardian: data.legalGuardian,
    fiscalAgent: data.fiscalAgent,
  };
  return map[mappedTo] ?? '';
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars - 1) + '…';
}

function charWidth(font: PDFFont, text: string, size: number): number {
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    return text.length * size * 0.5;
  }
}

// Dynamically scale down font size so text fits within width
function fitFontSize(font: PDFFont, text: string, maxWidth: number, nominalSize: number): number {
  const actual = charWidth(font, text, nominalSize);
  if (actual <= maxWidth) return nominalSize;
  const scaled = Math.floor(nominalSize * (maxWidth / actual));
  return Math.max(6, scaled);
}

// ─── AcroForm fill ────────────────────────────────────────────────────────────

async function fillAcroForm(
  pdfDoc: PDFDocument,
  fieldMappings: FieldMapping[],
  data: InvoiceData,
): Promise<void> {
  const form = pdfDoc.getForm();

  // Fill scalar fields first
  for (const mapping of fieldMappings) {
    if (!mapping.acroFieldName || mapping.isLineItem || mapping.mappedTo === '_skip') continue;

    const value = getFieldValue(mapping.mappedTo, data);
    if (!value) continue;

    try {
      const field = form.getFieldMaybe(mapping.acroFieldName);
      if (!field) continue;

      if (field instanceof PDFTextField) {
        field.setText(value);
      } else if (field instanceof PDFCheckBox) {
        const lower = value.toLowerCase();
        if (lower === 'true' || lower === 'yes' || lower === '1') field.check();
      }
    } catch (err) {
      logger.debug(`Could not fill AcroForm field "${mapping.acroFieldName}":`, err);
    }
  }

  // Fill repeating row fields (line items)
  const lineItemMappings = fieldMappings.filter((m) => m.isLineItem && m.acroFieldName);
  const lineItemsByRow: Record<number, FieldMapping[]> = {};

  for (const mapping of lineItemMappings) {
    const match = mapping.acroFieldName!.match(/(\d+)/);
    const rowIndex = match ? parseInt(match[1], 10) - 1 : 0;
    if (!lineItemsByRow[rowIndex]) lineItemsByRow[rowIndex] = [];
    lineItemsByRow[rowIndex].push(mapping);
  }

  for (const [rowIdx, rowMappings] of Object.entries(lineItemsByRow)) {
    const lineItem = data.lineItems[parseInt(rowIdx, 10)];
    if (!lineItem) continue;

    for (const mapping of rowMappings) {
      const colKey = mapping.mappedTo.replace('lineItems[].', '') as keyof typeof lineItem;
      const value = lineItem[colKey] ?? '';
      if (!value || !mapping.acroFieldName) continue;
      try {
        const field = form.getFieldMaybe(mapping.acroFieldName);
        if (field && field instanceof PDFTextField) {
          field.setText(String(value));
        }
      } catch { /* skip */ }
    }
  }
}

// ─── Flat PDF overlay fill ────────────────────────────────────────────────────

async function fillFlatPdf(
  pdfDoc: PDFDocument,
  fieldMappings: FieldMapping[],
  tableConfig: TableConfig | null,
  data: InvoiceData,
): Promise<void> {
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const nominalSize = 9;

  // Draw a cell: white-out existing content, then overlay new text
  const fillCell = (
    page: PDFPage,
    x: number,
    y: number,
    width: number,
    value: string,
    useBold = false,
  ) => {
    const f = useBold ? boldFont : font;
    const fs = fitFontSize(f, value, width, nominalSize);
    const maxChars = Math.max(4, Math.floor(width / (fs * 0.58)));
    const txt = truncate(value, maxChars);

    // White-out backing rectangle (clear template placeholder)
    page.drawRectangle({
      x: x - 2,
      y: y - 3,
      width: width + 4,
      height: fs + 6,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    });

    page.drawText(txt, { x, y, size: fs, font: f, color: rgb(0, 0, 0), maxWidth: width });
  };

  // Compute the totals/footer boundary so line-item rows never overwrite it.
  // totalFields: scalar total/subtotal/gst mappings that have a fill position.
  const totalFields = fieldMappings.filter(
    (m) =>
      ['totalAmount', 'subtotal', 'gstAmount'].includes(m.mappedTo) &&
      m.fillY != null,
  );

  // For a given page, the safe bottom Y is just above the topmost total-field row.
  function safeBoundaryY(pageNum: number): number {
    const onPage = totalFields.filter((m) => (m.page ?? 1) === pageNum);
    if (onPage.length === 0) return 30; // default: stop 30 units from page bottom
    const topmost = Math.max(...onPage.map((m) => m.fillY!));
    return topmost + 16; // stay 16 units above the topmost total label
  }

  // STEP 1: Fill line-item table rows (drawn first so scalar totals overwrite if needed)
  if (tableConfig && data.lineItems.length > 0) {
    const pageIndex = tableConfig.page - 1;
    const page: PDFPage | undefined = pages[pageIndex];
    if (page) {
      const pageHeight = page.getSize().height;
      const bottomBoundary = safeBoundaryY(tableConfig.page);

      // Available vertical space between firstRowY and the boundary
      const availableHeight = Math.max(0, tableConfig.firstRowY - bottomBoundary);
      const rh = Math.max(14, tableConfig.rowHeight);
      const maxRows = Math.max(1, Math.floor(availableHeight / rh));

      logger.debug(
        `Flat fill: firstRowY=${tableConfig.firstRowY} bottomBoundary=${bottomBoundary} rh=${rh} maxRows=${maxRows}`,
      );

      let currentY = tableConfig.firstRowY;

      for (let rowIdx = 0; rowIdx < Math.min(data.lineItems.length, maxRows); rowIdx++) {
        // Safety check: stop before we'd collide with totals or page edge
        if (currentY - rh < bottomBoundary) break;
        if (currentY < 20 || currentY > pageHeight) break;

        const lineItem = data.lineItems[rowIdx];

        // White-out entire row band across all columns
        for (const col of tableConfig.columns) {
          page.drawRectangle({
            x: col.x - 2,
            y: currentY - rh + nominalSize + 2,
            width: col.width + 4,
            height: rh,
            color: rgb(1, 1, 1),
            borderWidth: 0,
          });
        }

        // Draw each column value with dynamic font sizing
        for (const col of tableConfig.columns) {
          const colKey = col.mappedTo.replace('lineItems[].', '') as keyof (typeof data.lineItems)[0];
          const value = String(lineItem[colKey] ?? '');
          if (!value) continue;

          const fs = fitFontSize(font, value, col.width, nominalSize);
          const maxChars = Math.max(4, Math.floor(col.width / (fs * 0.58)));

          page.drawText(
            truncate(value, maxChars),
            { x: col.x, y: currentY, size: fs, font, color: rgb(0, 0, 0), maxWidth: col.width },
          );
        }

        currentY -= rh;
      }

      // If there were more line items than could fit, log a warning
      if (data.lineItems.length > maxRows) {
        logger.warn(
          `Template can only fit ${maxRows} line items (${data.lineItems.length} supplied). ` +
          'Consider a template with more rows.',
        );
      }
    }
  }

  // STEP 2: Fill scalar fields (drawn after table rows so they sit on top)
  for (const mapping of fieldMappings) {
    if (
      mapping.isLineItem ||
      mapping.mappedTo === '_skip' ||
      mapping.fillX == null ||
      mapping.fillY == null
    ) continue;

    const value = getFieldValue(mapping.mappedTo, data);
    if (!value) continue;

    const pageIndex = (mapping.page ?? 1) - 1;
    const page: PDFPage | undefined = pages[pageIndex];
    if (!page) continue;

    const pageHeight = page.getSize().height;
    // Skip if fill position is outside reasonable page bounds
    if (mapping.fillY < 5 || mapping.fillY > pageHeight - 5) continue;

    fillCell(page, mapping.fillX, mapping.fillY, mapping.fillWidth ?? 180, value);
  }

  void boldFont;
}

// ─── Scratch PDF generator ────────────────────────────────────────────────────

export async function generateScratchPdf(data: InvoiceData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0, 0, 0);
  const grey = rgb(0.5, 0.5, 0.5);
  const accent = rgb(0.17, 0.37, 0.18); // #2c5f2e
  const lightGrey = rgb(0.95, 0.95, 0.95);

  const margin = 50;
  let y = height - margin;

  const text = (
    str: string,
    x: number,
    yPos: number,
    opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    page.drawText(str || '', {
      x,
      y: yPos,
      size: opts.size ?? 10,
      font: opts.f ?? font,
      color: opts.color ?? black,
    });
  };

  const line = (x1: number, y1: number, x2: number, y2: number, color = grey) => {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color });
  };

  // Header stripe
  page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: accent });
  text(data.businessName || 'Invoice', margin, height - 45, { size: 22, f: bold, color: rgb(1, 1, 1) });
  text('INVOICE', width - margin - 70, height - 35, { size: 18, f: bold, color: rgb(1, 1, 1) });
  text(`#${data.number}`, width - margin - 70, height - 52, { size: 10, color: rgb(0.9, 0.9, 0.9) });

  y = height - 115;

  // Provider / Client columns
  text('FROM', margin, y, { size: 8, f: bold, color: grey });
  text('TO', 300, y, { size: 8, f: bold, color: grey });
  y -= 14;
  text(data.businessName, margin, y, { size: 10, f: bold });
  text(data.clientName, 300, y, { size: 10, f: bold });
  y -= 13;
  if (data.providerAddress) text(data.providerAddress, margin, y, { size: 9, color: grey });
  if (data.clientAddress) text(data.clientAddress, 300, y, { size: 9, color: grey });
  y -= 12;
  if (data.providerABN) text(`ABN: ${data.providerABN}`, margin, y, { size: 9, color: grey });
  if (data.ndisNumber) text(`NDIS: ${data.ndisNumber}`, 300, y, { size: 9, color: grey });
  y -= 12;
  if (data.providerEmail) text(data.providerEmail, margin, y, { size: 9, color: grey });
  y -= 12;
  if (data.providerPhone) text(data.providerPhone, margin, y, { size: 9, color: grey });

  y -= 20;
  line(margin, y, width - margin, y, accent);
  y -= 12;

  // Invoice meta
  const metaItems: Array<[string, string]> = [
    ['Issue Date', data.issueDate],
    ['Due Date', data.dueDate],
  ];
  let mx = margin;
  for (const [label, val] of metaItems) {
    text(label, mx, y, { size: 8, f: bold, color: grey });
    text(val, mx, y - 12, { size: 10 });
    mx += 130;
  }

  y -= 35;
  line(margin, y, width - margin, y);
  y -= 5;

  // Table header
  const cols = [
    { label: 'Description', x: margin, w: 200 },
    { label: 'Date', x: margin + 205, w: 70 },
    { label: 'Hours', x: margin + 280, w: 50 },
    { label: 'Rate', x: margin + 335, w: 65 },
    { label: 'Amount', x: margin + 405, w: 80 },
  ];

  page.drawRectangle({ x: margin - 4, y: y - 4, width: width - margin * 2 + 8, height: 18, color: lightGrey });
  for (const col of cols) {
    text(col.label.toUpperCase(), col.x, y, { size: 8, f: bold, color: grey });
  }
  y -= 18;

  // Table rows — stop before totals area
  const totalsStart = 190; // approx y where totals block starts
  for (const li of data.lineItems) {
    if (y < totalsStart) break;
    const rowCols = [li.description, li.serviceDate, li.hours, li.rate, li.amount];
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const maxChars = Math.floor(col.w / 5.5);
      text(truncate(rowCols[i] ?? '', maxChars), col.x, y, { size: 9 });
    }
    y -= 16;
    line(margin, y + 2, width - margin, y + 2, rgb(0.9, 0.9, 0.9));
  }

  y -= 10;
  line(margin, y, width - margin, y, accent);
  y -= 14;

  // Totals block (right-aligned)
  const totRight = width - margin;
  const totLabelX = totRight - 140;
  const totValX = totRight - 5;

  const totRows: Array<[string, string, boolean]> = [
    ['Subtotal', data.subtotal, false],
    ['GST (10%)', data.gstAmount, false],
    ['TOTAL DUE', data.totalAmount, true],
  ];

  for (const [label, val, isTotal] of totRows) {
    text(label, totLabelX, y, {
      size: isTotal ? 10 : 9,
      f: isTotal ? bold : font,
      color: isTotal ? accent : grey,
    });
    const valStr = val || '';
    const valW = charWidth(isTotal ? bold : font, valStr, isTotal ? 11 : 9);
    text(valStr, totValX - valW, y, {
      size: isTotal ? 11 : 9,
      f: isTotal ? bold : font,
      color: isTotal ? accent : black,
    });
    y -= isTotal ? 16 : 13;
  }

  if (data.notes) {
    y -= 20;
    line(margin, y, width - margin, y);
    y -= 14;
    text('Notes', margin, y, { size: 8, f: bold, color: grey });
    y -= 13;
    text(data.notes, margin, y, { size: 9, color: grey });
  }

  // Footer
  page.drawRectangle({ x: 0, y: 0, width, height: 28, color: lightGrey });
  text('Generated by InvoiceFlow — invoiceflow.app', margin, 10, { size: 8, color: grey });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

// ─── Main fill entry point ────────────────────────────────────────────────────

export const pdfFillService = {
  async fill(
    originalPdfBuffer: Buffer,
    analysis: Pick<AnalysisResult, 'pdfType' | 'fieldMappings' | 'tableConfig'>,
    data: InvoiceData,
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.load(originalPdfBuffer, { ignoreEncryption: true });

    if (analysis.pdfType === 'acroform') {
      await fillAcroForm(pdfDoc, analysis.fieldMappings, data);
      try {
        pdfDoc.getForm().flatten();
      } catch {
        // Some PDFs resist flattening — leave interactive
      }
    } else {
      await fillFlatPdf(pdfDoc, analysis.fieldMappings, analysis.tableConfig, data);
    }

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
  },
};

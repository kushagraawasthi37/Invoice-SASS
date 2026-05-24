import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFDocument } from 'pdf-lib';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';
import Fuse from 'fuse.js';
import stringSimilarity from 'string-similarity';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface ReconstructedLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface AcroField {
  name: string;
  type: string;
  page: number;
  rect: [number, number, number, number];
}

export interface FieldMapping {
  label: string;
  mappedTo: string;
  confidence: number;
  acroFieldName?: string;
  fillX?: number;
  fillY?: number;
  fillWidth?: number;
  fillHeight?: number;
  page?: number;
  isLineItem?: boolean;
  correctedByUser?: boolean;
}

export interface TableConfig {
  page: number;
  headerY: number;
  firstRowY: number;
  rowHeight: number;
  columns: Array<{
    header: string;
    mappedTo: string;
    x: number;
    width: number;
  }>;
}

export interface AnalysisResult {
  pdfType: 'acroform' | 'flat';
  pageCount: number;
  acroFields: AcroField[];
  textItems: TextItem[];
  fieldMappings: FieldMapping[];
  tableConfig: TableConfig | null;
  fingerprint?: string;
}

interface MappingCorrection {
  label: string;
  mappedTo: string;
  correctedAt: string;
  confidence: number;
}

export interface MappingMemory {
  corrections: MappingCorrection[];
  version: number;
}

// ─── Semantic Field Map ───────────────────────────────────────────────────────

const LABEL_TO_FIELD: Record<string, string> = {
  // Provider / business
  'vendor name': 'businessName',
  'vendor': 'businessName',
  'business name': 'businessName',
  'company name': 'businessName',
  'company': 'businessName',
  'service provider': 'businessName',
  'provider name': 'businessName',
  'provider': 'businessName',
  'payee': 'businessName',
  'from': 'businessName',
  // Client
  'employer': 'clientName',
  'employer name': 'clientName',
  'customer': 'clientName',
  'customer name': 'clientName',
  'client': 'clientName',
  'client name': 'clientName',
  'participant': 'clientName',
  'participant name': 'clientName',
  'bill to': 'clientName',
  'billed to': 'clientName',
  'to': 'clientName',
  // Invoice number
  'invoice number': 'number',
  'invoice no': 'number',
  'invoice #': 'number',
  'invoice num': 'number',
  'reference number': 'number',
  'reference no': 'number',
  'ref no': 'number',
  'claim number': 'number',
  // Header dates (scalar — one per invoice)
  'invoice date': 'issueDate',
  'date of invoice': 'issueDate',
  'issue date': 'issueDate',
  'date issued': 'issueDate',
  'billing date': 'issueDate',
  'claim date': 'issueDate',
  'due date': 'dueDate',
  'payment due': 'dueDate',
  'payment due date': 'dueDate',
  // NOTE: bare "date" intentionally omitted from header fields —
  // in NDIS invoice tables "Date" almost always means the service date column.
  // Totals — scalar summary fields ONLY
  'total': 'totalAmount',
  'total amount': 'totalAmount',
  'total amount due': 'totalAmount',
  'total amount due for invoice': 'totalAmount',
  'amount due for invoice': 'totalAmount',   // explicit — NOT a per-row column
  'total due': 'totalAmount',
  'balance due': 'totalAmount',
  'grand total': 'totalAmount',
  'invoice total': 'totalAmount',
  'total payable': 'totalAmount',
  'subtotal': 'subtotal',
  'sub total': 'subtotal',
  'sub-total': 'subtotal',
  'net amount': 'subtotal',
  'gst': 'gstAmount',
  'gst amount': 'gstAmount',
  'tax': 'gstAmount',
  'tax amount': 'gstAmount',
  'vat': 'gstAmount',
  // Always skip — never autofill
  'signature': '_skip',
  'sign': '_skip',
  'authorized signature': '_skip',
  'employer signature': '_skip',
  'authorized rep signature': '_skip',
  'employer authorized rep signature': '_skip',
  'dept #': '_skip',
  'dept': '_skip',
  'department': '_skip',
  'approval': '_skip',
  'approved by': '_skip',
  // Identifiers
  'abn': 'providerABN',
  'australian business number': 'providerABN',
  'tax id': 'providerABN',
  'ndis number': 'ndisNumber',
  'ndis #': 'ndisNumber',
  'ndis no': 'ndisNumber',
  'participant ndis number': 'ndisNumber',
  // Contact
  'email': 'providerEmail',
  'email address': 'providerEmail',
  'phone': 'providerPhone',
  'phone number': 'providerPhone',
  'telephone': 'providerPhone',
  'address': 'providerAddress',
  'provider address': 'providerAddress',
  'business address': 'providerAddress',
  'mailing address': 'providerAddress',
  'vendor mailing address': 'providerAddress',
  'vendor address': 'providerAddress',
  'client address': 'clientAddress',
  'participant address': 'clientAddress',
  'employer address': 'clientAddress',
  // Start time columns (shift start)
  'start': 'lineItems[].startTime',
  'start time': 'lineItems[].startTime',
  'start tm': 'lineItems[].startTime',
  'time start': 'lineItems[].startTime',
  'shift start': 'lineItems[].startTime',
  'time in': 'lineItems[].startTime',
  'time from': 'lineItems[].startTime',
  'from time': 'lineItems[].startTime',
  'begin': 'lineItems[].startTime',
  'begin time': 'lineItems[].startTime',
  'commenced': 'lineItems[].startTime',
  // End time columns (shift end)
  'end': 'lineItems[].endTime',
  'end time': 'lineItems[].endTime',
  'end tm': 'lineItems[].endTime',
  'time end': 'lineItems[].endTime',
  'shift end': 'lineItems[].endTime',
  'time out': 'lineItems[].endTime',
  'time to': 'lineItems[].endTime',
  'to time': 'lineItems[].endTime',
  'finish': 'lineItems[].endTime',
  'finish time': 'lineItems[].endTime',
  'finished': 'lineItems[].endTime',
  // Line-item columns (table rows)
  'description': 'lineItems[].description',
  'item description': 'lineItems[].description',
  'service description': 'lineItems[].description',
  'service code description': 'lineItems[].description',
  'service code': 'lineItems[].description',
  'goods or services': 'lineItems[].description',
  'goods services': 'lineItems[].description',
  'details': 'lineItems[].description',
  'item': 'lineItems[].description',
  'service': 'lineItems[].description',
  // Service date (table column)
  'date': 'lineItems[].serviceDate',
  'dates': 'lineItems[].serviceDate',
  'service date': 'lineItems[].serviceDate',
  'service dates': 'lineItems[].serviceDate',
  'date of service': 'lineItems[].serviceDate',
  'dates of service': 'lineItems[].serviceDate',
  'service period': 'lineItems[].serviceDate',
  'shift date': 'lineItems[].serviceDate',
  'date of shift': 'lineItems[].serviceDate',
  'delivery date': 'lineItems[].serviceDate',
  // Hours / quantity
  'hours': 'lineItems[].hours',
  'quantity': 'lineItems[].hours',
  'qty': 'lineItems[].hours',
  'units': 'lineItems[].hours',
  'hrs': 'lineItems[].hours',
  'no of hours': 'lineItems[].hours',
  // Rate
  'rate': 'lineItems[].rate',
  'unit price': 'lineItems[].rate',
  'hourly rate': 'lineItems[].rate',
  'price': 'lineItems[].rate',
  'unit rate': 'lineItems[].rate',
  'cost per hour': 'lineItems[].rate',
  // Per-row amount (distinct from invoice totalAmount)
  'amount': 'lineItems[].amount',
  'amount due': 'lineItems[].amount',
  'line total': 'lineItems[].amount',
  'line amount': 'lineItems[].amount',
  'service cost': 'lineItems[].amount',
  'cost': 'lineItems[].amount',
  'ext': 'lineItems[].amount',
  'extension': 'lineItems[].amount',
  'charge': 'lineItems[].amount',
};

// Labels that are always scalar totals — never line-item columns
const SCALAR_TOTAL_LABELS = new Set([
  'grand total', 'total amount due', 'total amount due for invoice',
  'invoice total', 'balance due', 'total payable', 'amount due for invoice',
  'total due', 'total amount', 'total',
]);

// ─── Matching Engine ──────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the', 'a', 'an', 'for', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'is',
  'are', 'was', 'be', 'by', 'with', 'as', 'per', 'no', 'this', 'that', 'from',
  'it', 'its', 'your', 'our', 'please', 'enter', 'field', 'below',
]);

const KEYWORD_WEIGHTS: Record<string, number> = {
  invoice: 1.8, vendor: 1.8, business: 1.5, client: 1.5, participant: 1.5,
  total: 1.8, amount: 1.4, date: 1.4, service: 1.4, description: 1.3,
  due: 1.3, grand: 1.5, balance: 1.5, subtotal: 1.8, gst: 2.0, tax: 1.5,
  hours: 1.5, rate: 1.5, abn: 2.0, ndis: 2.0, number: 1.3, address: 1.3,
  name: 1.3, email: 1.5, phone: 1.5, provider: 1.5, payee: 1.5,
  quantity: 1.3, qty: 1.5, hrs: 1.5, unit: 1.3, code: 1.2, shift: 1.3,
  start: 1.8, end: 1.8, time: 1.5, finish: 1.6, begin: 1.6,
};

// Semantic penalty: if one string has one word from a pair but not the other
const SEMANTIC_PENALTY_PAIRS: Array<[string, string]> = [
  ['grand', 'line'],
  ['invoice', 'service'],
  ['due', 'issue'],
  ['sub', 'grand'],
  ['issue', 'service'],
  ['balance', 'unit'],
];

export const SIMILARITY_THRESHOLD = 0.82;

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function calculateLabelSimilarity(a: string, b: string): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);

  if (normA === normB) return 1.0;

  const tokA = tokenize(a);
  const tokB = tokenize(b);

  if (tokA.length === 0 || tokB.length === 0) return 0;

  const setA = new Set(tokA);
  const setB = new Set(tokB);

  // Jaccard similarity on token sets
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  const jaccard = intersection.size / union.size;

  // Weighted keyword scoring
  let wA = 0, wB = 0, wIntersect = 0;
  for (const t of setA) wA += KEYWORD_WEIGHTS[t] ?? 1.0;
  for (const t of setB) wB += KEYWORD_WEIGHTS[t] ?? 1.0;
  for (const t of intersection) wIntersect += KEYWORD_WEIGHTS[t] ?? 1.0;
  const wUnion = wA + wB - wIntersect;
  const weightedScore = wUnion > 0 ? wIntersect / wUnion : 0;

  // String-level Dice coefficient (character bigrams) via string-similarity
  const diceSim = stringSimilarity.compareTwoStrings(normA, normB);

  // Phrase bonus: if one string contains the other as a substring
  let phraseBonus = 0;
  if (normA.includes(normB) || normB.includes(normA)) {
    const shorter = Math.min(normA.length, normB.length);
    const longer = Math.max(normA.length, normB.length);
    phraseBonus = 0.06 * (shorter / longer);
  }

  // Semantic penalties for cross-domain confusion
  let penalty = 0;
  for (const [w1, w2] of SEMANTIC_PENALTY_PAIRS) {
    const aHas1 = setA.has(w1), aHas2 = setA.has(w2);
    const bHas1 = setB.has(w1), bHas2 = setB.has(w2);
    if (aHas1 !== bHas1 && (aHas2 || bHas2)) penalty += 0.12;
    if (aHas2 !== bHas2 && (aHas1 || bHas1)) penalty += 0.12;
  }

  const base = jaccard * 0.30 + weightedScore * 0.50 + diceSim * 0.20;
  return Math.max(0, Math.min(1, base + phraseBonus - penalty));
}

// Fuse.js index over LABEL_TO_FIELD keys for fuzzy label lookups
const _fuseItems = Object.keys(LABEL_TO_FIELD).map((key) => ({ key }));
const _fuse = new Fuse(_fuseItems, {
  keys: ['key'],
  includeScore: true,
  threshold: 0.35,
  minMatchCharLength: 2,
});

function isAlwaysSkip(label: string): boolean {
  const norm = normalizeText(label);
  if (norm.includes('signature')) return true;
  if (norm === 'sign') return true;
  if (/\bdept\b/.test(norm)) return true;
  if (norm.includes('department')) return true;
  if (/\bapproval\b/.test(norm) || /\bapproved\b/.test(norm)) return true;
  return false;
}

function isScalarTotalLabel(text: string): boolean {
  const norm = normalizeText(text);
  if (SCALAR_TOTAL_LABELS.has(norm)) return true;
  const hasTotal = /\btotal\b/.test(norm) || /\bbalance\b/.test(norm);
  const hasAmount = /\bamount\b/.test(norm) || /\bdue\b/.test(norm);
  const hasGrand = /\bgrand\b/.test(norm);
  return hasTotal && (hasAmount || hasGrand);
}

function matchLabel(label: string): { field: string; confidence: number } | null {
  if (isAlwaysSkip(label)) return { field: '_skip', confidence: 0.95 };

  const norm = normalizeText(label);

  // 1. Exact lookup
  if (LABEL_TO_FIELD[norm]) return { field: LABEL_TO_FIELD[norm], confidence: 1.0 };

  // 2. Similarity matching against all LABEL_TO_FIELD keys
  let bestField = '';
  let bestScore = 0;
  for (const [key, field] of Object.entries(LABEL_TO_FIELD)) {
    const score = calculateLabelSimilarity(norm, key);
    if (score > bestScore) {
      bestScore = score;
      bestField = field;
    }
  }
  if (bestScore >= SIMILARITY_THRESHOLD) return { field: bestField, confidence: bestScore };

  // 3. Fuse.js fallback for very short / partial labels
  if (norm.length <= 20) {
    const fuseResults = _fuse.search(norm);
    if (fuseResults.length > 0 && fuseResults[0].score !== undefined && fuseResults[0].score < 0.25) {
      const matchedKey = fuseResults[0].item.key;
      const fuseConf = Math.max(SIMILARITY_THRESHOLD, 1 - fuseResults[0].score);
      return { field: LABEL_TO_FIELD[matchedKey], confidence: fuseConf };
    }
  }

  return null;
}

// ─── Text Reconstruction ──────────────────────────────────────────────────────

export function reconstructTextLines(items: TextItem[]): ReconstructedLine[] {
  if (items.length === 0) return [];

  // Group by page
  const byPage = new Map<number, TextItem[]>();
  for (const item of items) {
    if (!byPage.has(item.page)) byPage.set(item.page, []);
    byPage.get(item.page)!.push(item);
  }

  const lines: ReconstructedLine[] = [];

  for (const [page, pageItems] of byPage) {
    // Group by y with tolerance of 4 PDF units = same visual line
    const yGroups = new Map<number, TextItem[]>();
    for (const item of pageItems) {
      let foundY: number | null = null;
      for (const gy of yGroups.keys()) {
        if (Math.abs(item.y - gy) <= 4) { foundY = gy; break; }
      }
      const key = foundY ?? item.y;
      if (!yGroups.has(key)) yGroups.set(key, []);
      yGroups.get(key)!.push(item);
    }

    for (const [, group] of yGroups) {
      // Sort by x position within the line
      const sorted = group.slice().sort((a, b) => a.x - b.x);
      const merged: ReconstructedLine[] = [];

      for (const item of sorted) {
        const last = merged[merged.length - 1];
        const mergeThreshold = Math.max(8, (item.height || 10) * 0.6);

        if (last && item.x - (last.x + last.width) < mergeThreshold && Math.abs(item.y - last.y) <= 4) {
          const gap = item.x - (last.x + last.width);
          last.text += (gap > 2 ? ' ' : '') + item.text;
          last.width = item.x + (item.width || item.text.length * 5) - last.x;
          last.height = Math.max(last.height, item.height || 10);
        } else {
          merged.push({
            text: item.text,
            x: item.x,
            y: item.y,
            width: item.width || item.text.length * 5,
            height: item.height || 10,
            page,
          });
        }
      }

      lines.push(...merged);
    }
  }

  return lines;
}

// ─── Scanned PDF Detection ────────────────────────────────────────────────────

function isScannedPdf(extractedItems: TextItem[], pageCount: number): boolean {
  const avgItemsPerPage = extractedItems.length / Math.max(1, pageCount);
  if (avgItemsPerPage < 5) return true;
  if (extractedItems.length < 10) return true;
  const avgTextLen = extractedItems.reduce((s, i) => s + i.text.length, 0) / Math.max(1, extractedItems.length);
  if (avgTextLen < 2) return true;
  return false;
}

function shouldRunOcr(extractedItems: TextItem[], fieldMappings: FieldMapping[], pageCount: number): boolean {
  if (isScannedPdf(extractedItems, pageCount)) return true;
  if (extractedItems.length < 15) return true;
  const goodMappings = fieldMappings.filter((m) => m.mappedTo !== '_skip' && m.confidence >= 0.7).length;
  if (goodMappings < 2 && extractedItems.length < 30) return true;
  return false;
}

// ─── OCR Pipeline ────────────────────────────────────────────────────────────

async function runOcrOnPdf(pdfBuffer: Buffer): Promise<TextItem[]> {
  const items: TextItem[] = [];

  try {
    // Dynamic import of pdfjs-dist ESM (v5 is ESM-only)
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';

    // Try to get canvas — fall back to image-extraction if not available
    let createCanvasFn: ((w: number, h: number) => unknown) | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const canvasMod = require('canvas');
      createCanvasFn = canvasMod.createCanvas as (w: number, h: number) => unknown;
    } catch {
      // canvas native module not compiled — skip canvas-based rendering
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('eng', 1, { logger: () => {} });

    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
    const pdfDoc = await loadingTask.promise;
    const numPages = Math.min(pdfDoc.numPages, 8);

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const naturalVp = page.getViewport({ scale: 1.0 });
        const pdfPageHeight = naturalVp.height;

        let ocrImageData: { data: Uint8Array | Uint8ClampedArray; width: number; height: number } | string | null = null;

        if (createCanvasFn) {
          // Render page to canvas at 2x scale for better OCR accuracy
          const scale = 2.0;
          const viewport = page.getViewport({ scale });
          const canvas = createCanvasFn(Math.ceil(viewport.width), Math.ceil(viewport.height)) as {
            getContext(t: string): unknown;
            toBuffer(fmt: string): Buffer;
            width: number;
            height: number;
          };
          const context = canvas.getContext('2d');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await page.render({ canvasContext: context as any, canvas: canvas as any, viewport }).promise;
          ocrImageData = canvas.toBuffer('image/png') as unknown as string;
        } else {
          // No canvas: try to extract embedded images directly from page operators
          const ops = await page.getOperatorList();
          for (let i = 0; i < ops.fnArray.length; i++) {
            if (ops.fnArray[i] === pdfjsLib.OPS.paintImageXObject) {
              try {
                const imgName = ops.argsArray[i][0] as string;
                // Fetch the image object (pdfjs loads it on render; try common objs first)
                const imgObj = page.commonObjs.has(imgName)
                  ? await page.commonObjs.get(imgName)
                  : null;
                if (imgObj && imgObj.data && imgObj.width && imgObj.height) {
                  ocrImageData = {
                    data: imgObj.data as Uint8ClampedArray,
                    width: imgObj.width as number,
                    height: imgObj.height as number,
                  };
                  break;
                }
              } catch {
                // skip this image op
              }
            }
          }
        }

        if (!ocrImageData) continue;

        const recognizeResult = await worker.recognize(ocrImageData);
        const ocrData = recognizeResult.data;
        const scale = createCanvasFn ? 2.0 : 1.0;

        for (const line of ocrData.lines) {
          for (const word of line.words) {
            if ((word.confidence as number) > 40 && word.text.trim()) {
              const pdfX = word.bbox.x0 / scale;
              const pdfY = pdfPageHeight - word.bbox.y1 / scale;
              const w = (word.bbox.x1 - word.bbox.x0) / scale;
              const h = (word.bbox.y1 - word.bbox.y0) / scale;
              items.push({
                text: word.text.trim(),
                x: Math.round(pdfX),
                y: Math.round(pdfY),
                width: Math.round(w),
                height: Math.round(h),
                page: pageNum,
              });
            }
          }
        }
      } catch (pageErr) {
        logger.warn(`OCR page ${pageNum} failed:`, pageErr);
      }
    }

    await worker.terminate();
  } catch (err) {
    logger.warn('OCR pipeline unavailable (canvas not compiled?):', (err as Error).message);
  }

  return items;
}

// ─── Text Extraction via pdf-parse ───────────────────────────────────────────

interface PageRenderData {
  getTextContent(): Promise<{
    items: Array<{ str: string; transform: number[]; width: number; height: number }>;
  }>;
  pageNumber: number;
}

async function extractTextItems(pdfBuffer: Buffer): Promise<TextItem[]> {
  const items: TextItem[] = [];
  let currentPage = 0;

  await pdfParse(pdfBuffer, {
    pagerender: async (pageData: PageRenderData) => {
      currentPage = pageData.pageNumber;
      try {
        const textContent = await pageData.getTextContent();
        for (const item of textContent.items) {
          if (item.str.trim()) {
            items.push({
              text: item.str,
              x: Math.round(item.transform[4]),
              y: Math.round(item.transform[5]),
              width: Math.round(item.width),
              height: Math.round(item.height || 10),
              page: currentPage,
            });
          }
        }
      } catch {
        // skip broken page
      }
      return '';
    },
  });

  return items;
}

// ─── AcroForm Extraction ─────────────────────────────────────────────────────

async function extractAcroFields(pdfBuffer: Buffer): Promise<AcroField[]> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    return fields.map((field) => ({
      name: field.getName(),
      type: field.constructor.name.toLowerCase().replace('pdf', '').replace('field', ''),
      page: 1,
      rect: [0, 0, 0, 0] as [number, number, number, number],
    }));
  } catch {
    return [];
  }
}

// ─── Table Detection ──────────────────────────────────────────────────────────

function detectTables(lines: ReconstructedLine[], pageCount: number): TableConfig | null {
  // Find all lines that match a line-item column header
  const potentialHeaders: Array<{ line: ReconstructedLine; mappedTo: string; confidence: number }> = [];

  for (const line of lines) {
    // Scalar totals are never table columns
    if (isScalarTotalLabel(line.text)) continue;

    const match = matchLabel(line.text);
    if (match && match.field.startsWith('lineItems[].') && match.confidence >= SIMILARITY_THRESHOLD) {
      potentialHeaders.push({ line, mappedTo: match.field, confidence: match.confidence });
    }
  }

  if (potentialHeaders.length < 2) return null;

  // Group potential headers by page
  const byPage = new Map<number, typeof potentialHeaders>();
  for (const h of potentialHeaders) {
    if (!byPage.has(h.line.page)) byPage.set(h.line.page, []);
    byPage.get(h.line.page)!.push(h);
  }

  let bestTable: TableConfig | null = null;
  let bestColumnCount = 0;

  for (const [page, headers] of byPage) {
    // Group headers by approximate y (within 15 units = same row)
    const yGroups = new Map<number, typeof headers>();
    for (const h of headers) {
      let foundY: number | null = null;
      for (const gy of yGroups.keys()) {
        if (Math.abs(h.line.y - gy) < 15) { foundY = gy; break; }
      }
      const key = foundY ?? h.line.y;
      if (!yGroups.has(key)) yGroups.set(key, []);
      yGroups.get(key)!.push(h);
    }

    for (const [headerY, headerRow] of yGroups) {
      if (headerRow.length < 2) continue;

      const sortedCols = headerRow.slice().sort((a, b) => a.line.x - b.line.x);

      // Deduplicate columns at nearly identical x positions
      const dedupedCols = sortedCols.filter((h, i) =>
        i === 0 || h.line.x - sortedCols[i - 1].line.x > 20,
      );
      if (dedupedCols.length < 2) continue;

      // Build column widths from gap to next column
      const columns = dedupedCols.map((h, i) => {
        const nextX = dedupedCols[i + 1]?.line.x;
        const width = nextX != null ? Math.max(40, nextX - h.line.x - 4) : 150;
        return { header: h.line.text, mappedTo: h.mappedTo, x: h.line.x, width };
      });

      // Find scalar-total boundary (y of topmost total label on this page)
      const pageLines = lines.filter((l) => l.page === page);
      const scalarTotals = pageLines.filter((l) => isScalarTotalLabel(l.text));
      // Totals are below the data rows (smaller y in PDF coords)
      const totalsTopY = scalarTotals.length > 0
        ? Math.max(...scalarTotals.map((l) => l.y))
        : 0;

      // Data rows: below header row AND above totals, aligning with column positions
      const dataItems = pageLines.filter((l) =>
        l.y < headerY - 4 &&                  // below header (smaller y)
        l.y > totalsTopY &&                   // above totals area
        !isScalarTotalLabel(l.text) &&
        columns.some((c) => Math.abs(l.x - c.x) < Math.min(c.width * 0.55, 55)),
      );

      // Group into distinct rows by y proximity
      const rowYs: number[] = [];
      for (const item of dataItems) {
        if (!rowYs.some((gy) => Math.abs(gy - item.y) < 6)) rowYs.push(item.y);
      }
      rowYs.sort((a, b) => b - a); // descending (closest to header first)

      // Need at least 1 data row to confirm table
      if (rowYs.length < 1) continue;

      // Require geometry evidence: columns must be distinct and spread across width
      const columnSpan = columns[columns.length - 1].x - columns[0].x;
      if (columnSpan < 40) continue;

      const firstRowY = rowYs[0];
      const rowHeight = rowYs.length >= 2
        ? Math.max(14, Math.min(60, rowYs[0] - rowYs[1]))
        : 22;

      if (columns.length > bestColumnCount) {
        bestColumnCount = columns.length;
        bestTable = { page, headerY, firstRowY, rowHeight, columns };
      }
    }
  }

  void pageCount;
  return bestTable;
}

// ─── Heuristic Field Mapping ──────────────────────────────────────────────────

function heuristicMapAcroFields(fields: AcroField[]): FieldMapping[] {
  // Build a Fuse index over field names for fuzzy matching of cryptic AcroForm names
  const fieldItems = fields.map((f) => ({ name: f.name }));
  const acrFuse = new Fuse(fieldItems, {
    keys: ['name'],
    includeScore: true,
    threshold: 0.4,
    minMatchCharLength: 2,
  });

  return fields
    .map((f): FieldMapping | null => {
      const match = matchLabel(f.name);
      if (match) {
        return {
          label: f.name,
          mappedTo: match.field,
          confidence: match.confidence * 0.85,
          acroFieldName: f.name,
          page: f.page,
          isLineItem: match.field.startsWith('lineItems[].'),
        };
      }

      // Try treating the field name parts as separate words (e.g. "VendName" → "Vend Name")
      const spacedName = f.name.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
      const spaceMatch = matchLabel(spacedName);
      if (spaceMatch) {
        return {
          label: f.name,
          mappedTo: spaceMatch.field,
          confidence: spaceMatch.confidence * 0.80,
          acroFieldName: f.name,
          page: f.page,
          isLineItem: spaceMatch.field.startsWith('lineItems[].'),
        };
      }

      // Fuse.js fallback for abbreviated names
      const fuseRes = acrFuse.search(normalizeText(f.name));
      if (fuseRes.length > 0 && fuseRes[0].score !== undefined && fuseRes[0].score < 0.3) {
        const m = matchLabel(fuseRes[0].item.name);
        if (m) {
          return {
            label: f.name,
            mappedTo: m.field,
            confidence: m.confidence * 0.70,
            acroFieldName: f.name,
            page: f.page,
            isLineItem: m.field.startsWith('lineItems[].'),
          };
        }
      }

      return null;
    })
    .filter((f): f is FieldMapping => f !== null);
}

function heuristicMapTextLines(lines: ReconstructedLine[]): {
  fieldMappings: FieldMapping[];
  tableConfig: TableConfig | null;
} {
  const fieldMappings: FieldMapping[] = [];
  const sorted = [...lines].sort((a, b) =>
    a.page !== b.page ? a.page - b.page : b.y - a.y,
  );

  for (let i = 0; i < sorted.length; i++) {
    const line = sorted[i];
    const match = matchLabel(line.text);
    if (!match) continue;
    if (match.field.startsWith('lineItems[].')) continue; // handled by detectTables
    if (match.field === '_skip') continue;

    // Estimate fill position: look for adjacent items on same line (to the right)
    const sameLine = sorted.filter(
      (l) => l.page === line.page && Math.abs(l.y - line.y) < 5 && l.x > line.x + line.width,
    ).sort((a, b) => a.x - b.x);

    let fillX: number;
    const fillY = line.y;
    const fillWidth = 180;

    if (sameLine.length > 0) {
      fillX = sameLine[0].x + sameLine[0].width + 4;
    } else {
      fillX = line.x + line.width + 8;
    }

    // Avoid duplicate mappedTo (keep highest confidence)
    const existing = fieldMappings.find((m) => m.mappedTo === match.field);
    if (existing) {
      if (match.confidence * 0.75 > existing.confidence) {
        existing.label = line.text;
        existing.confidence = match.confidence * 0.75;
        existing.fillX = fillX;
        existing.fillY = fillY;
        existing.fillWidth = fillWidth;
        existing.page = line.page;
      }
      continue;
    }

    fieldMappings.push({
      label: line.text,
      mappedTo: match.field,
      confidence: match.confidence * 0.75,
      fillX,
      fillY,
      fillWidth,
      page: line.page,
      isLineItem: false,
    });
  }

  const pageCount = lines.length > 0 ? Math.max(...lines.map((l) => l.page)) : 1;
  const tableConfig = detectTables(sorted, pageCount);

  return { fieldMappings, tableConfig };
}

// ─── Safe JSON Parser ─────────────────────────────────────────────────────────

export function safeJsonParse<T>(input: string): T | null {
  if (!input || !input.trim()) return null;

  let cleaned = input.trim();

  // Strip markdown fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  // Attempt 1: direct parse
  try { return JSON.parse(cleaned) as T; } catch { /* continue */ }

  // Attempt 2: fix trailing commas
  const fixedCommas = cleaned.replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(fixedCommas) as T; } catch { /* continue */ }

  // Attempt 3: extract outermost { } or [ ]
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startChar = -1, endChar = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startChar = firstBrace;
    endChar = cleaned.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startChar = firstBracket;
    endChar = cleaned.lastIndexOf(']');
  }

  if (startChar !== -1 && endChar > startChar) {
    const extracted = cleaned.slice(startChar, endChar + 1);
    try { return JSON.parse(extracted) as T; } catch { /* continue */ }

    // Attempt 4: truncate at last valid comma and close the structure
    const lastComma = extracted.lastIndexOf(',');
    if (lastComma > 0) {
      const partial = extracted.slice(0, lastComma) + extracted.slice(-1);
      try { return JSON.parse(partial) as T; } catch { /* continue */ }
    }
  }

  return null;
}

// ─── AI Provider (Gemini) ─────────────────────────────────────────────────────

function hasGemini(): boolean {
  return !!env.GEMINI_API_KEY;
}

async function askGemini(prompt: string): Promise<string> {
  if (!env.GEMINI_API_KEY) return '';

  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

  // Primary: Gemini 2.5 Flash
  for (const modelName of ['gemini-2.5-flash', 'gemini-1.5-flash']) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.05, responseMimeType: 'application/json' },
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      logger.warn(`Gemini ${modelName} failed:`, err);
    }
  }

  return '';
}

// ─── AI Prompt Builder ────────────────────────────────────────────────────────

function buildSemanticLayout(lines: ReconstructedLine[], tableConfig: TableConfig | null): string {
  let layout = '';

  const byPage = new Map<number, ReconstructedLine[]>();
  for (const line of lines) {
    if (!byPage.has(line.page)) byPage.set(line.page, []);
    byPage.get(line.page)!.push(line);
  }

  for (const [page, pageLines] of byPage) {
    layout += `[Page ${page}]\n`;
    // Sort top-to-bottom (largest y first in PDF coordinates)
    const sorted = pageLines.slice().sort((a, b) => b.y - a.y);
    for (const line of sorted.slice(0, 60)) {
      const dots = '.'.repeat(Math.max(2, 22 - Math.min(20, line.text.length)));
      layout += `${line.text} ${dots} [x:${line.x} y:${Math.round(line.y)}]\n`;
    }
    layout += '\n';
  }

  if (tableConfig) {
    layout += '[Detected Table]\n';
    layout += `page:${tableConfig.page} headerY:${Math.round(tableConfig.headerY)} firstRowY:${Math.round(tableConfig.firstRowY)} rowHeight:${Math.round(tableConfig.rowHeight)}\n`;
    layout += 'Columns: ' + tableConfig.columns.map((c) => `${c.header}(x:${c.x})`).join(' | ') + '\n';
  }

  return layout;
}

// ─── AI AcroForm Mapping ──────────────────────────────────────────────────────

interface AiAcroMapping {
  acroFieldName: string;
  mappedTo: string;
  confidence: number;
}

async function aiMapAcroFields(fieldNames: string[]): Promise<AiAcroMapping[]> {
  if (!hasGemini() || fieldNames.length === 0) return [];

  const prompt = `You are a document AI. Map these PDF AcroForm field names to invoice data fields.

Field names: ${fieldNames.join(', ')}

Available invoice fields:
businessName, clientName, number, issueDate, dueDate, totalAmount, subtotal, gstAmount,
providerABN, providerAddress, providerEmail, providerPhone, clientAddress, ndisNumber,
lineItems[].description, lineItems[].serviceDate, lineItems[].startTime, lineItems[].endTime,
lineItems[].hours, lineItems[].rate, lineItems[].amount,
notes, supportCoordinator, legalGuardian, fiscalAgent

Critical rules:
- "Date", "Dates of Service", "Service Date" as TABLE COLUMN → lineItems[].serviceDate (NOT issueDate)
- "Invoice Date", "Issue Date" as HEADER FIELD → issueDate
- "Start", "Start Time", "Time In", "Begin", "From" as TABLE COLUMN → lineItems[].startTime (NOT description)
- "End", "End Time", "Time Out", "Finish", "To" as TABLE COLUMN → lineItems[].endTime (NOT hours)
- "Amount", "Amount Due" as TABLE COLUMN HEADER → lineItems[].amount (NOT totalAmount)
- "Total Amount Due", "Grand Total", "Balance Due" → totalAmount (scalar)
- Signature fields, Dept #, Department, Approval → "_skip"
- Repeating row fields (Row1_X, Line2_Y) → use lineItems[].fieldName
- NEVER map "Start" or "End" columns to description, hours, or rate

Return JSON: {"mappings":[{"acroFieldName":"VendorName","mappedTo":"businessName","confidence":0.97}]}`;

  const raw = await askGemini(prompt);
  if (!raw) return [];

  const parsed = safeJsonParse<{ mappings?: AiAcroMapping[] } | AiAcroMapping[]>(raw);
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  return (parsed as { mappings?: AiAcroMapping[] }).mappings || [];
}

// ─── AI Flat PDF Mapping ──────────────────────────────────────────────────────

interface AiFlatField {
  label: string;
  mappedTo: string;
  fillX: number;
  fillY: number;
  fillWidth: number;
  page: number;
  confidence: number;
}

interface AiFlatResult {
  fields: AiFlatField[];
  tableConfig?: TableConfig;
}

async function aiMapFlatPdfLayout(layout: string): Promise<AiFlatResult> {
  if (!hasGemini()) return { fields: [] };

  const prompt = `You are a document AI analyzing a flat (non-fillable) PDF invoice or payment form.

COORDINATE SYSTEM: x=0 is left, y=0 is BOTTOM of page (y increases upward). A4 = ~842 units tall.
- Top of page: large y (e.g. y=780)
- Table header row: medium y (e.g. y=450)
- Table data rows go DOWNWARD (each row has a SMALLER y than the one above)
- Totals/footer at the bottom: very small y (e.g. y=80-200)

Structured layout:
${layout}

TASK 1 — Scalar header fields (one value per invoice):
businessName, clientName, number, issueDate, dueDate, totalAmount, subtotal, gstAmount,
providerABN, providerAddress, providerEmail, providerPhone, clientAddress, ndisNumber,
notes, supportCoordinator, legalGuardian, fiscalAgent

For each label found, determine where its VALUE should be drawn:
- Value RIGHT of label on same line: fillX = label_x + label_width + 10, fillY = label_y
- Value BELOW label: fillX = label_x, fillY = label_y - 16
- fillWidth: estimated width of the value area (typically 100-220 PDF units)

TASK 2 — Line-item table (repeating rows):
Available column types:
  lineItems[].serviceDate  — the calendar date of the service shift (e.g. "18/05/2026")
  lineItems[].startTime    — the clock time the shift STARTED (e.g. "07:30", "09:00")
  lineItems[].endTime      — the clock time the shift ENDED (e.g. "10:00", "17:30")
  lineItems[].description  — free-text description of the service provided
  lineItems[].hours        — numeric duration in hours (e.g. 2.50, 3.25)
  lineItems[].rate         — dollar rate per hour (e.g. "$68.00", "72.00")
  lineItems[].amount       — total dollar amount for the row (e.g. "$170.00")

══════════════════════════════════════════════════════════════════
NDIS INVOICE COLUMN MAPPING — MEMORISE THESE (highest priority):
  Column "Date"            → lineItems[].serviceDate
  Column "Start"           → lineItems[].startTime    ← TIME, NOT description
  Column "End"             → lineItems[].endTime       ← TIME, NOT hours
  Column "Description"     → lineItems[].description
  Column "Hours" / "Hrs"   → lineItems[].hours
  Column "Rate"            → lineItems[].rate
  Column "Amount"          → lineItems[].amount

EXAMPLE — correct mapping for a 7-column NDIS table:
  [Date, Start, End, Description, Hours, Rate, Amount]
  → [serviceDate, startTime, endTime, description, hours, rate, amount]
══════════════════════════════════════════════════════════════════

ABSOLUTE PROHIBITIONS:
- NEVER map "Start" column to lineItems[].description — "Start" is a clock time
- NEVER map "End" column to lineItems[].hours or lineItems[].startTime
- NEVER map "Description" column to lineItems[].endTime or lineItems[].rate
- NEVER include "Grand Total", "Balance Due", "Invoice Total", "Total Amount Due" as table columns
- Scalar totals ("Total", "Subtotal", "GST") → totalAmount/subtotal/gstAmount fields, NOT columns
- "Signature", "Dept", "Department", "Approval" → "_skip"

Return tableConfig with:
  page, headerY (y of column header row), firstRowY (y of FIRST data row, LESS than headerY),
  rowHeight (gap between rows, typically 16-28), columns:[{header, mappedTo, x, width}]

Return JSON:
{
  "fields": [{"label":"Provider Name","mappedTo":"businessName","fillX":200,"fillY":700,"fillWidth":180,"page":1,"confidence":0.95}],
  "tableConfig": {
    "page":1,"headerY":450,"firstRowY":428,"rowHeight":22,
    "columns":[
      {"header":"Date","mappedTo":"lineItems[].serviceDate","x":50,"width":80},
      {"header":"Start","mappedTo":"lineItems[].startTime","x":135,"width":55},
      {"header":"End","mappedTo":"lineItems[].endTime","x":195,"width":55},
      {"header":"Description","mappedTo":"lineItems[].description","x":255,"width":200},
      {"header":"Hours","mappedTo":"lineItems[].hours","x":460,"width":50},
      {"header":"Rate","mappedTo":"lineItems[].rate","x":515,"width":65},
      {"header":"Amount","mappedTo":"lineItems[].amount","x":585,"width":75}
    ]
  }
}
Omit tableConfig if no repeating table detected.`;

  const raw = await askGemini(prompt);
  if (!raw) return { fields: [] };

  const parsed = safeJsonParse<AiFlatResult>(raw);
  if (!parsed) return { fields: [] };

  return {
    fields: (parsed as AiFlatResult).fields || [],
    tableConfig: (parsed as AiFlatResult).tableConfig,
  };
}

// ─── Column Correction (exported for runtime use on cached templates) ────────

/**
 * Re-validates each table column's mappedTo by running the column header
 * through matchLabel(). This fixes cached templates that were analyzed before
 * Start/End time columns were added to LABEL_TO_FIELD, and prevents AI from
 * overriding correct heuristic matches with wrong ones.
 */
export function correctTableColumns(
  columns: TableConfig['columns'],
): TableConfig['columns'] {
  return columns.map((col) => {
    const match = matchLabel(col.header);
    // Only override when we have high confidence AND it maps to a line-item field
    if (
      match &&
      match.field.startsWith('lineItems[].') &&
      match.confidence >= SIMILARITY_THRESHOLD
    ) {
      if (match.field !== col.mappedTo) {
        logger.info(
          `[ColCorrection] "${col.header}": ${col.mappedTo} → ${match.field} (conf=${match.confidence.toFixed(2)})`,
        );
      }
      return { ...col, mappedTo: match.field };
    }
    return col;
  });
}

// ─── Template Fingerprinting ──────────────────────────────────────────────────

export function generateTemplateFingerprint(result: AnalysisResult): string {
  const parts: string[] = [`pages:${result.pageCount}`];

  if (result.acroFields.length > 0) {
    const sorted = result.acroFields.map((f) => f.name).sort().join(',');
    parts.push(`acro:${sorted}`);
  }

  if (result.tableConfig) {
    const headers = result.tableConfig.columns
      .map((c) => normalizeText(c.header))
      .sort()
      .join(',');
    parts.push(`table:${headers}`);
  }

  const anchors = result.fieldMappings
    .filter((m) => !m.isLineItem && m.mappedTo !== '_skip' && m.confidence > 0.7)
    .map((m) => normalizeText(m.label))
    .sort()
    .slice(0, 10)
    .join(',');
  if (anchors) parts.push(`anchors:${anchors}`);

  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

// ─── Apply Learned Mappings ───────────────────────────────────────────────────

export function applyLearnedMappings(
  fieldMappings: FieldMapping[],
  corrections: MappingCorrection[],
): FieldMapping[] {
  return fieldMappings.map((m) => {
    const correction = corrections.find((c) => c.label === m.label);
    if (correction) {
      return {
        ...m,
        mappedTo: correction.mappedTo,
        confidence: correction.confidence,
        correctedByUser: true,
      };
    }
    return m;
  });
}

// ─── Merge AI + Heuristic Results ────────────────────────────────────────────

function mergeAiOverHeuristic(
  heuristic: FieldMapping[],
  aiMappings: AiAcroMapping[],
  acroFields: AcroField[],
): FieldMapping[] {
  const merged = [...heuristic];

  for (const ai of aiMappings) {
    if (!ai.mappedTo || !ai.acroFieldName) continue;

    const existing = merged.find((m) => m.acroFieldName === ai.acroFieldName);
    if (existing) {
      // AI wins over heuristic if confidence is higher
      if (ai.confidence > existing.confidence) {
        existing.mappedTo = ai.mappedTo;
        existing.confidence = ai.confidence;
        existing.isLineItem = ai.mappedTo.startsWith('lineItems[].');
      }
    } else {
      const acroField = acroFields.find((f) => f.name === ai.acroFieldName);
      merged.push({
        label: ai.acroFieldName,
        mappedTo: ai.mappedTo,
        confidence: ai.confidence,
        acroFieldName: ai.acroFieldName,
        page: acroField?.page ?? 1,
        isLineItem: ai.mappedTo.startsWith('lineItems[].'),
      });
    }
  }

  return merged;
}

function mergeAiFlatOverHeuristic(
  heuristic: FieldMapping[],
  aiFields: AiFlatField[],
): FieldMapping[] {
  const merged = [...heuristic];

  for (const f of aiFields) {
    if (f.mappedTo.startsWith('lineItems[].')) continue;

    const existing = merged.find((m) => m.mappedTo === f.mappedTo);
    if (existing) {
      if (f.confidence > existing.confidence) {
        existing.label = f.label;
        existing.mappedTo = f.mappedTo;
        existing.confidence = f.confidence;
        existing.fillX = f.fillX;
        existing.fillY = f.fillY;
        existing.fillWidth = f.fillWidth;
        existing.page = f.page;
        existing.isLineItem = false;
      }
    } else {
      merged.push({
        label: f.label,
        mappedTo: f.mappedTo,
        confidence: f.confidence,
        fillX: f.fillX,
        fillY: f.fillY,
        fillWidth: f.fillWidth,
        page: f.page,
        isLineItem: false,
      });
    }
  }

  return merged;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const aiAnalysisService = {
  async analyze(pdfBuffer: Buffer): Promise<AnalysisResult> {
    // STEP 1: Extract AcroForm fields
    const acroFields = await extractAcroFields(pdfBuffer);
    const isAcroForm = acroFields.length > 0;

    // STEP 2: Extract text items via pdf-parse
    let rawTextItems: TextItem[] = [];
    try {
      rawTextItems = await extractTextItems(pdfBuffer);
    } catch (err) {
      logger.warn('Text extraction failed:', err);
    }

    // STEP 3: Get page count
    let pageCount = 1;
    try {
      const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
      pageCount = pdfDoc.getPageCount();
    } catch { /* default 1 */ }

    // STEP 4: Run OCR if needed (scanned PDF detection)
    let allTextItems = rawTextItems;
    if (!isAcroForm && isScannedPdf(rawTextItems, pageCount)) {
      logger.info('Scanned PDF detected — running OCR pipeline');
      const ocrItems = await runOcrOnPdf(pdfBuffer);
      if (ocrItems.length > rawTextItems.length * 1.5) {
        // OCR produced significantly more text — use it
        allTextItems = ocrItems;
        logger.info(`OCR produced ${ocrItems.length} items vs ${rawTextItems.length} extracted`);
      } else if (ocrItems.length > 0) {
        // Merge: append OCR items that don't overlap with extracted items
        const merged = [...rawTextItems];
        for (const ocrItem of ocrItems) {
          const hasNearby = rawTextItems.some(
            (e) => e.page === ocrItem.page && Math.abs(e.x - ocrItem.x) < 20 && Math.abs(e.y - ocrItem.y) < 8,
          );
          if (!hasNearby) merged.push(ocrItem);
        }
        allTextItems = merged;
      }
    }

    // STEP 5: Reconstruct semantic lines (merges fragmented text)
    const lines = reconstructTextLines(allTextItems);

    // STEP 6: Detect tables from reconstructed lines
    const heuristicTable = detectTables(lines, pageCount);

    if (isAcroForm) {
      // ── AcroForm path ────────────────────────────────────────────────────
      let fieldMappings: FieldMapping[] = heuristicMapAcroFields(acroFields);

      if (hasGemini()) {
        try {
          const fieldNames = acroFields.map((f) => f.name);
          const aiMappings = await aiMapAcroFields(fieldNames);
          fieldMappings = mergeAiOverHeuristic(fieldMappings, aiMappings, acroFields);
        } catch (err) {
          logger.warn('AI AcroForm mapping failed, using heuristics:', err);
        }
      }

      // STEP 10: Filter low-confidence and duplicate mappings
      const seenFields = new Set<string>();
      const filtered = fieldMappings.filter((m) => {
        if (m.mappedTo === '_skip') return false;
        if (m.confidence < 0.5) return false;
        const key = `${m.mappedTo}:${m.acroFieldName ?? m.label}`;
        if (seenFields.has(key)) return false;
        seenFields.add(key);
        return true;
      });

      const result: AnalysisResult = {
        pdfType: 'acroform',
        pageCount,
        acroFields,
        textItems: allTextItems,
        fieldMappings: filtered,
        tableConfig: null,
      };
      result.fingerprint = generateTemplateFingerprint(result);
      return result;
    }

    // ── Flat PDF path ────────────────────────────────────────────────────────

    // STEP 7: Heuristic mapping from reconstructed lines
    const { fieldMappings: heuristicMappings } = heuristicMapTextLines(lines);
    let fieldMappings = heuristicMappings;
    let tableConfig = heuristicTable;

    // Check if OCR should be re-run after initial heuristic attempt
    if (!isScannedPdf(rawTextItems, pageCount) && shouldRunOcr(rawTextItems, fieldMappings, pageCount)) {
      logger.info('Low confidence heuristic — triggering OCR for enhancement');
      const ocrItems = await runOcrOnPdf(pdfBuffer);
      if (ocrItems.length > 5) {
        const merged = [...rawTextItems];
        for (const ocrItem of ocrItems) {
          const hasNearby = rawTextItems.some(
            (e) => e.page === ocrItem.page && Math.abs(e.x - ocrItem.x) < 20 && Math.abs(e.y - ocrItem.y) < 8,
          );
          if (!hasNearby) merged.push(ocrItem);
        }
        const enhancedLines = reconstructTextLines(merged);
        const enhanced = heuristicMapTextLines(enhancedLines);
        if (enhanced.fieldMappings.length > fieldMappings.length) {
          fieldMappings = enhanced.fieldMappings;
          tableConfig = enhanced.tableConfig ?? tableConfig;
        }
      }
    }

    // STEP 8: Send structured semantic layout to Gemini
    if (hasGemini() && lines.length > 0) {
      try {
        const layout = buildSemanticLayout(lines, tableConfig);
        const aiResult = await aiMapFlatPdfLayout(layout);

        // STEP 9: Merge AI + heuristic results
        if (aiResult.tableConfig && aiResult.tableConfig.columns.length >= 2) {
          // Always re-validate column headers via heuristic to override AI mistakes.
          // The heuristic has ground-truth label→field mappings; AI provides better
          // coordinate positioning. Combine the two: AI coords + heuristic mappings.
          const correctedCols = correctTableColumns(aiResult.tableConfig.columns);

          const validCols = correctedCols.filter(
            (c) =>
              c.mappedTo.startsWith('lineItems[].') &&
              !isScalarTotalLabel(c.header) &&
              c.x >= 0 &&
              c.width > 0,
          );
          if (validCols.length >= 2) {
            tableConfig = { ...aiResult.tableConfig, columns: validCols };
            logger.info(
              `AI tableConfig accepted (header-corrected): ${validCols.length} cols, ` +
              `firstRowY=${tableConfig.firstRowY}, rowH=${tableConfig.rowHeight}`,
            );
            logger.debug('Final cols: ' + validCols.map((c) => `${c.header}→${c.mappedTo}`).join(', '));
          }
        }

        fieldMappings = mergeAiFlatOverHeuristic(fieldMappings, aiResult.fields);
      } catch (err) {
        logger.warn('AI flat PDF mapping failed, using heuristics:', err);
      }
    }

    // STEP 10: Apply confidence filtering — remove low-confidence and duplicates
    const seenMapped = new Map<string, number>();
    const filtered = fieldMappings
      .filter((m) => m.mappedTo !== '_skip' && m.confidence >= 0.5)
      .filter((m) => {
        const prev = seenMapped.get(m.mappedTo);
        if (prev === undefined || m.confidence > prev) {
          seenMapped.set(m.mappedTo, m.confidence);
          return true;
        }
        return false;
      });

    const result: AnalysisResult = {
      pdfType: 'flat',
      pageCount,
      acroFields: [],
      textItems: allTextItems,
      fieldMappings: filtered,
      tableConfig,
    };
    result.fingerprint = generateTemplateFingerprint(result);
    return result;
  },
};

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(amount: number | string, currency = 'AUD'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  const symbols: Record<string, string> = { AUD: '$', USD: '$', EUR: '€', GBP: '£' };
  return `${symbols[currency] || '$'}${(num || 0).toFixed(2)}`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateInput(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toISOString().split('T')[0];
}

export function roundToQuarterHour(minutes: number): number {
  return Math.floor(minutes / 15) * 15;
}

export function calcHours(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const smR = roundToQuarterHour(sm);
  const emR = roundToQuarterHour(em);
  let start = sh * 60 + smR;
  let end = eh * 60 + emR;
  if (end <= start) end += 24 * 60;
  return Math.max(0, (end - start) / 60);
}

export function formatPhone(val: string): string {
  const clean = val.replace(/\D/g, '').slice(0, 10);
  if (clean.length > 6) return `(${clean.slice(0, 2)})-${clean.slice(2, 5)}-${clean.slice(5)}`;
  if (clean.length > 2) return `(${clean.slice(0, 2)})-${clean.slice(2)}`;
  return clean;
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    SENT: 'bg-blue-50 text-blue-700',
    PAID: 'bg-emerald-50 text-emerald-700',
    VOID: 'bg-gray-100 text-gray-500',
    OVERDUE: 'bg-red-50 text-red-700',
  };
  return map[status] || 'bg-gray-100 text-gray-600';
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'Draft',
    SENT: 'Sent',
    PAID: 'Paid',
    VOID: 'Void',
    OVERDUE: 'Overdue',
    INVOICE: 'Invoice',
    QUOTE: 'Quote',
    PURCHASE_ORDER: 'Purchase Order',
  };
  return map[status] || status;
}

export function truncate(str: string, maxLen = 30): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

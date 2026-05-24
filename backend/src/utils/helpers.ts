import crypto from 'crypto';

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function formatMoney(amount: number | string, currency = 'AUD'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  const symbols: Record<string, string> = { AUD: '$', USD: '$', EUR: '€', GBP: '£' };
  return `${symbols[currency] || '$'}${num.toFixed(2)}`;
}

export function roundToQuarterHour(minutes: number): number {
  return Math.floor(minutes / 15) * 15;
}

export function calcHours(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);

  const smRounded = roundToQuarterHour(sm);
  const emRounded = roundToQuarterHour(em);

  let startMins = sh * 60 + smRounded;
  let endMins = eh * 60 + emRounded;

  if (endMins <= startMins) endMins += 24 * 60;

  const diff = endMins - startMins;
  return Math.max(0, diff / 60);
}

export function autoInvoiceNumber(prefix: string, year: number, next: number): string {
  return `${prefix}-${year}-${String(next).padStart(3, '0')}`;
}

export function sanitizeHtml(str: string): string {
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach((k) => {
    result[k] = obj[k];
  });
  return result;
}

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  keys.forEach((k) => delete (result as Record<string, unknown>)[k as string]);
  return result as Omit<T, K>;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { apiClient } from './client';

export class PaymentRequiredError extends Error {
  readonly statusCode = 402;
  constructor(message: string) {
    super(message);
    this.name = 'PaymentRequiredError';
  }
}
import {
  Invoice,
  InvoiceSummary,
  InvoiceStats,
  CreateInvoiceInput,
  PaginationMeta,
} from '@/types';

export interface InvoiceListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface InvoiceListResponse {
  invoices: InvoiceSummary[];
  meta: PaginationMeta;
}

export const invoiceApi = {
  async list(params?: InvoiceListParams): Promise<InvoiceListResponse> {
    const { data } = await apiClient.get<{ success: boolean; invoices: InvoiceSummary[]; meta: PaginationMeta }>(
      '/invoices',
      { params },
    );
    return { invoices: data.invoices, meta: data.meta };
  },

  async getById(id: string): Promise<Invoice> {
    const { data } = await apiClient.get<{ success: boolean; data: Invoice }>(`/invoices/${id}`);
    return data.data!;
  },

  async create(input: CreateInvoiceInput): Promise<Invoice> {
    const { data } = await apiClient.post<{ success: boolean; data: Invoice }>('/invoices', input);
    return data.data!;
  },

  async update(id: string, input: Partial<CreateInvoiceInput>): Promise<Invoice> {
    const { data } = await apiClient.put<{ success: boolean; data: Invoice }>(
      `/invoices/${id}`,
      input,
    );
    return data.data!;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/invoices/${id}`);
  },

  async duplicate(id: string): Promise<Invoice> {
    const { data } = await apiClient.post<{ success: boolean; data: Invoice }>(
      `/invoices/${id}/duplicate`,
    );
    return data.data!;
  },

  async generatePdf(id: string): Promise<string> {
    const { data } = await apiClient.post<{ success: boolean; data: { pdfUrl: string } }>(
      `/invoices/${id}/pdf`,
    );
    return data.data!.pdfUrl;
  },

  async downloadPdfStream(id: string, templateId?: string): Promise<Blob> {
    const response = await apiClient.post<Blob>(
      `/invoices/${id}/pdf`,
      // Always send null (not undefined) so axios always serializes a proper JSON body
      { templateId: templateId ?? null },
      { params: { download: 'stream' }, responseType: 'blob', validateStatus: () => true },
    );

    if (response.status < 200 || response.status >= 300) {
      let message = `PDF generation failed (${response.status})`;
      try {
        const text = await (response.data as Blob).text();
        const json = JSON.parse(text) as { message?: string };
        if (json.message) message = json.message;
      } catch { /* use default message */ }

      if (response.status === 402) throw new PaymentRequiredError(message);
      throw new Error(message);
    }

    return response.data;
  },

  async getStats(): Promise<InvoiceStats> {
    const { data } = await apiClient.get<{ success: boolean; data: InvoiceStats }>(
      '/invoices/stats',
    );
    return data.data!;
  },
};

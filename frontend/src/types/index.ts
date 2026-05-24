export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN';
  emailVerified: boolean;
  workspaceId: string;
}

export interface Workspace {
  id: string;
  userId: string;
  bizName: string;
  abn: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  providerLabel: string;
  clientLabel: string;
  defaultProviderTitle: string;
  defaultClientName: string;
  defaultDescription: string;
  defaultRate: number;
  invoicePrefix: string;
  nextNumber: number;
  currency: string;
  logoUrl: string | null;
  brandColor: string;
  subscription: Subscription | null;
  usageTracking: UsageTracking | null;
}

export interface Subscription {
  id: string;
  workspaceId: string;
  plan: 'FREE' | 'PRO_MONTHLY' | 'PRO_YEARLY';
  status: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'UNPAID';
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
}

export interface UsageTracking {
  pdfDownloads: number;
  invoicesCreated: number;
}

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'VOID' | 'OVERDUE';
export type DocumentType = 'INVOICE' | 'QUOTE' | 'PURCHASE_ORDER';

export interface InvoiceLineItem {
  id?: string;
  serviceDate: string;
  startTime: string;
  endTime: string;
  description: string;
  hours: number;
  rate: number;
  amount: number;
  sortOrder?: number;
}

export interface Invoice {
  id: string;
  type: DocumentType;
  number: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string | null;
  serviceMonth: string | null;
  providerName: string;
  providerTitle: string;
  providerAddress: string;
  providerEmail: string;
  providerPhone: string;
  providerABN: string;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  ndisNumber: string;
  fiscalAgent: string;
  supportCoordinator: string;
  legalGuardian: string;
  bsbAccount: string;
  clientSigUrl: string | null;
  providerSigUrl: string | null;
  totalHours: number;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  currency: string;
  notes: string;
  pdfUrl: string | null;
  templateId: string | null;
  lineItems: InvoiceLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceSummary {
  id: string;
  number: string;
  type: DocumentType;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string | null;
  clientName: string;
  ndisNumber: string;
  totalAmount: number;
  currency: string;
  pdfUrl: string | null;
  createdAt: string;
}

export interface InvoiceStats {
  total: number;
  draft: number;
  sent: number;
  paid: number;
  overdue: number;
  thisMonthRevenue: number;
  usage: UsageTracking | null;
}

export type TemplateAnalysisStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

export interface FieldMapping {
  label: string;
  mappedTo: string;
  confidence: number;
  acroFieldName?: string;
  fillX?: number;
  fillY?: number;
  fillWidth?: number;
  page?: number;
  isLineItem?: boolean;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  scope: 'SYSTEM' | 'USER';
  thumbnailUrl: string | null;
  brandColor: string;
  fontFamily: string;
  isDefault: boolean;
  // AI analysis
  analysisStatus: TemplateAnalysisStatus;
  originalPdfUrl: string | null;
  pageCount: number;
  fieldMappings?: FieldMapping[];
  createdAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: PaginationMeta;
}

export interface CreateInvoiceInput {
  type?: DocumentType;
  number?: string;
  status?: InvoiceStatus;
  issueDate: string;
  dueDate?: string;
  serviceMonth?: string;
  providerName: string;
  providerTitle?: string;
  providerAddress?: string;
  providerEmail?: string;
  providerPhone?: string;
  providerABN?: string;
  clientName: string;
  clientAddress?: string;
  clientEmail?: string;
  ndisNumber?: string;
  fiscalAgent?: string;
  supportCoordinator?: string;
  legalGuardian?: string;
  bsbAccount?: string;
  clientSigData?: string;
  providerSigData?: string;
  lineItems: InvoiceLineItem[];
  totalHours: number;
  subtotal: number;
  gstAmount?: number;
  totalAmount: number;
  currency?: string;
  templateId?: string;
  notes?: string;
}

export interface WorkspaceSettings {
  bizName?: string;
  abn?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  providerLabel?: string;
  clientLabel?: string;
  defaultProviderTitle?: string;
  defaultClientName?: string;
  defaultDescription?: string;
  defaultRate?: number;
  invoicePrefix?: string;
  currency?: string;
  brandColor?: string;
}

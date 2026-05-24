import { Request } from 'express';
import { User, Workspace, Subscription, SubscriptionPlan } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  user: User & {
    workspace: Workspace & {
      subscription: Subscription | null;
    };
  };
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload {
  sub: string;
  tokenId: string;
  iat?: number;
  exp?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface InvoiceLineItemInput {
  serviceDate?: string;
  startTime?: string;
  endTime?: string;
  description: string;
  hours: number;
  rate: number;
  amount: number;
  sortOrder?: number;
}

export interface CreateInvoiceInput {
  type?: 'INVOICE' | 'QUOTE' | 'PURCHASE_ORDER';
  number?: string;
  status?: 'DRAFT' | 'SENT' | 'PAID' | 'VOID' | 'OVERDUE';
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
  lineItems: InvoiceLineItemInput[];
  totalHours: number;
  subtotal: number;
  gstAmount?: number;
  totalAmount: number;
  currency?: string;
  templateId?: string;
  notes?: string;
  clientId?: string;
}

export interface UpdateInvoiceInput extends Partial<CreateInvoiceInput> {
  id: string;
}

export type PlanType = SubscriptionPlan;

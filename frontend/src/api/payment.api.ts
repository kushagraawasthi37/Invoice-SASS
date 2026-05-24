import { apiClient } from './client';
import { Subscription, UsageTracking } from '@/types';

export interface BillingData {
  subscription: Subscription | null;
  usage: UsageTracking | null;
  plans: Record<string, { name: string; price: number; pdfLimit: number; features: string[] }>;
}

export const paymentApi = {
  async getSubscription(): Promise<BillingData> {
    const { data } = await apiClient.get<{ success: boolean; data: BillingData }>(
      '/payments/subscription',
    );
    return data.data!;
  },

  async createCheckout(plan: 'PRO_MONTHLY' | 'PRO_YEARLY'): Promise<string> {
    const { data } = await apiClient.post<{ success: boolean; data: { url: string } }>(
      '/payments/checkout',
      { plan },
    );
    return data.data!.url;
  },

  async createPortal(): Promise<string> {
    const { data } = await apiClient.post<{ success: boolean; data: { url: string } }>(
      '/payments/portal',
    );
    return data.data!.url;
  },
};

import { apiClient } from './client';
import { User } from '@/types';

export interface AuthResponse {
  user: User;
  tokens: { accessToken: string; refreshToken: string };
}

export interface RegisterResponse {
  requiresVerification: true;
  email: string;
  name: string;
}

export const authApi = {
  async register(name: string, email: string, password: string): Promise<RegisterResponse> {
    const { data } = await apiClient.post<{ success: boolean; data: RegisterResponse }>(
      '/auth/register',
      { name, email, password },
    );
    return data.data!;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const { data } = await apiClient.post<{ success: boolean; data: AuthResponse }>(
      '/auth/login',
      { email, password },
    );
    return data.data!;
  },

  async resendVerification(email: string): Promise<void> {
    await apiClient.post('/auth/resend-verification', { email });
  },

  async logout(refreshToken: string): Promise<void> {
    await apiClient.post('/auth/logout', { refreshToken }).catch(() => {});
  },

  async forgotPassword(email: string): Promise<void> {
    await apiClient.post('/auth/forgot-password', { email });
  },

  async resetPassword(token: string, password: string): Promise<void> {
    await apiClient.post('/auth/reset-password', { token, password });
  },

  googleUrl(): string {
    const base = import.meta.env.VITE_API_URL || '/api/v1';
    return `${base}/auth/google`;
  },
};

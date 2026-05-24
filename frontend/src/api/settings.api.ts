import { apiClient } from './client';
import { Workspace, WorkspaceSettings, User } from '@/types';

export const settingsApi = {
  async getWorkspace(): Promise<Workspace> {
    const { data } = await apiClient.get<{ success: boolean; data: Workspace }>(
      '/settings/workspace',
    );
    return data.data!;
  },

  async updateWorkspace(settings: WorkspaceSettings): Promise<Workspace> {
    const { data } = await apiClient.put<{ success: boolean; data: Workspace }>(
      '/settings/workspace',
      settings,
    );
    return data.data!;
  },

  async uploadLogo(file: File): Promise<string> {
    const form = new FormData();
    form.append('logo', file);
    const { data } = await apiClient.post<{ success: boolean; data: { logoUrl: string } }>(
      '/settings/workspace/logo',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data.data!.logoUrl;
  },

  async getProfile(): Promise<User> {
    const { data } = await apiClient.get<{ success: boolean; data: User }>('/settings/profile');
    return data.data!;
  },

  async updateProfile(name: string): Promise<User> {
    const { data } = await apiClient.put<{ success: boolean; data: User }>('/settings/profile', {
      name,
    });
    return data.data!;
  },
};

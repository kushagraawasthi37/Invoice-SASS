import { apiClient } from './client';
import { Template, FieldMapping } from '@/types';

export interface TemplateAnalysis {
  id: string;
  analysisStatus: string;
  analysisError: string | null;
  fieldMappings: FieldMapping[] | null;
  pageCount: number;
}

export const templateApi = {
  async list(): Promise<Template[]> {
    const { data } = await apiClient.get<{ success: boolean; data: Template[] }>('/templates');
    return data.data || [];
  },

  async getById(id: string): Promise<Template> {
    const { data } = await apiClient.get<{ success: boolean; data: Template }>(`/templates/${id}`);
    return data.data!;
  },

  async upload(file: File, name?: string, description?: string): Promise<Template> {
    const form = new FormData();
    form.append('pdf', file);
    if (name) form.append('name', name);
    if (description) form.append('description', description);
    const { data } = await apiClient.post<{ success: boolean; data: Template }>('/templates/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.data!;
  },

  async getAnalysis(id: string): Promise<TemplateAnalysis> {
    const { data } = await apiClient.get<{ success: boolean; data: TemplateAnalysis }>(`/templates/${id}/analysis`);
    return data.data!;
  },

  async correctMapping(id: string, label: string, mappedTo: string): Promise<void> {
    await apiClient.post(`/templates/${id}/correct-mapping`, { label, mappedTo });
  },

  async reanalyze(id: string): Promise<void> {
    await apiClient.post(`/templates/${id}/reanalyze`);
  },

  async update(id: string, data: { name?: string; description?: string; brandColor?: string; fontFamily?: string }): Promise<Template> {
    const { data: res } = await apiClient.put<{ success: boolean; data: Template }>(`/templates/${id}`, data);
    return res.data!;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/templates/${id}`);
  },
};

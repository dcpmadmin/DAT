import type { AssessmentRecord, AssessmentUpsert } from '@/shared/assessment';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const fetchJson = async <T>(input: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${input}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    },
    ...init
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

export const listAssessments = async (): Promise<AssessmentRecord[]> => {
  return fetchJson<AssessmentRecord[]>('/assessments');
};

export const getAssessment = async (id: string): Promise<AssessmentRecord> => {
  return fetchJson<AssessmentRecord>(`/assessments/${encodeURIComponent(id)}`);
};

export const upsertAssessment = async (payload: AssessmentUpsert): Promise<AssessmentRecord> => {
  const id = payload.id || payload.damageId;
  return fetchJson<AssessmentRecord>(`/assessments/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
};

export const uploadFile = async (file: File): Promise<{ key: string; url?: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Upload failed: ${response.status}`);
  }
  return response.json() as Promise<{ key: string; url?: string }>;
};

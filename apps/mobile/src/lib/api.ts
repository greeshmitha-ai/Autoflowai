/**
 * Minimal API client for the platform backend.
 * All requests include the JWT access token from storage.
 */
import { getStoredToken } from './storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.platform.internal';

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API ${res.status}: ${error}`);
  }
  return res.json() as Promise<T>;
}

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<{ accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  refresh: (refreshToken: string) =>
    apiFetch<{ accessToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  me: () => apiFetch<{ userId: string; tenantId: string; roles: string[]; email: string }>('/auth/me'),
};

// Team Inbox
export const inboxApi = {
  list: (params?: { status?: string; channel?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return apiFetch<{ conversations: Conversation[] }>(`/inbox/conversations${qs}`);
  },
  assign: (conversationId: string, userId: string) =>
    apiFetch(`/inbox/conversations/${conversationId}/assign`, {
      method: 'PUT',
      body: JSON.stringify({ userId }),
    }),
};

// Live Chat
export const liveChatApi = {
  sendMessage: (conversationId: string, content: string) =>
    apiFetch(`/live-chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  addNote: (conversationId: string, note: string) =>
    apiFetch(`/conversations/${conversationId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content: note }),
    }),
};

// Contacts
export const contactsApi = {
  list: (page = 1) => apiFetch<{ contacts: Contact[]; total: number }>(`/contacts?page=${page}`),
  get: (id: string) => apiFetch<Contact>(`/contacts/${id}`),
  update: (id: string, data: Partial<Contact>) =>
    apiFetch<Contact>(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  addNote: (id: string, note: string) =>
    apiFetch(`/contacts/${id}/notes`, { method: 'POST', body: JSON.stringify({ content: note }) }),
};

// Tasks
export const tasksApi = {
  list: () => apiFetch<{ tasks: Task[] }>('/tasks'),
  create: (data: Partial<Task>) =>
    apiFetch<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Task>) =>
    apiFetch<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// CRM
export const crmApi = {
  board: (pipelineId: string) => apiFetch<{ stages: DealStage[] }>(`/pipelines/${pipelineId}/board`),
  updateDeal: (dealId: string, data: Partial<Deal>) =>
    apiFetch<Deal>(`/deals/${dealId}`, { method: 'PUT', body: JSON.stringify(data) }),
  addNote: (dealId: string, note: string) =>
    apiFetch(`/deals/${dealId}/notes`, { method: 'POST', body: JSON.stringify({ content: note }) }),
};

// Types
export interface Conversation {
  conversationId: string;
  contactName: string;
  channel: string;
  lastMessage: string;
  status: string;
  updatedAt: string;
}

export interface Contact {
  contactId: string;
  fullName: string;
  email: string;
  phone: string;
  leadScore: number;
  lifecycleStage: string;
}

export interface Task {
  taskId: string;
  title: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'completed' | 'overdue';
}

export interface Deal {
  dealId: string;
  name: string;
  value: number;
  stageId: string;
  status: string;
}

export interface DealStage {
  stageId: string;
  name: string;
  deals: Deal[];
  totalValue: number;
}

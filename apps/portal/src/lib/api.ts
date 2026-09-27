/**
 * Portal API client — communicates with the portal backend service.
 */

const API_URL = process.env['PORTAL_API_URL'] ?? 'http://localhost:3021';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('portal_token');
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function sendMagicLink(email: string, tenantId: string): Promise<{ message: string }> {
  return apiFetch('/portal/auth/magic-link', {
    method: 'POST',
    body: JSON.stringify({ email, tenant_id: tenantId }),
  });
}

export async function verifyMagicLink(token: string): Promise<{ token: string }> {
  return apiFetch(`/portal/auth/verify?token=${encodeURIComponent(token)}`);
}

export async function passwordLogin(
  email: string,
  password: string,
  tenantId: string,
): Promise<{ token: string }> {
  return apiFetch('/portal/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, tenant_id: tenantId }),
  });
}

// ─── History ──────────────────────────────────────────────────────────────────

export interface HistoryItem {
  type: 'email' | 'call' | 'chatbot' | 'survey';
  id: string;
  timestamp: string;
  summary: string;
}

export async function getHistory(): Promise<{ history: HistoryItem[] }> {
  return apiFetch('/portal/history');
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

export interface SupportTicket {
  ticket_id: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved';
  ticket_ref: string;
  file_attachment_url: string | null;
  created_at: string;
}

export async function getTickets(): Promise<{ tickets: SupportTicket[] }> {
  return apiFetch('/portal/tickets');
}

export async function submitTicket(data: {
  subject: string;
  description: string;
  file_attachment_url?: string;
}): Promise<{ ticket: SupportTicket }> {
  return apiFetch('/portal/tickets', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Preferences ──────────────────────────────────────────────────────────────

export interface Preferences {
  email_opt_in: boolean;
  sms_opt_in: boolean;
  in_app_opt_in: boolean;
}

export async function getPreferences(): Promise<{ preferences: Preferences }> {
  return apiFetch('/portal/preferences');
}

export async function updatePreferences(prefs: Preferences): Promise<{ preferences: Preferences }> {
  return apiFetch('/portal/preferences', {
    method: 'PUT',
    body: JSON.stringify(prefs),
  });
}

// ─── Data export ──────────────────────────────────────────────────────────────

export async function requestDataExport(): Promise<{
  message: string;
  estimated_completion: string;
}> {
  return apiFetch('/portal/data-export', { method: 'POST' });
}

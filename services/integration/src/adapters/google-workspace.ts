export interface GoogleWorkspaceConfig {
  serviceAccountKey?: Record<string, unknown>;
  delegatedEmail?: string;
  scopes?: string[];
}

export interface GoogleWorkspaceEvent {
  type: string;
  data: Record<string, unknown>;
}

export class GoogleWorkspaceAdapter {
  private config: GoogleWorkspaceConfig;

  constructor(config: GoogleWorkspaceConfig) {
    this.config = config;
  }

  async connect(): Promise<{ ok: boolean; provider: string }> {
    if (!this.config.serviceAccountKey) {
      throw new Error('Google Workspace: serviceAccountKey is required');
    }
    // In production: exchange service account key for access token via OAuth2
    return { ok: true, provider: 'google-workspace' };
  }

  async sendEvent(event: GoogleWorkspaceEvent): Promise<void> {
    // Route events to appropriate Google Workspace API
    // e.g. calendar.event.created → Google Calendar API
    // e.g. contact.created → Google People API
    // Stub: log the event type for now
    console.info(`[google-workspace] sendEvent: ${event.type}`, event.data);
  }
}

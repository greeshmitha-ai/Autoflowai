export interface HubSpotConfig {
  accessToken?: string;
  portalId?: string;
}

export interface HubSpotEvent {
  type: string;
  data: Record<string, unknown>;
}

export class HubSpotAdapter {
  private config: HubSpotConfig;
  private readonly baseUrl = 'https://api.hubapi.com';

  constructor(config: HubSpotConfig) {
    this.config = config;
  }

  async connect(): Promise<{ ok: boolean; provider: string }> {
    if (!this.config.accessToken) {
      throw new Error('HubSpot: accessToken is required');
    }
    // In production: call /oauth/v1/access-tokens/:token to validate
    return { ok: true, provider: 'hubspot' };
  }

  async sendEvent(event: HubSpotEvent): Promise<void> {
    if (!this.config.accessToken) throw new Error('HubSpot: accessToken is required');

    // Map platform events to HubSpot timeline events
    await fetch(`${this.baseUrl}/crm/v3/timeline/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.accessToken}`,
      },
      body: JSON.stringify({
        eventTemplateId: event.type,
        objectId: (event.data['contact_id'] as string) ?? '',
        tokens: event.data,
      }),
    });
  }
}

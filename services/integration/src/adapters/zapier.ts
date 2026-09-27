export interface ZapierConfig {
  webhookUrl?: string;
}

export interface ZapierEvent {
  type: string;
  data: Record<string, unknown>;
}

export class ZapierAdapter {
  private config: ZapierConfig;

  constructor(config: ZapierConfig) {
    this.config = config;
  }

  async connect(): Promise<{ ok: boolean; provider: string }> {
    if (!this.config.webhookUrl) {
      throw new Error('Zapier: webhookUrl is required');
    }
    return { ok: true, provider: 'zapier' };
  }

  async sendEvent(event: ZapierEvent): Promise<void> {
    if (!this.config.webhookUrl) throw new Error('Zapier: webhookUrl is required');

    await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: event.type, ...event.data }),
    });
  }
}

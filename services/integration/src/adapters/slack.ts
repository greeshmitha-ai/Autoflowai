export interface SlackConfig {
  webhookUrl?: string;
  botToken?: string;
  channel?: string;
}

export interface SlackEvent {
  type: string;
  data: Record<string, unknown>;
}

export class SlackAdapter {
  private config: SlackConfig;

  constructor(config: SlackConfig) {
    this.config = config;
  }

  async connect(): Promise<{ ok: boolean; provider: string }> {
    // Validate config — in production this would call Slack's auth.test API
    if (!this.config.webhookUrl && !this.config.botToken) {
      throw new Error('Slack: webhookUrl or botToken is required');
    }
    return { ok: true, provider: 'slack' };
  }

  async sendEvent(event: SlackEvent): Promise<void> {
    const url = this.config.webhookUrl;
    if (!url) throw new Error('Slack: webhookUrl is required for sendEvent');

    const text = `[${event.type}] ${JSON.stringify(event.data)}`;
    const channel = this.config.channel;

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...(channel ? { channel } : {}) }),
    });
  }
}

export interface SalesforceConfig {
  instanceUrl?: string;
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface SalesforceEvent {
  type: string;
  data: Record<string, unknown>;
}

export class SalesforceAdapter {
  private config: SalesforceConfig;

  constructor(config: SalesforceConfig) {
    this.config = config;
  }

  async connect(): Promise<{ ok: boolean; provider: string }> {
    if (!this.config.instanceUrl || !this.config.accessToken) {
      throw new Error('Salesforce: instanceUrl and accessToken are required');
    }
    // In production: call /services/data/vXX.X/ to validate token
    return { ok: true, provider: 'salesforce' };
  }

  async sendEvent(event: SalesforceEvent): Promise<void> {
    if (!this.config.instanceUrl || !this.config.accessToken) {
      throw new Error('Salesforce: instanceUrl and accessToken are required');
    }

    // Map to Salesforce Platform Events
    const eventName = event.type.replace(/\./g, '_').replace(/-/g, '_');
    await fetch(
      `${this.config.instanceUrl}/services/data/v59.0/sobjects/${eventName}__e`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.accessToken}`,
        },
        body: JSON.stringify(event.data),
      },
    );
  }
}

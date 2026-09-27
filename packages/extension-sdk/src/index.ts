/**
 * @platform/extension-sdk
 *
 * SDK for building extensions on the AI Company Platform Marketplace.
 *
 * IMPORTANT — Cross-Tenant Isolation:
 * Extensions MUST use the tenant-scoped PlatformApiClient provided at runtime.
 * The client is pre-scoped to the installing tenant's context. Attempting to
 * access data outside this scope will be rejected at the API layer.
 * The withTenant() ORM wrapper enforces this at the DB layer for all queries.
 *
 * Requirements: 28.4, 28.7, 28.8
 */

// ─── Extension Manifest ───────────────────────────────────────────────────────

/**
 * Declares the extension's identity, required permissions, and entry point.
 * Submitted to the Marketplace via POST /marketplace/submit.
 */
export interface ExtensionManifest {
  /** Unique extension name (slug format recommended, e.g. "my-crm-sync") */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Short description shown in the Marketplace listing */
  description: string;
  /** Publisher name or organization */
  publisher: string;
  /** Semantic version string, e.g. "1.2.0" */
  version: string;
  /** Pricing model for the Marketplace listing */
  pricingModel: 'free' | 'paid' | 'usage_based';
  /**
   * Permissions the extension requires.
   * Users must approve these on install.
   * Extensions may ONLY access data within the installing tenant's scope.
   *
   * Available scopes:
   *   read:contacts, write:contacts
   *   read:deals, write:deals
   *   read:campaigns, write:campaigns
   *   read:conversations
   *   send:notifications
   */
  permissions: string[];
  /** Entry point module path relative to the extension package root */
  entryPoint: string;
}

// ─── Platform API Client (stub) ───────────────────────────────────────────────

/**
 * Tenant-scoped API client injected by the platform at extension runtime.
 *
 * All methods are automatically scoped to the tenant in which the extension
 * is installed. Cross-tenant data access is not possible through this client.
 */
export class PlatformApiClient {
  private readonly tenantId: string;
  private readonly baseUrl: string;
  private readonly apiToken: string;

  constructor(options: { tenantId: string; baseUrl: string; apiToken: string }) {
    this.tenantId = options.tenantId;
    this.baseUrl = options.baseUrl;
    this.apiToken = options.apiToken;
  }

  /** Returns the tenant ID this client is scoped to. */
  getTenantId(): string {
    return this.tenantId;
  }

  /**
   * Make an authenticated request to the platform API.
   * The tenant_id is automatically injected via the Authorization header.
   */
  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiToken}`,
        'X-Tenant-Id': this.tenantId,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Platform API error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  /** Convenience: GET request */
  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  /** Convenience: POST request */
  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /** Convenience: PUT request */
  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  /** Convenience: DELETE request */
  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}

// ─── Event Hooks ──────────────────────────────────────────────────────────────

/** Supported platform event types that extensions can subscribe to. */
export type PlatformEventType =
  | 'contact.created'
  | 'contact.updated'
  | 'contact.deleted'
  | 'deal.status_updated'
  | 'campaign.sent'
  | 'conversation.closed'
  | 'call.completed'
  | 'survey.response.submitted';

/** Payload delivered to an event hook handler. */
export interface EventHookPayload<T = Record<string, unknown>> {
  eventType: PlatformEventType;
  tenantId: string;
  timestamp: string;
  data: T;
}

/**
 * Interface for subscribing to platform events.
 * Extensions declare hooks in their manifest and implement handlers here.
 *
 * Errors thrown inside a hook are caught at the sandbox boundary and do NOT
 * propagate to core platform services (Requirement 28.6).
 */
export interface EventHook<T = Record<string, unknown>> {
  /** The event type this hook listens for */
  eventType: PlatformEventType;
  /**
   * Handler called when the event fires.
   * Must complete within 30 seconds or will be terminated by the sandbox.
   */
  handler: (payload: EventHookPayload<T>, client: PlatformApiClient) => Promise<void>;
}

// ─── Extension Definition ─────────────────────────────────────────────────────

/** Full extension definition combining manifest, lifecycle hooks, and event hooks. */
export interface ExtensionDefinition {
  manifest: ExtensionManifest;
  /** Called once when the extension is installed for a tenant. */
  onInstall?: (client: PlatformApiClient) => Promise<void>;
  /** Called once when the extension is uninstalled. Perform cleanup here. */
  onUninstall?: (client: PlatformApiClient) => Promise<void>;
  /** Event hooks the extension subscribes to. */
  hooks?: EventHook[];
}

// ─── createExtension helper ───────────────────────────────────────────────────

/**
 * Helper to define and validate an extension.
 *
 * @example
 * ```ts
 * import { createExtension } from '@platform/extension-sdk';
 *
 * export default createExtension({
 *   manifest: {
 *     name: 'my-crm-sync',
 *     displayName: 'My CRM Sync',
 *     description: 'Syncs contacts to an external CRM',
 *     publisher: 'Acme Corp',
 *     version: '1.0.0',
 *     pricingModel: 'free',
 *     permissions: ['read:contacts', 'write:contacts'],
 *     entryPoint: 'src/index.ts',
 *   },
 *   hooks: [
 *     {
 *       eventType: 'contact.created',
 *       handler: async (payload, client) => {
 *         // client is scoped to the installing tenant only
 *         await client.post('/integrations/crm/sync', payload.data);
 *       },
 *     },
 *   ],
 * });
 * ```
 */
export function createExtension(definition: ExtensionDefinition): ExtensionDefinition {
  const { manifest } = definition;

  if (!manifest.name?.trim()) throw new Error('Extension manifest must include a name');
  if (!manifest.publisher?.trim()) throw new Error('Extension manifest must include a publisher');
  if (!manifest.version?.trim()) throw new Error('Extension manifest must include a version');
  if (!Array.isArray(manifest.permissions)) {
    throw new Error('Extension manifest permissions must be an array');
  }

  return definition;
}

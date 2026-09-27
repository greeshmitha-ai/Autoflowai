# @platform/extension-sdk

SDK for building extensions on the AI Company Platform Marketplace.

## Installation

```bash
pnpm add @platform/extension-sdk
```

## Quick Start

```ts
import { createExtension } from '@platform/extension-sdk';

export default createExtension({
  manifest: {
    name: 'my-crm-sync',
    displayName: 'My CRM Sync',
    description: 'Syncs contacts to an external CRM on creation',
    publisher: 'Acme Corp',
    version: '1.0.0',
    pricingModel: 'free',
    permissions: ['read:contacts'],
    entryPoint: 'src/index.ts',
  },
  hooks: [
    {
      eventType: 'contact.created',
      handler: async (payload, client) => {
        // client is pre-scoped to the installing tenant
        await client.post('/integrations/crm/sync', payload.data);
      },
    },
  ],
  onInstall: async (client) => {
    console.log(`Installed for tenant: ${client.getTenantId()}`);
  },
  onUninstall: async (client) => {
    console.log(`Uninstalled from tenant: ${client.getTenantId()}`);
  },
});
```

## Cross-Tenant Isolation

**Extensions may only access data belonging to the tenant in which they are installed.**

The `PlatformApiClient` injected at runtime is pre-scoped to the installing tenant's context via a tenant-bound API token. All requests automatically include the correct `tenant_id`.

At the database layer, the `withTenant()` ORM wrapper enforces this isolation — every query is filtered by `tenant_id` and cannot be bypassed. Attempting to access another tenant's data will result in an authorization error.

Extension errors are caught at the sandbox boundary and do not propagate to core platform services (Requirement 28.6).

## Submitting to the Marketplace

Submit your extension via the platform API:

```bash
curl -X POST https://api.platform.example/marketplace/submit \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-crm-sync",
    "description": "Syncs contacts to an external CRM",
    "publisher": "Acme Corp",
    "version": "1.0.0",
    "permissions": ["read:contacts"],
    "pricing_model": "free"
  }'
```

The platform will review your submission within **14 business days**. The `reviewed_at` timestamp in the response indicates the expected review completion date.

## API Reference

### `ExtensionManifest`

Declares the extension's identity and required permissions.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Unique slug identifier |
| `displayName` | `string` | Human-readable name |
| `description` | `string` | Marketplace listing description |
| `publisher` | `string` | Publisher name |
| `version` | `string` | Semantic version |
| `pricingModel` | `'free' \| 'paid' \| 'usage_based'` | Pricing model |
| `permissions` | `string[]` | Required permission scopes |
| `entryPoint` | `string` | Entry module path |

### `PlatformApiClient`

Tenant-scoped HTTP client injected at runtime.

- `getTenantId()` — returns the tenant this client is scoped to
- `get<T>(path)` — GET request
- `post<T>(path, body)` — POST request
- `put<T>(path, body)` — PUT request
- `delete<T>(path)` — DELETE request

### `EventHook`

Subscribe to platform events.

```ts
interface EventHook<T = Record<string, unknown>> {
  eventType: PlatformEventType;
  handler: (payload: EventHookPayload<T>, client: PlatformApiClient) => Promise<void>;
}
```

### `createExtension(definition)`

Validates and returns an `ExtensionDefinition`. Throws if the manifest is invalid.

## Available Permission Scopes

| Scope | Description |
|-------|-------------|
| `read:contacts` | Read contact records |
| `write:contacts` | Create and update contacts |
| `read:deals` | Read CRM deal records |
| `write:deals` | Create and update deals |
| `read:campaigns` | Read campaign data |
| `write:campaigns` | Create and update campaigns |
| `read:conversations` | Read conversation transcripts |
| `send:notifications` | Send in-app notifications |

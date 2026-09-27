/**
 * In-memory registry of connected WebSocket clients for the Team Inbox.
 * Allows broadcasting real-time updates to all connected users of a tenant.
 */
import type { SocketStream } from '@fastify/websocket';

interface WsClient {
  userId: string;
  tenantId: string;
  connection: SocketStream;
}

const clients = new Map<string, WsClient[]>();

function tenantKey(tenantId: string): string {
  return tenantId;
}

export function registerClient(client: WsClient): void {
  const key = tenantKey(client.tenantId);
  const existing = clients.get(key) ?? [];
  existing.push(client);
  clients.set(key, existing);
}

export function unregisterClient(tenantId: string, userId: string): void {
  const key = tenantKey(tenantId);
  const existing = clients.get(key) ?? [];
  clients.set(
    key,
    existing.filter((c) => c.userId !== userId),
  );
}

export function broadcastToTenant(tenantId: string, payload: Record<string, unknown>): void {
  const key = tenantKey(tenantId);
  const tenantClients = clients.get(key) ?? [];
  const message = JSON.stringify(payload);

  for (const client of tenantClients) {
    if (client.connection.socket.readyState === client.connection.socket.OPEN) {
      client.connection.socket.send(message);
    }
  }
}

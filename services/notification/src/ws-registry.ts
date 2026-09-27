/**
 * In-memory registry of connected WebSocket clients for the Notification Service.
 * Allows pushing real-time in-app notifications to specific users.
 */
import type { SocketStream } from '@fastify/websocket';

interface WsClient {
  userId: string;
  tenantId: string;
  connection: SocketStream;
}

// Map: tenantId → userId → WsClient
const clients = new Map<string, Map<string, WsClient>>();

export function registerClient(client: WsClient): void {
  let tenantMap = clients.get(client.tenantId);
  if (!tenantMap) {
    tenantMap = new Map();
    clients.set(client.tenantId, tenantMap);
  }
  tenantMap.set(client.userId, client);
}

export function unregisterClient(tenantId: string, userId: string): void {
  const tenantMap = clients.get(tenantId);
  if (tenantMap) {
    tenantMap.delete(userId);
  }
}

export function broadcastToUser(
  tenantId: string,
  userId: string,
  payload: Record<string, unknown>,
): void {
  const tenantMap = clients.get(tenantId);
  if (!tenantMap) return;

  const client = tenantMap.get(userId);
  if (client && client.connection.socket.readyState === client.connection.socket.OPEN) {
    client.connection.socket.send(JSON.stringify(payload));
  }
}

export function broadcastToTenant(tenantId: string, payload: Record<string, unknown>): void {
  const tenantMap = clients.get(tenantId);
  if (!tenantMap) return;

  const message = JSON.stringify(payload);
  for (const client of tenantMap.values()) {
    if (client.connection.socket.readyState === client.connection.socket.OPEN) {
      client.connection.socket.send(message);
    }
  }
}

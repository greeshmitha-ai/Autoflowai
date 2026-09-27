/**
 * In-memory registry of connected operator WebSocket connections.
 * Tracks which operators are online per tenant and routes messages.
 */
import type { SocketStream } from '@fastify/websocket';

export interface OperatorConnection {
  operatorId: string;
  tenantId: string;
  connection: SocketStream;
}

// Map: tenantId -> Map<operatorId, OperatorConnection>
const registry = new Map<string, Map<string, OperatorConnection>>();

export function registerOperator(conn: OperatorConnection): void {
  let tenantMap = registry.get(conn.tenantId);
  if (!tenantMap) {
    tenantMap = new Map();
    registry.set(conn.tenantId, tenantMap);
  }
  tenantMap.set(conn.operatorId, conn);
}

export function unregisterOperator(tenantId: string, operatorId: string): void {
  const tenantMap = registry.get(tenantId);
  if (tenantMap) {
    tenantMap.delete(operatorId);
    if (tenantMap.size === 0) {
      registry.delete(tenantId);
    }
  }
}

export function getOperatorConnection(
  tenantId: string,
  operatorId: string,
): OperatorConnection | undefined {
  return registry.get(tenantId)?.get(operatorId);
}

export function getAvailableOperators(tenantId: string): OperatorConnection[] {
  const tenantMap = registry.get(tenantId);
  if (!tenantMap) return [];
  return Array.from(tenantMap.values()).filter(
    (conn) => conn.connection.socket.readyState === conn.connection.socket.OPEN,
  );
}

export function broadcastToOperators(
  tenantId: string,
  payload: Record<string, unknown>,
): void {
  const operators = getAvailableOperators(tenantId);
  const message = JSON.stringify(payload);
  for (const op of operators) {
    try {
      op.connection.socket.send(message);
    } catch {
      // ignore send errors for individual operators
    }
  }
}

export function sendToOperator(
  tenantId: string,
  operatorId: string,
  payload: Record<string, unknown>,
): boolean {
  const conn = getOperatorConnection(tenantId, operatorId);
  if (!conn || conn.connection.socket.readyState !== conn.connection.socket.OPEN) return false;
  try {
    conn.connection.socket.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

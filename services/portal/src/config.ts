export interface PortalConfig {
  port: number;
  host: string;
  jwtSecret: string;
  jwtPublicKey: string;
  jwtPrivateKey: string;
}

export function loadConfig(): PortalConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '3021', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    jwtSecret: process.env['JWT_SECRET'] ?? 'portal-secret',
    jwtPublicKey: process.env['JWT_PUBLIC_KEY'] ?? '',
    jwtPrivateKey: process.env['JWT_PRIVATE_KEY'] ?? '',
  };
}

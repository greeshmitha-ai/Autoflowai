/** Minimal but valid OpenAPI 3.0 spec covering all platform resources. */
export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'AI Company Platform API',
    version: '1.0.0',
    description: 'Multi-tenant AI Company Platform — REST API reference',
  },
  servers: [{ url: '/api', description: 'API Gateway' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
        },
      },
      ApiKey: {
        type: 'object',
        properties: {
          api_key_id: { type: 'string', format: 'uuid' },
          tenant_id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          scopes: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', enum: ['active', 'revoked'] },
          created_at: { type: 'string', format: 'date-time' },
          revoked_at: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Webhook: {
        type: 'object',
        properties: {
          webhook_id: { type: 'string', format: 'uuid' },
          tenant_id: { type: 'string', format: 'uuid' },
          url: { type: 'string', format: 'uri' },
          events: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', enum: ['active', 'inactive'] },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      WebhookDelivery: {
        type: 'object',
        properties: {
          delivery_id: { type: 'string', format: 'uuid' },
          webhook_id: { type: 'string', format: 'uuid' },
          event_type: { type: 'string' },
          payload: { type: 'object' },
          status: { type: 'string', enum: ['pending', 'delivered', 'failed'] },
          attempts: { type: 'integer' },
          next_retry_at: { type: 'string', format: 'date-time', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      Integration: {
        type: 'object',
        properties: {
          integration_id: { type: 'string', format: 'uuid' },
          tenant_id: { type: 'string', format: 'uuid' },
          provider: { type: 'string', enum: ['slack', 'hubspot', 'salesforce', 'zapier', 'google-workspace'] },
          name: { type: 'string' },
          config: { type: 'object' },
          status: { type: 'string', enum: ['active', 'inactive', 'error'] },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/api-keys': {
      get: {
        summary: 'List API keys',
        operationId: 'listApiKeys',
        tags: ['API Keys'],
        responses: {
          '200': {
            description: 'List of active API keys',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/ApiKey' } },
              },
            },
          },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        summary: 'Create API key',
        operationId: 'createApiKey',
        tags: ['API Keys'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  scopes: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created API key (raw_key returned only once)',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiKey' },
                    {
                      type: 'object',
                      properties: { raw_key: { type: 'string', description: 'Raw key — store securely, never shown again' } },
                    },
                  ],
                },
              },
            },
          },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api-keys/{id}': {
      delete: {
        summary: 'Revoke API key',
        operationId: 'revokeApiKey',
        tags: ['API Keys'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '204': { description: 'Revoked' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/webhooks': {
      get: {
        summary: 'List webhooks',
        operationId: 'listWebhooks',
        tags: ['Webhooks'],
        responses: {
          '200': {
            description: 'List of webhooks',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Webhook' } },
              },
            },
          },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        summary: 'Register webhook',
        operationId: 'registerWebhook',
        tags: ['Webhooks'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['url', 'events'],
                properties: {
                  url: { type: 'string', format: 'uri' },
                  events: { type: 'array', items: { type: 'string' }, minItems: 1 },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Registered webhook',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Webhook' },
              },
            },
          },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/webhooks/{id}/deliveries': {
      get: {
        summary: 'Get webhook delivery log',
        operationId: 'getWebhookDeliveries',
        tags: ['Webhooks'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': {
            description: 'Delivery log',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/WebhookDelivery' } },
              },
            },
          },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/integrations': {
      get: {
        summary: 'List integrations',
        operationId: 'listIntegrations',
        tags: ['Integrations'],
        responses: {
          '200': {
            description: 'List of integrations',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Integration' } },
              },
            },
          },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        summary: 'Create integration',
        operationId: 'createIntegration',
        tags: ['Integrations'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['provider', 'name'],
                properties: {
                  provider: { type: 'string', enum: ['slack', 'hubspot', 'salesforce', 'zapier', 'google-workspace'] },
                  name: { type: 'string' },
                  config: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created integration',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Integration' },
              },
            },
          },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/integrations/{id}': {
      get: {
        summary: 'Get integration',
        operationId: 'getIntegration',
        tags: ['Integrations'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': {
            description: 'Integration',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Integration' },
              },
            },
          },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Not found' },
        },
      },
    },
    '/health': {
      get: {
        summary: 'Health check',
        operationId: 'healthCheck',
        tags: ['System'],
        security: [],
        responses: {
          '200': {
            description: 'Service healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    service: { type: 'string' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

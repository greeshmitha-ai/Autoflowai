import type { FastifyInstance } from 'fastify';
import { ResellerService, NotFoundError, ValidationError } from '../reseller.service.js';
import '../types.js';

export function registerResellerRoutes(
  app: FastifyInstance,
  resellerService: ResellerService,
): void {
  // ─── Sub-Tenant Management ──────────────────────────────────────────────────

  // POST /reseller/sub-tenants — create a Sub_Tenant under the authenticated Reseller
  app.post<{
    Body: {
      name: string;
      domain?: string;
      plan_id?: string;
      branding?: { logo_url?: string; color_scheme?: string; product_name?: string };
    };
  }>('/reseller/sub-tenants', async (request, reply) => {
    const { tenant_id } = request.auth;

    if (!request.body.name) {
      await reply.status(400).send({ error: 'name is required' });
      return;
    }

    try {
      const subTenant = await resellerService.createSubTenant(tenant_id, request.body);
      await reply.status(201).send(subTenant);
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to create sub-tenant');
        await reply.status(500).send({ error: 'Failed to create sub-tenant' });
      }
    }
  });

  // GET /reseller/sub-tenants — list all Sub_Tenants for the Reseller
  app.get('/reseller/sub-tenants', async (request, reply) => {
    const { tenant_id } = request.auth;

    try {
      const subTenants = await resellerService.listSubTenants(tenant_id);
      await reply.status(200).send({ sub_tenants: subTenants });
    } catch (err) {
      app.log.error(err, 'Failed to list sub-tenants');
      await reply.status(500).send({ error: 'Failed to list sub-tenants' });
    }
  });

  // DELETE /reseller/sub-tenants/:id — delete a Sub_Tenant
  app.delete<{ Params: { id: string } }>(
    '/reseller/sub-tenants/:id',
    async (request, reply) => {
      const { tenant_id } = request.auth;
      const { id } = request.params;

      try {
        await resellerService.deleteSubTenant(tenant_id, id);
        await reply.status(204).send();
      } catch (err) {
        if (err instanceof NotFoundError) {
          await reply.status(404).send({ error: err.message });
        } else {
          app.log.error(err, 'Failed to delete sub-tenant');
          await reply.status(500).send({ error: 'Failed to delete sub-tenant' });
        }
      }
    },
  );

  // PATCH /reseller/sub-tenants/:id/suspend — suspend a Sub_Tenant
  app.patch<{ Params: { id: string } }>(
    '/reseller/sub-tenants/:id/suspend',
    async (request, reply) => {
      const { tenant_id } = request.auth;
      const { id } = request.params;

      try {
        await resellerService.suspendSubTenant(tenant_id, id);
        await reply.status(200).send({ message: 'Sub-tenant suspended' });
      } catch (err) {
        if (err instanceof NotFoundError) {
          await reply.status(404).send({ error: err.message });
        } else if (err instanceof ValidationError) {
          await reply.status(400).send({ error: err.message });
        } else {
          app.log.error(err, 'Failed to suspend sub-tenant');
          await reply.status(500).send({ error: 'Failed to suspend sub-tenant' });
        }
      }
    },
  );

  // ─── Branding ───────────────────────────────────────────────────────────────

  // GET /reseller/branding/:domain — return branding config for a given custom domain
  // This endpoint is public (no auth) — used by Dashboard and Auth Service
  app.get<{ Params: { domain: string } }>(
    '/reseller/branding/:domain',
    { config: { skipAuth: true } },
    async (request, reply) => {
      const { domain } = request.params;

      try {
        const branding = await resellerService.getBrandingByDomain(domain);
        if (!branding) {
          await reply.status(404).send({ error: 'No branding found for this domain' });
          return;
        }
        await reply.status(200).send(branding);
      } catch (err) {
        app.log.error(err, 'Failed to get branding');
        await reply.status(500).send({ error: 'Failed to retrieve branding' });
      }
    },
  );

  // PUT /reseller/branding — update branding config for the authenticated Reseller
  app.put<{
    Body: { logo_url?: string; color_scheme?: string; product_name?: string };
  }>('/reseller/branding', async (request, reply) => {
    const { tenant_id } = request.auth;

    try {
      const updated = await resellerService.updateBranding(tenant_id, request.body);
      await reply.status(200).send({ branding: updated.branding });
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to update branding');
        await reply.status(500).send({ error: 'Failed to update branding' });
      }
    }
  });

  // ─── Custom Pricing Plans ───────────────────────────────────────────────────

  // POST /reseller/plans — create a custom pricing plan for Sub_Tenants
  app.post<{
    Body: {
      name: string;
      tier: 'starter' | 'growth' | 'enterprise';
      features?: Record<string, unknown>;
      limits?: {
        contacts?: number;
        call_minutes?: number;
        sms_sent?: number;
        ai_tokens?: number;
      };
      stripe_price_id: string;
    };
  }>('/reseller/plans', async (request, reply) => {
    const { tenant_id } = request.auth;

    if (!request.body.name || !request.body.tier || !request.body.stripe_price_id) {
      await reply.status(400).send({ error: 'name, tier, and stripe_price_id are required' });
      return;
    }

    try {
      const plan = await resellerService.createPlan(tenant_id, request.body);
      await reply.status(201).send(plan);
    } catch (err) {
      app.log.error(err, 'Failed to create plan');
      await reply.status(500).send({ error: 'Failed to create plan' });
    }
  });

  // ─── Dashboard ──────────────────────────────────────────────────────────────

  // GET /reseller/dashboard — aggregate usage metrics across all Sub_Tenants
  app.get('/reseller/dashboard', async (request, reply) => {
    const { tenant_id } = request.auth;

    try {
      const metrics = await resellerService.getDashboardMetrics(tenant_id);
      await reply.status(200).send(metrics);
    } catch (err) {
      app.log.error(err, 'Failed to get dashboard metrics');
      await reply.status(500).send({ error: 'Failed to retrieve dashboard metrics' });
    }
  });
}

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BillingService, NotFoundError, ValidationError } from '../billing.service.js';
import type { BillingConfig } from '../config.js';
import '../types.js';

export function registerBillingRoutes(
  app: FastifyInstance,
  config: BillingConfig,
  billingService: BillingService,
): void {
  // POST /billing/subscribe — create or change subscription
  app.post<{
    Body: { plan_id: string; payment_method_id?: string };
  }>('/billing/subscribe', async (request, reply) => {
    const { tenant_id } = request.auth;

    try {
      const result = await billingService.subscribe(tenant_id, request.body);
      await reply.status(200).send({
        subscription_id: result.subscription.subscription_id,
        plan: {
          plan_id: result.plan.plan_id,
          name: result.plan.name,
          tier: result.plan.tier,
        },
        status: result.subscription.status,
        current_period_start: result.subscription.current_period_start,
        current_period_end: result.subscription.current_period_end,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to create/update subscription');
        await reply.status(500).send({ error: 'Failed to process subscription' });
      }
    }
  });

  // POST /billing/upgrade — upgrade or downgrade subscription with proration
  app.post<{
    Body: { plan_id: string };
  }>('/billing/upgrade', async (request, reply) => {
    const { tenant_id } = request.auth;

    try {
      const result = await billingService.upgradeDowngrade(tenant_id, request.body.plan_id);
      await reply.status(200).send({
        subscription_id: result.subscription.subscription_id,
        plan: {
          plan_id: result.plan.plan_id,
          name: result.plan.name,
          tier: result.plan.tier,
        },
        status: result.subscription.status,
        proration_amount_cents: result.proration_amount_cents,
        current_period_start: result.subscription.current_period_start,
        current_period_end: result.subscription.current_period_end,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to upgrade/downgrade subscription');
        await reply.status(500).send({ error: 'Failed to process plan change' });
      }
    }
  });

  // GET /billing/usage — current period usage per metered resource
  app.get('/billing/usage', async (request, reply) => {
    const { tenant_id } = request.auth;

    try {
      const usage = await billingService.getUsage(tenant_id);
      await reply.status(200).send(usage);
    } catch (err) {
      app.log.error(err, 'Failed to get usage');
      await reply.status(500).send({ error: 'Failed to retrieve usage data' });
    }
  });

  // GET /billing/invoices — list invoices
  app.get('/billing/invoices', async (request, reply) => {
    const { tenant_id } = request.auth;

    try {
      const invoiceList = await billingService.listInvoices(tenant_id);
      await reply.status(200).send({ invoices: invoiceList });
    } catch (err) {
      app.log.error(err, 'Failed to list invoices');
      await reply.status(500).send({ error: 'Failed to retrieve invoices' });
    }
  });

  // GET /billing/invoices/:id/pdf — return signed S3 URL or Stripe PDF URL
  app.get<{ Params: { id: string } }>('/billing/invoices/:id/pdf', async (request, reply) => {
    const { tenant_id } = request.auth;
    const { id } = request.params;

    try {
      const pdfUrl = await billingService.getInvoicePdfUrl(tenant_id, id);
      if (!pdfUrl) {
        await reply.status(404).send({ error: 'PDF not yet available' });
        return;
      }
      await reply.status(200).send({ pdf_url: pdfUrl });
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to get invoice PDF');
        await reply.status(500).send({ error: 'Failed to retrieve invoice PDF' });
      }
    }
  });

  // POST /billing/webhook — Stripe webhook endpoint (no auth)
  app.post<{ Body: Buffer }>(
    '/billing/webhook',
    { config: { skipAuth: true } },
    async (request, reply) => {
      const signature = request.headers['stripe-signature'] as string;

      if (!signature) {
        await reply.status(400).send({ error: 'Missing stripe-signature header' });
        return;
      }

      try {
        await billingService.handleStripeWebhook(
          request.body as unknown as Buffer,
          signature,
          config.stripeWebhookSecret,
        );
        await reply.status(200).send({ received: true });
      } catch (err) {
        if (err instanceof ValidationError) {
          await reply.status(400).send({ error: err.message });
        } else {
          app.log.error(err, 'Stripe webhook processing failed');
          await reply.status(500).send({ error: 'Webhook processing failed' });
        }
      }
    },
  );
}

/**
 * Kafka consumer for billing.usage events.
 * Aggregates usage per tenant per billing period.
 */
import { EventConsumer } from '@platform/events';
import type { UsageMeterEvent } from '@platform/events';
import { BillingService } from './billing.service.js';

export async function startUsageConsumer(
  billingService: BillingService,
  kafkaBrokers: string[],
): Promise<EventConsumer> {
  const consumer = new EventConsumer({
    brokers: kafkaBrokers,
    clientId: 'billing-usage-consumer',
    groupId: 'billing-usage-group',
  });

  consumer.withDeadLetterQueue({ topic: 'billing.usage.dlq', maxRetries: 3 });

  consumer.on<UsageMeterEvent>('billing.usage', async (event) => {
    const { tenant_id, payload } = event;
    await billingService.recordUsage(tenant_id, payload.resource, payload.quantity);
  });

  await consumer.connect();
  await consumer.subscribe(['billing']);
  await consumer.run();

  return consumer;
}

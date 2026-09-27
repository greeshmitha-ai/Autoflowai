import { loadConfig } from './config.js';
import { startBillingServer } from './server.js';
import { BillingService } from './billing.service.js';
import { startUsageConsumer } from './usage-consumer.js';
import { startScheduler } from './scheduler.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const app = await startBillingServer(config);

  // Start Kafka consumer for usage metering events
  const billingService = new BillingService(config.stripeSecretKey, config.kafkaBrokers);

  if (config.kafkaBrokers.length > 0 && config.kafkaBrokers[0] !== 'localhost:9092') {
    try {
      await startUsageConsumer(billingService, config.kafkaBrokers);
      app.log.info('Usage consumer started');
    } catch (err) {
      app.log.warn({ err }, 'Failed to start usage consumer — continuing without Kafka');
    }
  }

  // Start scheduled jobs
  startScheduler(billingService);
  app.log.info('Billing scheduler started');

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down billing service...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error starting billing service:', err);
  process.exit(1);
});

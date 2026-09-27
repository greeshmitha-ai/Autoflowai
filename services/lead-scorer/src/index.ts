import { loadConfig } from './config.js';
import { startLeadScorerServer } from './server.js';
import { LeadScorerService } from './lead-scorer.service.js';
import { startEventConsumer } from './event-consumer.js';
import { startScheduler } from './scheduler.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const app = await startLeadScorerServer(config);
  const service = new LeadScorerService();

  // Start Kafka consumer for qualifying interaction events
  if (config.kafkaBrokers.length > 0 && config.kafkaBrokers[0] !== 'localhost:9092') {
    try {
      await startEventConsumer(service, config.kafkaBrokers);
      app.log.info('Lead scorer event consumer started');
    } catch (err) {
      app.log.warn({ err }, 'Failed to start event consumer — continuing without Kafka');
    }
  }

  // Start daily recalculation scheduler
  startScheduler(service);
  app.log.info('Lead scorer scheduler started');

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down lead scorer service...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error starting lead scorer service:', err);
  process.exit(1);
});

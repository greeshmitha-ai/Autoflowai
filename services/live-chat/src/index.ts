import { loadConfig } from './config.js';
import { startLiveChatServer } from './server.js';
import { runEscalationConsumer } from './escalation-consumer.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const app = await startLiveChatServer(config);

  // Start Kafka consumer for escalation events
  let consumer: import('@platform/events').EventConsumer | undefined;
  try {
    consumer = await runEscalationConsumer(config);
    app.log.info('Live Chat escalation consumer started');
  } catch (err) {
    app.log.warn({ err }, 'Failed to start escalation consumer — running without Kafka');
  }

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down Live Chat service...');
    try {
      await consumer?.disconnect();
    } catch {
      // ignore
    }
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error starting Live Chat service:', err);
  process.exit(1);
});

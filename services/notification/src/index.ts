import { loadConfig } from './config.js';
import { startNotificationServer } from './server.js';
import { runNotificationConsumer } from './notification-consumer.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const app = await startNotificationServer(config);

  let consumer: import('@platform/events').EventConsumer | undefined;
  try {
    consumer = await runNotificationConsumer(config);
    app.log.info('Notification event consumer started');
  } catch (err) {
    app.log.warn({ err }, 'Failed to start notification consumer — running without Kafka');
  }

  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down Notification service...');
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
  console.error('Fatal error starting Notification service:', err);
  process.exit(1);
});

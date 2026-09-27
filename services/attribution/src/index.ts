import { loadConfig } from './config.js';
import { startAttributionServer } from './server.js';
import { runAttributionConsumer } from './attribution-consumer.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const app = await startAttributionServer(config);

  let consumer: import('@platform/events').EventConsumer | undefined;
  try {
    consumer = await runAttributionConsumer(config);
    app.log.info('Attribution event consumer started');
  } catch (err) {
    app.log.warn({ err }, 'Failed to start attribution consumer — running without Kafka');
  }

  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down Attribution service...');
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
  console.error('Fatal error starting Attribution service:', err);
  process.exit(1);
});

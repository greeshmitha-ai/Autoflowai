import { loadConfig } from './config.js';
import { startTeamInboxServer } from './server.js';
import { runInboxConsumer } from './inbox-consumer.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const app = await startTeamInboxServer(config);

  let consumer: import('@platform/events').EventConsumer | undefined;
  try {
    consumer = await runInboxConsumer(config);
    app.log.info('Team Inbox event consumer started');
  } catch (err) {
    app.log.warn({ err }, 'Failed to start inbox consumer — running without Kafka');
  }

  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down Team Inbox service...');
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
  console.error('Fatal error starting Team Inbox service:', err);
  process.exit(1);
});

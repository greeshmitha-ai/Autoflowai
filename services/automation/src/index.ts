import { loadConfig } from './config.js';
import { startAutomationServer } from './server.js';
import { ExecutionEngine } from './execution.engine.js';

const config = loadConfig();

// Start HTTP server
startAutomationServer(config)
  .then((app) => {
    app.log.info(`Automation service listening on ${config.host}:${config.port}`);
  })
  .catch((err) => {
    console.error('Failed to start automation service:', err);
    process.exit(1);
  });

// Start Kafka consumer / execution engine
const engine = new ExecutionEngine(config);
engine.start().catch((err) => {
  console.error('Failed to start execution engine:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await engine.stop();
  process.exit(0);
});

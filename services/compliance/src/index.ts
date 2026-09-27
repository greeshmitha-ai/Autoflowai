import { loadConfig } from './config.js';
import { startComplianceServer } from './server.js';
import { startAuditPurgeJob } from './jobs/audit-purge.job.js';
import { startRetentionPurgeJob } from './jobs/retention-purge.job.js';

const config = loadConfig();

startComplianceServer(config)
  .then((app) => {
    app.log.info(`Compliance service listening on ${config.host}:${config.port}`);
  })
  .catch((err) => {
    console.error('Failed to start compliance service:', err);
    process.exit(1);
  });

// Start scheduled jobs
startAuditPurgeJob();
startRetentionPurgeJob();

process.on('SIGTERM', () => {
  process.exit(0);
});

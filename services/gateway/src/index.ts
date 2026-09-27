import { startGateway } from './server.js';

startGateway().catch((err) => {
  console.error('Failed to start API Gateway:', err);
  process.exit(1);
});

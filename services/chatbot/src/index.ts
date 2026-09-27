import { loadConfig } from './config.js';
import { startChatbotServer } from './server.js';

const config = loadConfig();

startChatbotServer(config)
  .then((app) => {
    app.log.info(`Chatbot service listening on ${config.host}:${config.port}`);
  })
  .catch((err) => {
    console.error('Failed to start chatbot service:', err);
    process.exit(1);
  });

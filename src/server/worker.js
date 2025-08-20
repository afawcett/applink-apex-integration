'use strict';

import redisClient from './config/redis.js';
import { init } from '@heroku/applink/dist/index.js';

const JOBS_CHANNEL = 'jobsChannel';

// Import the service handlers
import { handleQuoteMessage } from './services/createQuotes.js';

// Initialize AppLink SDK
const sdk = init();

// --- Pub/Sub Message Handler ---
async function handleJobMessage (channel, message) {
  if (channel !== JOBS_CHANNEL) {
    return;
  }

  console.log(`[Worker] Received message from channel: ${channel}`);
  let jobData;
  try {
    jobData = JSON.parse(message);
  } catch (err) {
    console.error('[Worker] Failed to parse job message:', message, err);
    return; // Cannot proceed
  }

  const { jobId, jobType } = jobData;
  const logger = console; // Use console logger for simplicity here

  // Determine which handler to call based on payload
  try {
    // Get named connection from AppLink SDK
    logger.info(`[Worker] Getting 'worker' connection from AppLink SDK for job ${jobId}`);
    const sfContext = await sdk.addons.applink.getAuthorization('worker');    
    if (!sfContext || !sfContext.dataApi) {
      logger.error(`Failed to get valid Salesforce context from AppLink SDK for Job ID: ${jobId}`);
      return;
    }

    // Route to imported service handlers
    if (jobType === 'quote') {
      logger.info(`[Worker] Routing job ${jobId} to handleQuoteMessage`);
      await handleQuoteMessage(jobData, logger);
    } else {
      logger.warn(`[Worker] Received job with unknown jobType: ${jobType}`);
    }
  } catch (handlerError) {
    logger.error({ err: handlerError, jobId, jobType }, `[Worker] Error executing handler for job`);
  }
}

async function startWorker () {
  console.log('[Worker] Starting (Pub/Sub mode)...');
  if (redisClient.status !== 'ready') {
    console.log('[Worker] Redis client not ready, waiting for ready event...');
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 10000);
      redisClient.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
      redisClient.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }
  console.log('[Worker] Redis client connected.');
  redisClient.subscribe(JOBS_CHANNEL, (err, count) => {
    if (err) {
      console.error(`[Worker] Failed to subscribe to ${JOBS_CHANNEL}:`, err);
      process.exit(1);
    }
    console.log(`[Worker] Subscribed successfully to ${JOBS_CHANNEL}. Listener count: ${count}`);
  });
  redisClient.on('message', handleJobMessage);
  console.log(`[Worker] Subscribed to ${JOBS_CHANNEL} and waiting for messages...`);
}

startWorker()
  .catch(err => {
    console.error('[Worker] Critical error during startup:', err);
    process.exit(1);
  });

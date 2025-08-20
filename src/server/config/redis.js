import Redis from 'ioredis';
import config from './index.js'; // Use import

// Create a new Redis client instance
// It will automatically use the REDIS_URL from the environment if available,
// otherwise, it falls back to the default provided in the config.
const redisClient = new Redis(config.redisUrl || 'redis://127.0.0.1:6379', {
  // Add TLS options for Heroku Redis connections (especially locally)
  tls: {
    rejectUnauthorized: false // Allow self-signed certs (use with caution, okay for local dev)
  },
  // Keep alive settings
  keepAlive: 1000 * 30, // Send keepalive probe every 30 seconds.
  // Retry strategy (optional but recommended)
  retryStrategy (times) {
    const delay = Math.min(times * 50, 2000); // Exponential backoff up to 2 seconds
    console.warn(`Redis connection attempt ${times} failed, retrying in ${delay}ms`);
    return delay;
  },
  maxRetriesPerRequest: 3 // Optional: Limit retries for individual commands
});

redisClient.on('connect', () => {
  console.log('🔌 Connected to Redis successfully.');
});

redisClient.on('error', (error) => {
  console.error('❌ Redis connection error:', error);
  // Depending on the error, you might want to exit the process
  // if Redis is critical for the application's core functionality.
  // process.exit(1);
});

// Export the client instance for use in other parts of the application
export default redisClient;

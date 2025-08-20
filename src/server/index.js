import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import config from './config/index.js';
import salesforcePlugin from './middleware/salesforce.js';
import apiRoutes from './routes/api.js';
import formbody from '@fastify/formbody';

// Basic logging configuration
const fastify = Fastify({
  logger: {
    level: config.logLevel // Use config value
  }
});

// Register Swagger for dynamic generation
fastify.register(swagger, {
  openapi: {
    openapi: '3.0.1',
    info: {
      title: 'Quote Generation API',
      description: 'API for generating quotes both synchronously and asynchronously, interacting with Salesforce via AppLink.',
      version: '1.0.0'
    },
    servers: [
      { url: 'http://localhost:5000', description: 'Local development server' }
    ],
    tags: [
      { name: 'Pricing Engine', description: 'Quote generation endpoints' }
    ],

  },
  // Add refResolver to use $id for references
  refResolver: {
    buildLocalReference (json, baseUri, fragment, i) {
      return json.$id || `def-${i}`; // Use $id, fallback to default def-N
    }
  }
});

// Register Swagger UI
fastify.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false
  },
  staticCSP: true,
  transformStaticCSP: (header) => header
});

// Register Salesforce middleware globally
// This will run the preHandler for every request
fastify.register(salesforcePlugin);

// Register formbody plugin
fastify.register(formbody);

// Placeholder for health check
fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

// Register API routes with prefix
fastify.register(apiRoutes, { prefix: '/api' });

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' }); // Listen on all interfaces for Heroku
    fastify.log.info(`Server listening on port ${config.port}`);
    fastify.log.info(`Swagger UI available at /docs`);
  } catch (err) {
    // Use Pino's preferred error logging format
    fastify.log.error({ err: err }, 'Error starting server');
    process.exit(1);
  }
};

start();

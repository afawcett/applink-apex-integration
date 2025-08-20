import crypto from 'node:crypto';
import redisClient from '../config/redis.js';
import { generateQuote } from '../services/createQuote.js';

// Define a single channel for all job types
const JOBS_CHANNEL = 'jobsChannel';

// Define schemas for request validation and Swagger generation
const createQuotesSchema = {
  tags: ['Pricing Engine'],
  summary: 'Submit Batch Quote Generation Job',
  description: "Calculate pricing and generate quotes from a list of Opportunity IDs.",
  operationId: 'createQuotes',
  'x-sfdc': {
    heroku: {
      authorization: {
        connectedApp: 'QuoteServiceConnectedApp',
        permissionSet: 'QuoteServicePermissions'
      }
    }
  },
  body: {
    $ref: 'CreateQuotesRequest#'
  },
  response: {
    201: { // Use 201 Created for async operations (required by Salesforce External Services)
      description: 'Quotes created successfully',
      content: { // Add content wrapper for $ref
        'application/json': {
          schema: {
            $ref: 'CreateQuotesResponse#'
          }
        }
      }
    }
  },
  // Add callbacks section as custom extension for OpenAPI generation
  'x-callbacks': {
    createQuotesResponse: {
      '{$request.body#/callbackUrl}': {
        post: {
          description: 'Callback response with quote creation results',
          operationId: 'createQuotesResponseCallback',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    jobId: { type: 'string' },
                    opportunityIds: {
                      type: 'array',
                      items: { type: 'string' }
                    },
                    quoteIds: {
                      type: 'array',
                      items: { type: 'string' }
                    },
                    status: { type: 'string' },
                    errors: { 
                      type: 'array', 
                      items: { type: 'string' } 
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Callback received successfully'
            }
          }
        }
      }
    }
  }
};

const createQuoteSchema = {
  tags: ['Pricing Engine'],
  summary: 'Generate a Quote for a given Opportunity',
  description: 'Calculate pricing and generate an associated Quote.',
  operationId: 'createQuote',
  'x-sfdc': {
    heroku: {
      authorization: {
        connectedApp: 'QuoteServiceConnectedApp',
        permissionSet: 'QuoteServicePermissions'
      }
    }
  },
  body: {
    $ref: 'CreateQuoteRequest#'
  },
  response: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            $ref: 'CreateQuoteResponse#'
          }
        }
      }
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              error: { type: 'boolean' },
              message: {
                type: 'string',
                description: 'Error message when client context is missing or invalid'
              }
            }
          }
        }
      }
    },
    500: {
      description: 'Internal Server Error',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              error: { type: 'boolean' },
              message: {
                type: 'string',
                description: 'Error message when an unexpected error occurs'
              }
            }
          }
        }
      }
    }
  }
};

const CreateQuoteRequestSchema = {
  $id: 'CreateQuoteRequest',
  type: 'object',
  required: ['opportunityId'],
  description: 'Request to generate a quote, includes the opportunity ID to extract product information',
  properties: {
    opportunityId: {
      type: 'string',
      description: 'A record Id for the opportunity'
    }
  }
};

const CreateQuoteResponseSchema = {
  $id: 'CreateQuoteResponse',
  type: 'object',
  description: 'Response includes the record Id of the generated quote.',
  properties: {
    quoteId: {
      type: 'string',
      description: 'A record Id for the generated quote'
    }
  }
};

const CreateQuotesRequestSchema = {
  $id: 'CreateQuotesRequest',
  type: 'object',
  required: ['opportunityIds'],
  description: 'Request to generate quotes for multiple opportunities',
  properties: {
    opportunityIds: {
      type: 'array',
      items: {
        type: 'string'
      },
      description: 'Array of opportunity IDs to generate quotes for'
    },
    callbackUrl: {
      type: 'string',
      description: 'Callback URL for asynchronous response'
    }
  }
};

const CreateQuotesResponseSchema = {
  $id: 'CreateQuotesResponse',
  type: 'object',
  required: ['jobId'],
  description: 'Response for batch quote generation - returns job ID for async operation',
  properties: {
    jobId: {
      type: 'string',
      description: 'Unique identifier for tracking the background job'
    }
  }
};

/**
 * API Routes plugin for handling all quote-related operations.
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} opts Plugin options
 */
export default async function apiRoutes (fastify, opts) {

  // Register schema components
  fastify.addSchema(CreateQuoteRequestSchema);
  fastify.addSchema(CreateQuoteResponseSchema);
  fastify.addSchema(CreateQuotesRequestSchema);
  fastify.addSchema(CreateQuotesResponseSchema);

  // === Routes ===

  // Synchronous quote creation
  fastify.post('/createQuote', {
    schema: createQuoteSchema,
    handler: async (request, reply) => {
      const { opportunityId } = request.body;

      try {
        if (!request.salesforce) {
          const error = new Error('Salesforce client not initialized');
          reply.code(401).send({
            error: true,
            message: error.message
          });
          return;
        }

        // Delegate to createQuote service
        const result = await generateQuote({ opportunityId }, request.salesforce);
        return result;
      } catch (error) {
        reply.code(error.statusCode || 500).send({
          error: true,
          message: error.message
        });
      }
    }
  });

  // Asynchronous batch quote creation
  fastify.post('/createQuotes', {
    schema: createQuotesSchema,
    handler: async (request, reply) => {
      const { opportunityIds, callbackUrl } = request.body;
      const jobId = crypto.randomUUID();
      const jobPayload = JSON.stringify({
        jobId,
        jobType: 'quote',
        opportunityIds,
        callbackUrl
      });
      try {
        // Pass the work to the worker and respond with HTTP 201 to indicate the job has been accepted
        const receivers = await redisClient.publish(JOBS_CHANNEL, jobPayload);
        request.log.info({ jobId, channel: JOBS_CHANNEL, payload: { jobType: 'quote', opportunityIds, callbackUrl }, receivers }, `Job published to Redis channel ${JOBS_CHANNEL}. Receivers: ${receivers}`);
        return reply.code(201).send({ jobId }); // Return 201 Created with Job ID
      } catch (error) {
        request.log.error({ err: error, jobId, channel: JOBS_CHANNEL }, 'Failed to publish job to Redis channel');
        return reply.code(500).send({ error: 'Failed to publish job.' });
      }
    }
  });

  fastify.log.info('API routes registered for all quote operations.');
}

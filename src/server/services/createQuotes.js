'use strict';

import { init } from '@heroku/applink/dist/index.js';

// Initialize AppLink SDK
const sdk = init();

/**
 * Handles quote generation jobs.
 * @param {object} jobData - The job data object from Redis.
 * @param {object} logger - A logger instance.
 */
async function handleQuoteMessage (jobData, logger) {
  const { jobId, opportunityIds, callbackUrl } = jobData;
  
  // Use opportunityIds in the query
  if (!opportunityIds || !Array.isArray(opportunityIds) || opportunityIds.length === 0) {
    logger.warn(`No opportunityIds provided for Job ID: ${jobId}`);
    return;
  }
  logger.info(`Worker received job with ID: ${jobId} for ${opportunityIds.length} opportunity IDs`);

  try {
    // *** Get named connection from AppLink SDK instead of using passed sfContext ***
    logger.info(`Getting 'worker' connection from AppLink SDK for job ${jobId}`);
    const sfContext = await sdk.addons.applink.getAuthorization('worker');
    
    if (!sfContext || !sfContext.dataApi) {
      logger.error(`Failed to get valid Salesforce context from AppLink SDK for Job ID: ${jobId}`);
      return;
    }
    
    const dataApi = sfContext.dataApi;

    // Fetch Standard Pricebook ID
    const standardPricebookRecords = await queryAll("SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1", sfContext, logger);
    if (!standardPricebookRecords || standardPricebookRecords.length === 0) {
      logger.error(`Standard Pricebook not found for Job ID: ${jobId}.`);
      throw new Error('Standard Pricebook not found.');
    }
    const standardPricebookId = standardPricebookRecords[0].fields.Id || standardPricebookRecords[0].fields.id;

    // Query Opportunities by ID
    const opportunityIdList = opportunityIds.map(id => `'${id}'`).join(',');
    const oppQuery = `
      SELECT Id, Name, AccountId, CloseDate, StageName, Amount,
             (SELECT Id, Product2Id, Quantity, UnitPrice, PricebookEntryId FROM OpportunityLineItems)
      FROM Opportunity
      WHERE Id IN (${opportunityIdList})
    `; // Use the provided opportunity IDs
    const opportunities = await queryAll(oppQuery, sfContext, logger);
    if (!opportunities || opportunities.length === 0) {
      logger.warn(`No Opportunities or related OpportunityLineItems found for opportunity IDs: ${opportunityIds.join(', ')}`);
      return;
    }

    logger.info(`Processing ${opportunities.length} Opportunities`);
    const unitOfWork = dataApi.newUnitOfWork();
    const quoteRefs = new Map();
    let totalLineItems = 0;

    opportunities.forEach(oppSObject => {
      // Access fields using .fields property
      const opp = oppSObject.fields;
      const oppId = opp.Id || opp.id; // Get the actual ID
      // Access subquery results correctly
      const lineItemsResult = oppSObject.subQueryResults?.OpportunityLineItems;
      if (!lineItemsResult?.records || lineItemsResult.records.length === 0) {
        logger.warn(`Opportunity ${oppId} has no line items. Skipping quote creation for Job ID: ${jobId}`);
        return;
      }

      try {
        // 1. Create Quote
        const quoteName = 'New Quote';
        const expirationDate = new Date(opp.CloseDate);
        expirationDate.setDate(expirationDate.getDate() + 30); // Quote expires 30 days after CloseDate
        // Calculate discount based on hardcoded region (matching Java example 'US')
        const discount = getDiscountForRegion('NAMER', logger); // Use hardcoded region 'NAMER'
        const quoteRef = unitOfWork.registerCreate({
          type: 'Quote',
          fields: {
            Name: quoteName.substring(0, 80), // Ensure name is within limit
            OpportunityId: oppId,
            Pricebook2Id: standardPricebookId, // *** 3. Use fetched Standard Pricebook ID ***
            ExpirationDate: expirationDate.toISOString().split('T')[0],
            Status: 'Draft'
          }
        });
        quoteRefs.set(oppId, quoteRef);

        // 2. Create QuoteLineItems from OpportunityLineItems
        const currentOppLineItemCount = lineItemsResult.records.length;
        totalLineItems += currentOppLineItemCount;
        lineItemsResult.records.forEach(oliSObject => {
          // Apply discount to QuoteLineItem UnitPrice
          const oli = oliSObject.fields;
          const originalUnitPrice = oli.UnitPrice;
          const quantity = oli.Quantity;
          // Ensure discount is a number between 0 and 1
          const validDiscount = (typeof discount === 'number' && discount >= 0 && discount <= 1) ? discount : 0;
          const calculatedDiscountedPrice = (originalUnitPrice != null && validDiscount != null)
                                            ? originalUnitPrice * (1 - validDiscount)
                                            : originalUnitPrice; // Default to original if calculation fails
          unitOfWork.registerCreate({
            type: 'QuoteLineItem',
            fields: {
              QuoteId: quoteRef.toApiString(), // Reference the quote created above
              PricebookEntryId: oli.PricebookEntryId, // Must be valid PBE in the Quote's Pricebook
              Quantity: quantity,
              UnitPrice: calculatedDiscountedPrice // Use the calculated discounted price
            }
          });
        });
      } catch (err) {
        logger.error({ err: err, opportunityId: oppId }, `Error preparing UoW for Opportunity ${oppId} for Job ID: ${jobId}`);
      }
    });

    if (quoteRefs.size === 0) {
      logger.warn(`No quotes were registered for creation for Job ID: ${jobId}.`);
      return;
    }

    logger.info(`Submitting UnitOfWork to create ${quoteRefs.size} Quotes and ${totalLineItems} Line Items`);
    const commitResult = await dataApi.commitUnitOfWork(unitOfWork);

    // Process results
    let successCount = 0;
    let failureCount = 0;

    // Iterate through the original quoteRefs Map we created
    quoteRefs.forEach((originalQuoteRef, oppId) => {
      // Use the original reference object to get the result from the commit map
      const result = commitResult.get(originalQuoteRef);
      // Check for presence of id (success) or errors (failure)
      if (result?.id) { // Check if ID exists -> success
        successCount++;
      } else {
        failureCount++;
        // Log errors if they exist, otherwise log the whole result
        logger.error({ errors: result?.errors ?? result, opportunityId: oppId, refId: originalQuoteRef.id }, `Failed to create Quote for Opportunity ${oppId} (Ref ID: ${originalQuoteRef.id}) in Job ID: ${jobId}`);
      }
    });

    logger.info(`Job processing completed for Job ID: ${jobId}. Results: ${successCount} succeeded, ${failureCount} failed.`);

    // Execute callback if callbackUrl is provided
    if (callbackUrl) {
      try {
        const callbackResults = {
          jobId,
          opportunityIds,
          quoteIds: Array.from(quoteRefs.values()).map(ref => {
            const result = commitResult.get(ref);
            return result?.id || null;
          }).filter(id => id !== null),
          status: failureCount === 0 ? 'completed' : 'completed_with_errors',
          errors: failureCount > 0 ? [`${failureCount} quotes failed to create`] : []
        };
        const requestOptions = {
          method: 'POST',
          body: JSON.stringify(callbackResults),
          headers: { 'Content-Type': 'application/json' }
        };
        const response = await sfContext.request(callbackUrl, requestOptions);
        logger.info(`Callback executed successfully for Job ID: ${jobId}`);
      } catch (callbackError) {
        logger.error({ err: callbackError, jobId }, `Failed to execute callback for Job ID: ${jobId}`);
      }
    } else {
      logger.warn(`No callbackUrl provided for Job ID: ${jobId}, skipping callback execution`);
    }

  } catch (error) {
    logger.error({ err: error }, `Error executing batch for Job ID: ${jobId}`);
  }
}

// Helper function mirroring the Java example's discount logic
function getDiscountForRegion (region, logger) {
  // Basic discount logic based on region
  switch (region) {
    case 'NAMER':
      return 0.1; // 10%
    case 'EMEA':
      return 0.15; // 15%
    case 'APAC':
      return 0.08; // 8%
    default:
      return 0.05; // 5%
  }
}

/**
 * Helper function to fetch all records for a SOQL query, handling pagination.
 * @param {string} soql - The SOQL query string.
 * @param {object} sfContext - The initialized Salesforce context (ContextImpl instance or named connection).
 * @param {object} logger - A logger instance.
 * @returns {Promise<Array>} - A promise that resolves with an array of all records.
 */
async function queryAll (soql, sfContext, logger) {
  let allRecords = [];
  try {
    // Handle both ContextImpl (sfContext.org.dataApi) and named connection (sfContext.dataApi) structures
    const dataApi = sfContext.org?.dataApi || sfContext.dataApi;
    
    if (!dataApi) {
      throw new Error('No dataApi available in sfContext');
    }
    
    let result = await dataApi.query(soql);
    allRecords = allRecords.concat(result.records);
    while (!result.done && result.nextRecordsUrl) {
      result = await dataApi.queryMore(result); // Use result object directly
      allRecords = allRecords.concat(result.records);
    }
  } catch (error) {
    logger.error({ err: error, soql }, 'Error during queryAll execution');
    throw error; // Re-throw the error to be caught by the caller
  }
  return allRecords;
}

export {
  handleQuoteMessage
}; 
/**
 * Generate a quote for a given opportunity
 * @param {Object} request - The quote generation request
 * @param {string} request.opportunityId - The opportunity ID
 * @param {import('@heroku/applink').AppLinkClient} client - The Salesforce client
 * @returns {Promise<Object>} The generated quote response
 */
export async function generateQuote (request, client) {
  try {
    const { context } = client;
    const org = context.org;
    const dataApi = org.dataApi;

    // Fetch Standard Pricebook ID
    const standardPricebookRecords = await dataApi.query("SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1");
    if (!standardPricebookRecords.records || standardPricebookRecords.records.length === 0) {
      throw new Error('Standard Pricebook not found.');
    }
    const standardPricebookId = standardPricebookRecords.records[0].fields.Id || standardPricebookRecords.records[0].fields.id;

    // Query Opportunity to get CloseDate for ExpirationDate calculation
    const oppQuery = `SELECT Id, Name, CloseDate FROM Opportunity WHERE Id = '${request.opportunityId}'`;
    const oppResult = await dataApi.query(oppQuery);
    
    if (!oppResult.records || oppResult.records.length === 0) {
      const error = new Error(`Opportunity not found for ID: ${request.opportunityId}`);
      error.statusCode = 404;
      throw error;
    }
    
    const opportunity = oppResult.records[0].fields;
    const closeDate = opportunity.CloseDate;

    // Query opportunity line items
    const soql = `SELECT Id, Product2Id, Quantity, UnitPrice, PricebookEntryId FROM OpportunityLineItem WHERE OpportunityId = '${request.opportunityId}'`;
    const queryResult = await dataApi.query(soql);

    if (!queryResult.records.length) {
      const error = new Error(`No OpportunityLineItems found for Opportunity ID: ${request.opportunityId}`);
      error.statusCode = 404;
      throw error;
    }

    // Calculate discount based on hardcoded region
    const discount = getDiscountForRegion('NAMER'); // Use hardcoded region 'NAMER'

    // Create Quote using Unit of Work
    const unitOfWork = dataApi.newUnitOfWork();

    // Add Quote
    const quoteName = 'New Quote';
    const expirationDate = new Date(closeDate);
    expirationDate.setDate(expirationDate.getDate() + 30); // Quote expires 30 days after CloseDate
    
    const quoteRef = unitOfWork.registerCreate({
      type: 'Quote',
      fields: {
        Name: quoteName.substring(0, 80), // Ensure name is within limit
        OpportunityId: request.opportunityId,
        Pricebook2Id: standardPricebookId,
        ExpirationDate: expirationDate.toISOString().split('T')[0], // Add ExpirationDate
        Status: 'Draft'
      }
    });

    // Add QuoteLineItems
    queryResult.records.forEach(record => {
      const quantity = parseFloat(record.fields.Quantity);
      const unitPrice = parseFloat(record.fields.UnitPrice);

      // Apply discount to QuoteLineItem UnitPrice (matching createQuotes.js exactly)
      const originalUnitPrice = unitPrice;
      const calculatedDiscountedPrice = originalUnitPrice != null 
                                        ? originalUnitPrice * (1 - discount)
                                        : originalUnitPrice; // Default to original if calculation fails

      unitOfWork.registerCreate({
        type: 'QuoteLineItem',
        fields: {
          QuoteId: quoteRef.toApiString(),
          PricebookEntryId: record.fields.PricebookEntryId,
          Quantity: quantity,
          UnitPrice: calculatedDiscountedPrice
        }
      });
    });

    // Commit all records in one transaction
    try {
      const results = await dataApi.commitUnitOfWork(unitOfWork);
      // Get the Quote result using the reference
      const quoteResult = results.get(quoteRef);
      if (!quoteResult) {
        throw new Error('Quote creation result not found in response');
      }
      return { quoteId: quoteResult.id };
    } catch (commitError) {
      // Salesforce API errors will be formatted as "ERROR_CODE: Error message"
      const error = new Error(`Failed to create quote: ${commitError.message}`);
      error.statusCode = 400; // Bad Request for validation/data errors
      throw error;
    }
  } catch (error) {
    if (error.statusCode) {
      throw error; // Preserve custom errors with status codes
    }

    console.error('Unexpected error generating quote:', error);
    const wrappedError = new Error(`An unexpected error occurred: ${error.message}`);
    wrappedError.statusCode = 500;
    throw wrappedError;
  }
}

// Helper function mirroring the createQuotes.js discount logic
function getDiscountForRegion (region) {
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

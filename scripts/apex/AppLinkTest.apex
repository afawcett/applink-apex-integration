System.debug('=== Testing QuoteService directly ===');

// First, get a sample opportunity to test with
List<Opportunity> sampleOpps = [SELECT Id, Name FROM Opportunity LIMIT 1];

if (sampleOpps.isEmpty()) {
    System.debug('No opportunities found. Please ensure sample data is imported.');
} else {
    Opportunity testOpp = sampleOpps[0];
    System.debug('Testing with Opportunity: ' + testOpp.Name + ' (ID: ' + testOpp.Id + ')');
    
    // Create the QuoteService instance (used by both tests)
    HerokuAppLink.QuoteService service = new HerokuAppLink.QuoteService();
    System.debug('SUCCESS: Service instance created successfully');
    
    try {
        // Test 1: Test createQuote (synchronous)
        System.debug('Test 1: Testing createQuote (synchronous)...');
        
        // Create the request
        HerokuAppLink.QuoteService.createQuote_Request request = new HerokuAppLink.QuoteService.createQuote_Request();
        request.body = new HerokuAppLink.QuoteService_CreateQuoteRequest();
        request.body.opportunityId = testOpp.Id;
        
        System.debug('Request created with Opportunity ID: ' + request.body.opportunityId);
        
        // Call the service
        HerokuAppLink.QuoteService.createQuote_Response response = service.createQuote(request);
        
        if (response != null && response.Code200 != null) {
            System.debug('SUCCESS: createQuote returned successfully');
            System.debug('   Quote ID: ' + response.Code200.quoteId);
            System.debug('   Response Code: ' + response.responseCode);
        } else {
            System.debug('WARNING: Response received but no Code200 data');
            System.debug('   Response Code: ' + (response != null ? String.valueOf(response.responseCode) : 'null response'));
        }
        
    } catch (HerokuAppLink.QuoteService.createQuote_ResponseException e) {
        System.debug('WARNING: Service returned an error response:');
        System.debug('   Response Code: ' + e.responseCode);
        if (e.Code401 != null) {
            System.debug('   401 Error: ' + e.Code401.message);
        }
        if (e.Code500 != null) {
            System.debug('   500 Error: ' + e.Code500.message);
        }
        if (String.isNotBlank(e.defaultResponse)) {
            System.debug('   Default Response: ' + e.defaultResponse);
        }
    } catch (Exception e) {
        System.debug('EXCEPTION: ' + e.getMessage());
        System.debug('   Type: ' + e.getTypeName());
        System.debug('   Stack: ' + e.getStackTraceString());
    }
    
    try {
        // Test 2: Test createQuotes (asynchronous with callback)
        System.debug('Test 2: Testing createQuotes (asynchronous with callback)...');
        
        // Create the batch request
        HerokuAppLink.QuoteService.createQuotes_Request batchRequest = new HerokuAppLink.QuoteService.createQuotes_Request();
        batchRequest.body = new HerokuAppLink.QuoteService_CreateQuotesRequest();
        batchRequest.body.opportunityIds = new List<String>{ testOpp.Id };
        
        System.debug('Batch request created with ' + batchRequest.body.opportunityIds.size() + ' opportunity IDs');
        System.debug('Callback URL: ' + batchRequest.body.callbackUrl);
        
        // Create a callback handler that will send custom notifications
        CreateQuotesCallback callbackHandler = new CreateQuotesCallback();
        
        // Set callback timeout to 5 minutes from now
        DateTime callbackTimeout = DateTime.now().addMinutes(5);
        
        // Call the service with callback using correct signature
        HerokuAppLink.QuoteService.createQuotes_Response batchResponse = service.createQuotes(batchRequest, callbackHandler, callbackTimeout);
        
        if (batchResponse != null && batchResponse.Code201 != null) {
            System.debug('SUCCESS: createQuotes returned successfully');
            System.debug('   Job ID: ' + batchResponse.Code201.jobId);
            System.debug('   Response Code: ' + batchResponse.responseCode);
            System.debug('   Invocation ID: ' + batchResponse.invocationId);
        } else {
            System.debug('WARNING: Batch response received but no Code201 data');
            System.debug('   Response Code: ' + (batchResponse != null ? String.valueOf(batchResponse.responseCode) : 'null response'));
        }
        
    } catch (HerokuAppLink.QuoteService.createQuotes_ResponseException e) {
        System.debug('WARNING: Batch service returned an error response:');
        System.debug('   Response Code: ' + e.responseCode);
        if (String.isNotBlank(e.defaultResponse)) {
            System.debug('   Default Response: ' + e.defaultResponse);
        }
    } catch (Exception e) {
        System.debug('BATCH EXCEPTION: ' + e.getMessage());
        System.debug('   Type: ' + e.getTypeName());
        System.debug('   Stack: ' + e.getStackTraceString());
    }
}

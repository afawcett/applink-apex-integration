/**
 * @description Controller for the createQuote Lightning Web Component
 * Uses HerokuAppLink.QuoteService to generate quotes via the Heroku application
 */
public with sharing class CreateQuoteController {
    
    /**
     * @description Generates a quote for the given opportunity using the Heroku service
     * @param opportunityId The ID of the opportunity
     * @return QuoteResponse containing the generated quote information
     */
    @AuraEnabled(cacheable=false)
    public static QuoteResponse createQuote(String opportunityId) {
        try {
            // Create the Heroku service instance
            HerokuAppLink.QuoteService service = new HerokuAppLink.QuoteService();            
            // Create the request
            HerokuAppLink.QuoteService.createQuote_Request request = new HerokuAppLink.QuoteService.createQuote_Request();
            request.body = new HerokuAppLink.QuoteService_CreateQuoteRequest();
            request.body.opportunityId = opportunityId;    
            // Call the Heroku service
            HerokuAppLink.QuoteService.createQuote_Response response = service.createQuote(request);            
            if (response != null && response.Code200 != null) {
                QuoteResponse quoteResponse = new QuoteResponse();
                quoteResponse.opportunityId = opportunityId;
                quoteResponse.quoteId = response.Code200.quoteId;
                quoteResponse.success = true;
                quoteResponse.message = 'Quote generated successfully';                
                return quoteResponse;
            } else {
                throw new AuraHandledException('No response received from quote service');
            }            
        } catch (HerokuAppLink.QuoteService.createQuote_ResponseException e) {
            // Handle specific Heroku service errors
            String errorMessage = 'Service error: ';
            if (e.Code401 != null) {
                errorMessage += e.Code401.message;
            } else if (e.Code500 != null) {
                errorMessage += e.Code500.message;
            } else if (String.isNotBlank(e.defaultResponse)) {
                errorMessage += e.defaultResponse;
            } else {
                errorMessage += 'Unknown error (Response code: ' + e.responseCode + ')';
            }
            throw new AuraHandledException(errorMessage);
            
        } catch (Exception e) {
            // Handle any other exceptions
            throw new AuraHandledException('Error generating quote: ' + e.getMessage());
        }
    }
    
    /**
     * @description Inner class to represent the quote response
     */
    public class QuoteResponse {
        @AuraEnabled public String opportunityId;
        @AuraEnabled public String quoteId;
        @AuraEnabled public Boolean success;
        @AuraEnabled public String message;
    }
}

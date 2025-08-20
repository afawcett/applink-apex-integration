/**
 * @description Controller extension for the CreateQuotes Visualforce page
 * Provides functionality to generate quotes for selected opportunities using the Heroku service
 */
public with sharing class CreateQuotesController {
    
    private final ApexPages.StandardSetController stdController;
    
    /**
     * @description Constructor
     * @param stdController The standard controller for the page
     */
    public CreateQuotesController(ApexPages.StandardSetController stdController) {
        this.stdController = stdController;
    }
    
    /**
     * @description Generates quotes for all selected opportunities using the Heroku service
     * @return PageReference to refresh the page and show results
     */
    public PageReference generateQuotesForSelected() {
        try {
            // Get the selected opportunities
            List<Opportunity> selectedOpps = (List<Opportunity>) this.stdController.getSelected();
            
            if (selectedOpps.isEmpty()) {
                ApexPages.addMessage(new ApexPages.Message(
                    ApexPages.Severity.WARNING, 
                    'No opportunities selected. Please select at least one opportunity.'
                ));
                return null;
            }
            
            // Extract opportunity IDs
            List<String> opportunityIds = new List<String>();
            for (Opportunity opp : selectedOpps) {
                opportunityIds.add(opp.Id);
            }
            
            // Call the Heroku service with callback
            try {
                HerokuAppLink.QuoteService service = new HerokuAppLink.QuoteService();
                HerokuAppLink.QuoteService.createQuotes_Request request = new HerokuAppLink.QuoteService.createQuotes_Request();
                request.body = new HerokuAppLink.QuoteService_CreateQuotesRequest();
                request.body.opportunityIds = opportunityIds;
                
                // Create callback handler for notifications
                CreateQuotesCallback callbackHandler = new CreateQuotesCallback();
                
                // Set callback timeout to 10 minutes from now
                DateTime callbackTimeout = DateTime.now().addMinutes(10);
                
                // Call the service with callback
                HerokuAppLink.QuoteService.createQuotes_Response response = service.createQuotes(request, callbackHandler, callbackTimeout);
                
                if (response != null && response.Code201 != null) {
                    // Show success message
                    ApexPages.addMessage(new ApexPages.Message(
                        ApexPages.Severity.CONFIRM, 
                        String.format('Successfully submitted batch quote generation for {0} opportunities. Job ID: {1}. You will receive a notification when processing is complete.', 
                                    new List<String>{ String.valueOf(opportunityIds.size()), response.Code201.jobId })
                    ));
                } else {
                    throw new AuraHandledException('No response received from quote service');
                }
            } catch (HerokuAppLink.QuoteService.createQuotes_ResponseException e) {
                // Handle specific Heroku service errors
                String errorMessage = 'Service error: ';
                if (String.isNotBlank(e.defaultResponse)) {
                    errorMessage += e.defaultResponse;
                } else {
                    errorMessage += 'Unknown error (Response code: ' + e.responseCode + ')';
                }
                throw new AuraHandledException(errorMessage);
            }
            
        } catch (Exception e) {
            // Show error message
            ApexPages.addMessage(new ApexPages.Message(
                ApexPages.Severity.ERROR, 
                'Error generating quotes: ' + e.getMessage()
            ));
        }
        
        return null; // Stay on the same page
    }
    

}

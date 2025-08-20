/**
 * Callback handler for createQuotes asynchronous operations
 * Extends the generated AppLink callback interface to handle responses
 */
public class CreateQuotesCallback extends HerokuAppLink.QuoteService.createQuotes_Callback {
    
    // Static variable to store the notification type ID
    private static Id notificationTypeId;
    
    // Static constructor to query the CustomNotificationType once when class is loaded
    static {
        try {
            CustomNotificationType notificationType = [
                SELECT Id, DeveloperName 
                FROM CustomNotificationType 
                WHERE DeveloperName = 'Quote_Generation_Complete' 
                LIMIT 1
            ];
            notificationTypeId = notificationType.Id;
        } catch (Exception e) {
            // Log error but don't fail - notification will be skipped if type not found
            System.debug('ERROR: Could not find CustomNotificationType Quote_Generation_Complete: ' + e.getMessage());
            notificationTypeId = null;
        }
    }
    
    /**
     * Handles the callback response from the Heroku worker
     * Sends a custom notification to the user with the results
     */
    public override void createQuotesResponse(List<HerokuAppLink.QuoteService.createQuotes_createQuotesResponse_Callback> callbacks) {
        // Skip notification if notification type was not found during initialization
        if (notificationTypeId == null) {
            System.debug('WARNING: Skipping notification - CustomNotificationType not configured');
            return;
        }
        
        // Send custom notification to the user
        for (herokuapplink.QuoteService.createQuotes_createQuotesResponse_Callback callback : callbacks) {
            if (callback.response != null && callback.response.body != null) {
                Messaging.CustomNotification notification = new Messaging.CustomNotification();
                notification.setTitle('Quote Generation Complete');
                notification.setNotificationTypeId(notificationTypeId);
                
                String message = 'Job ' + callback.response.body.jobId + ' completed with status: ' + callback.response.body.status;
                if (callback.response.body.quoteIds != null && !callback.response.body.quoteIds.isEmpty()) {
                    message += '. Created ' + callback.response.body.quoteIds.size() + ' quotes.';
                }
                if (callback.response.body.errors != null && !callback.response.body.errors.isEmpty()) {
                    message += ' Errors: ' + String.join(callback.response.body.errors, ', ');
                }                
                
                notification.setBody(message);
                notification.setTargetId(UserInfo.getUserId());                    
                notification.send(new Set<String>{ UserInfo.getUserId() });
            }
        }
    }
}

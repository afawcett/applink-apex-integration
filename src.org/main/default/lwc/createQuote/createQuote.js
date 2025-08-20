import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import createQuote from '@salesforce/apex/CreateQuoteController.createQuote';

export default class CreateQuote extends NavigationMixin(LightningElement) {
    @api recordId; // Opportunity ID
    
    // Internal flag to prevent double execution
    _isExecuting = false;

    // Public method required for headless quick actions
    // This method is automatically called when the quick action is triggered
    @api
    async invoke() {
        if (this._isExecuting) {
            return; // Prevent double execution
        }
        
        this._isExecuting = true;
        
        try {
            // Show loading toast
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Processing',
                    message: 'Generating quote via Heroku service...',
                    variant: 'info'
                })
            );
            
            // Call the Heroku service via CreateQuoteController
            const result = await createQuote({ opportunityId: this.recordId });
            
            if (result.success) {
                // Show success toast
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Success',
                        message: `Quote generated successfully! Quote ID: ${result.quoteId}`,
                        variant: 'success'
                    })
                );
                
                // Navigate to the generated Quote record
                this[NavigationMixin.Navigate]({
                    type: 'standard__recordPage',
                    attributes: {
                        recordId: result.quoteId,
                        objectApiName: 'Quote',
                        actionName: 'view'
                    }
                });
            } else {
                throw new Error(result.message || 'Quote generation failed');
            }
            
        } catch (error) {
            // Show error toast
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Error',
                    message: 'Failed to generate Quote: ' + error.message,
                    variant: 'error'
                })
            );
        } finally {
            this._isExecuting = false;
        }
    }
}

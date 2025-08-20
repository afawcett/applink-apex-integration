# LWC → Apex → Heroku → Apex → LWC Sequence Diagram

This diagram shows the synchronous flow for creating a single quote using Heroku AppLink.

```mermaid
sequenceDiagram
    participant User
    participant LWC as Lightning Web Component
    participant Apex as Apex Controller
    participant AppLink as Heroku AppLink
    participant Heroku as Heroku Node.js API
    participant SF as Salesforce Data

    Note over User,SF: Synchronous Quote Creation Flow
    
    User->>LWC: Clicks "Convert to Quote" button
    LWC->>Apex: createQuote(opportunityId)
    
    Note over Apex: CreateQuoteController.createQuote()
    
    Apex->>AppLink: HerokuAppLink.QuoteService.createQuote()
    AppLink->>Heroku: HTTP POST /api/createQuote
    
    Note over Heroku: Node.js processes request
    
    Heroku->>SF: Query Opportunity & Products
    SF-->>Heroku: Opportunity & Product data
    
    Heroku->>SF: Create Quote & Line Items
    SF-->>Heroku: Quote ID
    
    Heroku-->>AppLink: HTTP 200 + Quote ID
    AppLink-->>Apex: QuoteResponse with quoteId
    
    Apex-->>LWC: QuoteResponse {success: true, quoteId}
    
    LWC->>LWC: Show success toast
    LWC->>LWC: Navigate to Quote record
    
    Note over User,SF: User redirected to new Quote
```

## Key Points

1. **Synchronous Flow**: The entire process completes before returning control to the user
2. **User Context**: Maintains user permissions and context throughout the flow
3. **Single Transaction**: Quote creation happens in one atomic operation
4. **Direct Response**: User gets immediate feedback and navigation
5. **No Background Processing**: All work completes within the 120-second callout limit

## Components Involved

- **LWC**: `createQuote` component with quick action
- **Apex**: `CreateQuoteController` handling the business logic
- **Heroku**: Node.js API with AppLink SDK for Salesforce data access
- **AppLink**: Seamless integration layer between Salesforce and Heroku

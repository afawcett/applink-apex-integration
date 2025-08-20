# VF → Apex → Heroku → Apex → VF Sequence Diagram

This diagram shows the asynchronous flow for creating multiple quotes using Heroku AppLink with callbacks.

```mermaid
sequenceDiagram
    participant User
    participant VF as Visualforce Page
    participant Apex as Apex Controller
    participant AppLink as Heroku AppLink
    participant Heroku as Heroku Node.js API
    participant Worker as Heroku Worker
    participant Redis as Redis Pub/Sub
    participant Callback as Apex Callback
    participant SF as Salesforce Data

    Note over User,SF: Asynchronous Batch Quote Creation Flow
    
    User->>VF: Selects multiple Opportunities
    User->>VF: Clicks "Generate Quotes" button
    VF->>Apex: generateQuotesForSelected()
    
    Note over Apex: CreateQuotesController.generateQuotesForSelected()
    
    Apex->>AppLink: HerokuAppLink.QuoteService.createQuotes()<br/>with callback handler
    AppLink->>Heroku: HTTP POST /api/createQuotes
    
    Note over Heroku: Node.js API receives request
    
    Heroku->>Redis: Publish job to Redis channel
    Redis-->>Heroku: Job published successfully
    
    Heroku-->>AppLink: HTTP 201 + Job ID
    AppLink-->>Apex: Job ID returned immediately
    
    Apex-->>VF: Success message with Job ID
    VF->>User: Shows "Job submitted" message
    
    Note over User,SF: User continues working while job processes in background
    
    Worker->>Redis: Subscribe to Redis channel
    Redis->>Worker: Job message received
    
    Note over Worker: Background processing begins
    
    Worker->>SF: Query Opportunities & Products
    SF-->>Worker: Opportunity & Product data
    
    Worker->>SF: Create Quotes & Line Items
    SF-->>Worker: Quote IDs
    
    Note over Worker: Job processing complete
    
    Worker->>AppLink: HTTP POST callback with results
    AppLink->>Callback: Invoke Apex callback handler
    
    Note over Callback: CreateQuotesCallback.createQuotesResponse()
    
    Callback->>SF: Send custom notification to user
    SF-->>Callback: Notification sent
    
    Note over User,SF: User receives notification about job completion
```

## Key Points

1. **Asynchronous Flow**: Job is submitted and user continues working
2. **Background Processing**: Heavy work happens in Heroku worker process
3. **Callback Pattern**: Apex callback handler receives results when job completes
4. **User Context**: Callback runs with original user's permissions
5. **Redis Pub/Sub**: Handles job queuing and worker coordination
6. **Immediate Response**: User gets job ID and can continue working

## Components Involved

- **VF**: `CreateQuotes` page with list view button
- **Apex**: `CreateQuotesController` and `CreateQuotesCallback`
- **Heroku**: Node.js API + Worker process
- **Redis**: Message broker for job queuing
- **AppLink**: Handles callback routing back to Apex
- **Notification**: Custom notification sent to user upon completion

## Benefits of This Pattern

1. **Non-blocking**: User doesn't wait for long-running operations
2. **Scalable**: Multiple workers can process jobs in parallel
3. **Reliable**: Redis ensures job delivery and worker coordination
4. **User-friendly**: Immediate feedback and completion notifications
5. **Maintains Context**: All operations preserve user permissions and identity

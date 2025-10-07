# Quote Generation Architecture Layer Diagram (Asynchronous)

This diagram shows the two main platform layers and their components for the asynchronous quote generation service.

```mermaid
graph TB
    subgraph SF ["Salesforce Platform"]
        VF["Visualforce Page<br/>(UI Entry Point)"]
        Apex["Apex Controller<br/>(AppLink Client Stub)"]
        AppLink["Heroku AppLink<br/>(Integration Layer)"]
        Callback["Apex Callback<br/>(Result Handler)"]
    end
    
    subgraph HK ["Heroku Platform"]
        API["Node.js API<br/>(Web Server)"]
        Worker["Node.js Worker<br/>(Background Processing)"]
        Redis["Redis<br/>(Job Queue)"]
    end
    
    %% Connections to platform edges
    SF <--> HK
    
    %% Internal connections
    VF --> Apex
    Apex --> AppLink
    API --> Redis
    Redis --> Worker
    
    %% Styling
    classDef salesforce fill:#00A1E0,stroke:#333,stroke-width:2px,color:#fff
    classDef heroku fill:#6762A6,stroke:#333,stroke-width:2px,color:#fff
    
    class VF,Apex,AppLink,Callback salesforce
    class API,Worker,Redis heroku
```

## Platform Responsibilities

### Salesforce Platform
- **Visualforce Page**: User interface for initiating quote generation
- **Apex Controller**: Client stub that calls AppLink service with callback handler
- **AppLink**: Integration layer providing authentication and service discovery
- **Apex Callback**: Result handler that receives completion notifications from Heroku

### Heroku Platform
- **Node.js API**: Web server handling synchronous requests and job queuing
- **Node.js Worker**: Background processing for asynchronous quote generation
- **Redis**: Message broker for job queuing and worker coordination

## Data Flow
1. User initiates quote generation via Visualforce Page
2. Visualforce Page calls Apex Controller
3. Apex Controller calls AppLink service with callback handler
4. AppLink routes request to Heroku API
5. API queues job in Redis for background processing
6. Worker generates quotes and calls back to Apex Callback with results
7. User receives notification with quote completion confirmation

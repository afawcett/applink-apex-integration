# Demonstrates using AppLink with Apex

This project demonstrates a complete Heroku AppLink integration with Salesforce via Apex, featuring a unified Node.js application that handles both synchronous and asynchronous quote generation operations.

## Overview

This project showcases how to integrate Salesforce with Node.js code running in Heorku using Heroku AppLink, enabling Apex code to securely call Node.js APIs running on Heroku. The integration demonstrates both synchronous and asynchronous processing patterns commonly used in enterprise applications.

## Prerequisites

- Node.js 20.x
- Salesforce CLI (`sf`)
- Heroku CLI
- Heroku AppLink CLI plugin installed (`heroku plugins:install applink`)
- Dev Hub org configured with scratch org creation permissions
- Redis instance (local or cloud)

## Local Development and Testing

This section covers setting up a local development environment to test the quote generation API before deploying to production. You'll create a Salesforce scratch org, start a local Node.js server, and test the API using the provided tools. This allows you to develop and debug locally while maintaining the same Salesforce context and authentication that will be used in production. Note that Heroku and Heroku AppLink are not required for any of the steps in this section.

### Salesforce Setup
```bash
# Create a new scratch org (and set as default)
sf org create scratch --definition-file config/project-scratch-def.json --alias my-org --set-default

# Import sample data using the data script (no metadata deploy needed for local testing)
./bin/data.sh
```

### Running Locally
```bash
# Install dependencies
npm install

# Start the local server
npm start

# The API will be available at http://localhost:5000
# Swagger docs at http://localhost:5000/docs
```

### Testing the API

To test the synchronous quote creation (which doesn't require Redis), you can use the `invoke.sh` script:

First, get some opportunity IDs to test with:
```bash
# Get opportunity IDs from your org
sf data query --query "SELECT Id, Name, Amount, CloseDate FROM Opportunity LIMIT 5"
```

Then test with Salesforce context (simulates real Salesforce calls):
```bash
# Test with Salesforce context (simulates real Salesforce calls)
./bin/invoke.sh my-org http://localhost:5000/api/createQuote '{"opportunityId": "006XXXXXXXXXXXXXXX"}'
```

This will:
1. Send a request to the local quote generation API
2. Process the quote synchronously (no background job)
3. Create a Quote record in Salesforce immediately
4. Return the response with quote details

**Expected Output:**
```json
{
  "success": true,
  "quoteId": "a0qXXXXXXXXXXXXXXX",
  "opportunityId": "006XXXXXXXXXXXXXXX",
  "message": "Quote created successfully"
}
```

**Note:** Make sure your local server is running (`npm start`) before testing. This endpoint processes quotes synchronously and doesn't require Redis or worker processes.

### Testing Creating Multiple Quotes

To test the asynchronous batch quote processing (which requires Redis and AppLink addons), you can create a local Heroku app with these services for testing:

```bash
# Generate password for the scratch org admin user (needed for Heroku connection below)
sf org generate password

# Create a local Heroku app and add Redis
heroku create
heroku addons:create heroku-redis:mini --wait

# Add Heroku AppLink addon
heroku addons:create heroku-applink --wait

# Add named authorization for worker process
heroku salesforce:authorizations:add worker -l https://test.salesforce.com

# Copy Heroku Addon configs to local .env file
heroku config --shell > .env

# Run both web and worker processes locally
heroku local -f Procfile.local web=1,worker=1
```

This will start:
- **Web process** on port 5000 (configurable via `APP_PORT` in `.env`) - equivalent to `npm start`
- **Worker process** for background job processing - equivalent to `npm run worker`
- **Redis instance** for job queue management

Once your local server and worker are running with Redis, you can test the asynchronous batch quote processing:

```bash
# Test batch quote creation for multiple opportunities
./bin/invoke.sh my-org http://localhost:5000/api/createQuotes '{"opportunityIds": ["006XXXXXXXXXXXXXXX", "006XXXXXXXXXXXXXXX"]}'

# Or test with a single opportunity ID
./bin/invoke.sh my-org http://localhost:5000/api/createQuotes '{"opportunityIds": ["006XXXXXXXXXXXXXXX"]}'
```

This will:
1. Submit a job to the Redis queue
2. Return a job ID immediately
3. Process the quotes asynchronously via the worker process
4. Create Quote records in Salesforce for each opportunity

Monitor the worker logs to see the job processing:
```bash
# In your heroku local terminal, you should see:
worker.1 | Worker received job with ID: [job-id] for [X] opportunity IDs
worker.1 | Processing [X] Opportunities
worker.1 | Submitting UnitOfWork to create [X] Quotes and [X] Line Items
worker.1 | Job processing completed for Job ID: [job-id]. Results: [X] succeeded, 0 failed.
```

**Note:** If you have deployed the application and want to return to local development, you may want to destroy it to avoid race conditions since both will share the same job queue. Use `heroku destroy` to delete the app.



## Deployment

This section covers deploying the quote generation API to Heroku using Heroku AppLink. You'll create a Salesforce scratch org, deploy the Node.js application to Heroku, configure the AppLink integration, and finally deploy the Salesforce components and code. This creates a working system where Salesforce can securely invoke the quote generation API.

### Salesforce Setup
```bash
# Create a new scratch org (and set as default)
sf org create scratch --definition-file config/project-scratch-def.json --alias my-org --set-default

# Import sample data using the data script
./bin/data.sh

# Deploy the ManageHerokuAppLink permission set (required for Heroku CLI commands)
sf project deploy start --metadata Permissionset

# Assign the ManageHerokuAppLink permission set to your user
sf org assign permset --name ManageHerokuAppLink

# Generate password for the scratch org admin user (needed for Heroku connection)
sf org generate password
```

### Deploy to Heroku
```bash
# Create Heroku app
heroku create

# Add Heroku AppLink addon
heroku addons:create heroku-applink --wait

# Add Redis addon for job queue management
heroku addons:create heroku-redis:mini --wait

# Add required buildpacks
heroku buildpacks:add --index=1 heroku/heroku-applink-service-mesh
heroku buildpacks:add heroku/nodejs

# Set Heroku app ID
heroku config:set HEROKU_APP_ID="$(heroku apps:info --json | jq -r '.app.id')"

# Deploy code
git push heroku main

# Scale the worker process
heroku ps:scale worker=1

# Connect to Salesforce org
heroku salesforce:connect my-org -l https://test.salesforce.com

# Add named authorization for worker process
heroku salesforce:authorizations:add worker -l https://test.salesforce.com

# Publish API to Salesforce
heroku salesforce:publish api-docs.yaml --client-name QuoteService --connection-name my-org --authorization-connected-app-name QuoteServiceConnectedApp --authorization-permission-set-name QuoteServicePermissions

# Assign Permission Sets to allow your user to invoke the Heroku code
sf org assign permset --name QuoteService
sf org assign permset --name QuoteServicePermissions
```

### Deploy Salesforce Metadata
```bash
# Now deploy the Salesforce components and code (after Heroku is ready)
sf project deploy start
```

### Verify Deployment
Confirm the app has started:
```bash
heroku logs --tail
```

Navigate to your org's **Setup** menu and search for **Heroku** then click **Apps** to confirm your application has been imported.

### Verify AppLink Integration
Test that Apex can successfully call the Heroku service:
```bash
sf apex run --file scripts/apex/AppLinkTest.apex
```

This script will:
- Call the quote generation service via the AppLink stubs
- Display the response data structure
- Confirm the service integration is working correctly
- Show quote creation results and job processing

**Expected Output:**
```
=== Testing HerokuAppLink.QuoteService directly ===
Testing with Opportunity: Sample Opportunity 1 (ID: 006XXXXXXXXXXXXXXX)
SUCCESS: Service instance created successfully
Test 1: Testing createQuote (synchronous)...
Request created with Opportunity ID: 006XXXXXXXXXXXXXXX
SUCCESS: createQuote returned successfully
   Quote ID: a0qXXXXXXXXXXXXXXX
   Response Code: 200
Test 2: Testing createQuotes (asynchronous)...
Batch request created with 1 opportunity IDs
SUCCESS: createQuotes returned successfully
   Job ID: 89f17748-a8f3-413c-921f-ca30f0ad3521
   Response Code: 202
=== Direct AppLink test complete ===
```

**Note:** The actual Quote ID and Job ID will be different each time. If you see authentication errors (401), ensure the `QuoteService` permission set is assigned to your user.

## Technical Information

## Configuration for Heroku App Async Callbacks

In order to get Heroku AppLink to generate the callback interface, you need to make certain configurations in the OpenAPI specification, which is a document needed by Heroku AppLink to describe your Heroku code to the rest of the Salesforce Platform. If your not familiar with OpenAPI don't worry, most languages these days have frameworks that will generate this from your code, all be it with a little extra annotations from you. This is the approach I took in the sample used in this sample - so what you see below is generated OpenAPI schema just for illustration purposes.

Here's a sample of the `api-docs.yaml` showing how callbacks are configured for the asynchronous quote generation:

```yaml
openapi: 3.0.3
info:
  title: Quote Generation API
  version: 1.0.0
  description: API for generating quotes from Salesforce opportunities

paths:
  /api/createQuotes:
    post:
      summary: Create multiple quotes asynchronously
      operationId: createQuotes
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                opportunityIds:
                  type: array
                  items:
                    type: string
                  description: Array of Opportunity IDs to create quotes for
                callbackUrl:
                  type: string
                  format: uri
                  description: URL for Salesforce to call when processing is complete
              required:
                - opportunityIds
                - callbackUrl
      responses:
        '202':
          description: Job accepted for processing
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  jobId:
                    type: string
                    description: Unique identifier for the background job
                  message:
                    type: string
      callbacks:
        quoteGenerationComplete:
          '{$request.body#/callbackUrl}':
            post:
              summary: Callback notification when quote generation is complete
              operationId: quoteGenerationCallback
              requestBody:
                required: true
                content:
                  application/json:
                    schema:
                      $ref: '#/components/schemas/QuoteGenerationResult'
              responses:
                '200':
                  description: Callback received successfully
                '400':
                  description: Invalid callback data
                '500':
                  description: Internal server error

components:
  schemas:
    QuoteGenerationResult:
      type: object
      properties:
        jobId:
          type: string
          description: The job ID that was originally returned
        results:
          type: array
          items:
            type: object
            properties:
              opportunityId:
                type: string
                description: The Opportunity ID that was processed
              quoteId:
                type: string
                description: The created Quote ID (if successful)
              success:
                type: boolean
                description: Whether the quote creation succeeded
              error:
                type: string
                description: Error message if creation failed
        summary:
          type: object
          properties:
            total:
              type: integer
              description: Total number of opportunities processed
            succeeded:
              type: integer
              description: Number of quotes successfully created
            failed:
              type: integer
              description: Number of quotes that failed to create
      required:
        - jobId
        - results
        - summary
```

Key points about the callback configuration:

- **`callbacks` section**: Defines the callback interface that Salesforce will implement
- **`quoteGenerationComplete`**: The callback name that identifies this specific callback scenario
- **`{$request.body#/callbackUrl}`**: Dynamic callback URL from the request body
- **Callback schema**: The `QuoteGenerationResult` schema defines what data Salesforce will send back
- **Response codes**: Standard HTTP response codes for the callback endpoint

**Note:** The `/bin/apidocgen.sh` script automates the generation of OpenAPI documentation with proper callback handling for Heroku AppLink integration. It starts the local server, downloads the YAML, converts `x-callbacks` to `callbacks` (required for AppLink), and cleans up automatically. The script handles a limitation in the Swagger framework used by the project, which doesn't yet support the official `callbacks` field. Instead, the framework generates `x-callback` entries as custom extensions, which are then post-processed and renamed to the official OpenAPI `callbacks` format required by Heroku AppLink.

## Monitoring and Other Considerations

Under the covers Heroku AppLink uses a special "Heroku mode" built into External Services. This is a great design decision by Salesforce, as it can leverage all External Services current features and future ones. In this case the callback faclity is supplied by External Services, it generates the Apex code and it handles the job monitoring and callback (all be it with less plumbing in the AppLink case). Worth noting is related objects you can use to monitor the work and status such as the X object. The other thing to note is the ability to "callback" last only for 24hrs - after that your line is connected! Your workload of course will not be effected running in Heroku - but if you supposed your workload may go over this - have a plan B - for example send a platform event - this could arguably be arranged to invoke the same callback handler - just be aware it won't be running as the invoking user.

### Other Notes

- The `api-docs.yaml` file contains OpenAPI schema that defines the API endpoints for quote generation. This schema is required for AppLink integration.
- The quote generation logic is implemented in the `quote.js` source file, under the `src/server/services` directory.
- The `api-docs.yaml` file can be downloaded from `http://localhost:5000/docs/yaml` when running locally.
- This Node.js implementation uses both synchronous and asynchronous processing through Redis job queues.
- The [@heroku/salesforce-sdk-nodejs](https://www.npmjs.com/package/@heroku/salesforce-sdk-nodejs) package is used to simplify API communications with the org.
- Source code for configuration/metadata deployed to Salesforce can be found in the `/src.org` directory.
- Per **Heroku AppLink** documentation, the service mesh buildpack must be installed to enable authenticated connections to be intercepted and passed through to your code.
- The `/bin/data.sh` script automates the import of sample data into your scratch org. It handles the data import process using the import plan and sample data files in the `data/` directory. This script should be run from the project root directory and will automatically import accounts, opportunities, and related data needed for testing the quote generation functionality.
- For debugging callback issues, you can query the `BackgroundOperation` object to see the status of asynchronous operations and any error messages:
  ```bash
  # Query recent background operations
  sf data query --query "SELECT Id, Status, Error, Type, StartedAt, FinishedAt FROM BackgroundOperation WHERE CreatedDate > 2025-08-19T00:00:00.000Z ORDER BY CreatedDate DESC LIMIT 10"
  
  # Query only failed operations
  sf data query --query "SELECT Id, Status, Error, Type, StartedAt, FinishedAt FROM BackgroundOperation WHERE Status = 'Error' ORDER BY CreatedDate DESC LIMIT 5"
  ```
- The `heroku salesforce:authorizations:add worker` command establishes a predefined user authentication for worker processes. This approach is used instead of passing the invoker user credentials from the API endpoint because the session ID duration is unclear. If data access must be performed in the invoking user's context, apply such logic in the endpoint handler in `api.js` or in the Apex callback handler.

## Components

### 1. Create Quote LWC Component (`createQuote`)
- **Type**: Headless Quick Action
- **Purpose**: Creates a "Create Quote" button on Opportunity detail pages
- **Functionality**: Navigates to Quote creation page with pre-populated Opportunity ID
- **Implementation**: Uses `invoke()` method as required for headless quick actions
- **Status**: Automatically deployed and configured

### 2. Create Quotes Visualforce Page (`CreateQuotes`)
- **Type**: Visualforce Page with StandardSetController
- **Purpose**: Displays selected Opportunity records from list views
- **Functionality**: Shows Opportunity IDs, names, accounts, stages, amounts, and close dates
- **Usage**: Can be attached to list view buttons

## Sample Data

The project includes sample data for testing:

**10 Sample Accounts:**
- Various industries (Technology, Manufacturing, Healthcare, etc.)
- Different types (Customer, Prospect)
- Geographic diversity across US states

**10 Sample Opportunities:**
- Different stages (Prospecting, Qualification, Proposal, etc.)
- Various amounts ($25K - $200K)
- Different lead sources (Web, Cold Call, Partner Referral)

## Project Structure

```
jobstasksapplink/
├── config/
│   └── project-scratch-def.json
├── data/
│   ├── accounts.json
│   ├── opportunities.json
│   └── import-plan.json
├── src.org/                    # Salesforce source code
│   └── main/default/
│       ├── lwc/createQuote/
│       │   ├── createQuote.js
│       │   ├── createQuote.html
│       │   └── createQuote.js-meta.xml
│       ├── pages/
│       │   ├── CreateQuotes.page
│       │   └── CreateQuotes.page-meta.xml
│       └── objects/Opportunity/
│           ├── fields/
│           ├── layouts/
│           └── listViews/
├── src/                        # Heroku/Node.js source code
├── sfdx-project.json           # Salesforce project configuration
└── README.md
```

## Troubleshooting

### Quick Action Not Working
- The quick action is automatically deployed and configured
- If issues persist, verify the LWC component is properly deployed
- Check that the quick action appears in the page layout

### Data Import Issues
- Run the data import script from the project root: `./bin/data.sh`
- Verify the plan file format matches the schema exactly
- Check that the scratch org is properly authenticated

### Deployment Issues
- Run `sf project deploy start` to deploy all metadata at once
- Check for any validation errors in the deployment output
- Ensure all required dependencies are included in the project

### AppLink Integration Issues
- **Buildpack errors:** Ensure service mesh buildpack is first
- **Permission errors:** Verify ManageHerokuAppLink permission set is assigned
- **AppLink credential errors:** Ensure both `QuoteService` and `QuoteServicePermissions` permission sets are assigned
- **Connection failures:** Check scratch org is active and accessible
- **API publish errors:** Ensure OpenAPI schema is valid and accessible
- **Test failures:** Run `AppLinkTest.apex` to verify integration is working

### Callback Debugging
- **BackgroundOperation queries:** Use the `BackgroundOperation` object to debug callback issues:
  ```bash
  # Check for failed callback operations
  sf data query --query "SELECT Id, Status, Error, Type FROM BackgroundOperation WHERE Type = 'ExternalServiceCallback' AND Status = 'Error' ORDER BY CreatedDate DESC LIMIT 5"
  ```
- **Error field contents:** The `Error` field contains detailed error messages from Salesforce when callbacks fail
- **Common callback errors:** Look for "Invalid Apex callback type" errors which may indicate Salesforce platform issues

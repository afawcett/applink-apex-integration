#!/bin/bash

# Check if at least three arguments are provided
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
    echo "Usage: $0 <salesforce-org-alias> <api-url> <payload-json> [session-based-permission-set]"
    exit 1
fi

# Set variables from script arguments
SF_ORG_ALIAS="$1"
API_URL="$2"
PAYLOAD_JSON="$3"
SESSION_PERMISSION_SET="$4"  # Optional

# Fetch Salesforce org details using the Salesforce CLI
SF_ORG_INFO=$(sf org display -o "$SF_ORG_ALIAS" --json 2>/dev/null)

# Check if the command was successful
if [ $? -ne 0 ]; then
    echo "Error: Unable to fetch Salesforce org details for alias '$SF_ORG_ALIAS'. Ensure Salesforce CLI is installed and authenticated."
    exit 1
fi

# Extract necessary fields from JSON
ACCESS_TOKEN=$(echo "$SF_ORG_INFO" | jq -r '.result.accessToken')
API_VERSION=$(echo "$SF_ORG_INFO" | jq -r '.result.apiVersion')
ORG_ID=$(echo "$SF_ORG_INFO" | jq -r '.result.id')
ORG_DOMAIN_URL=$(echo "$SF_ORG_INFO" | jq -r '.result.instanceUrl')
USERNAME=$(echo "$SF_ORG_INFO" | jq -r '.result.username')

# Validate extracted values
if [ -z "$ACCESS_TOKEN" ] || [ -z "$API_VERSION" ] || [ -z "$ORG_ID" ] || [ -z "$ORG_DOMAIN_URL" ] || [ -z "$USERNAME" ]; then
    echo "Error: Missing required Salesforce org details. Ensure the org is authenticated."
    exit 1
fi

# If a session-based permission set is provided, activate it
if [ -n "$SESSION_PERMISSION_SET" ]; then
    echo "Activating session-based permission set: $SESSION_PERMISSION_SET..."
    # Query the AuthSession ParentId
    AUTH_SESSION_RESPONSE=$(sf data query -q "SELECT Id, ParentId FROM AuthSession WHERE IsCurrent = true" -o "$SF_ORG_ALIAS" --json)
    AUTH_SESSION_ID=$(echo "$AUTH_SESSION_RESPONSE" | jq -r '.result.records[0].Id')
    if [ -z "$AUTH_SESSION_ID" ] || [ "$AUTH_SESSION_ID" == "null" ]; then
        echo "Error: Unable to retrieve valid AuthSession ParentId. Ensure the user has an active session."
        echo "Salesforce CLI Response: $AUTH_SESSION_RESPONSE"
        exit 1
    fi
    # Query the PermissionSet ID
    PERMISSION_SET_RESPONSE=$(sf data query -q "SELECT Id FROM PermissionSet WHERE Name='$SESSION_PERMISSION_SET'" -o "$SF_ORG_ALIAS" --json)
    PERMISSION_SET_ID=$(echo "$PERMISSION_SET_RESPONSE" | jq -r '.result.records[0].Id')
    if [ -z "$PERMISSION_SET_ID" ] || [ "$PERMISSION_SET_ID" == "null" ]; then
        echo "Error: Permission set '$SESSION_PERMISSION_SET' not found."
        echo "Salesforce CLI Response: $PERMISSION_SET_RESPONSE"
        exit 1
    fi
    # Create a SessionPermSetActivation record using the correct AuthSessionId (ParentId)
    ACTIVATION_RESPONSE=$(sf data create record --sobject SessionPermSetActivation -v "PermissionSetId='$PERMISSION_SET_ID' AuthSessionId='$AUTH_SESSION_ID' Description='Activated via script'" -o "$SF_ORG_ALIAS" --json)
    ACTIVATION_ID=$(echo "$ACTIVATION_RESPONSE" | jq -r '.result.id')
    if [ -z "$ACTIVATION_ID" ] || [ "$ACTIVATION_ID" == "null" ]; then
        echo "Error: Failed to activate session-based permission set."
        echo "Salesforce CLI Response: $ACTIVATION_RESPONSE"
        exit 1
    fi
    echo "Session-based permission set activated. Activation ID: $ACTIVATION_ID"
fi

# Construct the x-client-context JSON
CLIENT_CONTEXT_JSON=$(cat <<EOF
{
  "accessToken": "$ACCESS_TOKEN",
  "apiVersion": "$API_VERSION",
  "requestId": "req-$(uuidgen)",
  "namespace": "demo",
  "orgId": "$ORG_ID",
  "orgDomainUrl": "$ORG_DOMAIN_URL",
  "userContext": {
    "userId": "0055g00000EXAMPLE",
    "username": "$USERNAME"
  }
}
EOF
)

# Encode the JSON into Base64
ENCODED_CLIENT_CONTEXT=$(echo -n "$CLIENT_CONTEXT_JSON" | base64)

# Make the request
RESPONSE=$(curl -s -w "\nHTTP Status: %{http_code}\n" -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "x-client-context: $ENCODED_CLIENT_CONTEXT" \
  -d "$PAYLOAD_JSON")

# Print response
echo "Response from server:"
echo "$RESPONSE"

# If a session-based permission set was activated, deactivate it
if [ -n "$SESSION_PERMISSION_SET" ]; then
    echo "Deactivating session-based permission set: $SESSION_PERMISSION_SET..."
    # Delete the SessionPermSetActivation record
    DELETE_RESPONSE=$(sf data delete record --sobject SessionPermSetActivation -i "$ACTIVATION_ID" -o "$SF_ORG_ALIAS" --json)
    DELETE_STATUS=$(echo "$DELETE_RESPONSE" | jq -r '.status')
    if [ "$DELETE_STATUS" == "0" ]; then
        echo "Session-based permission set deactivated successfully."
    else
        echo "Warning: Failed to deactivate session-based permission set."
        echo "Salesforce CLI Response: $DELETE_RESPONSE"
    fi
fi

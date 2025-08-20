#!/usr/bin/env sh

# Simple data setup using sf data import tree with dynamic ID replacement
# Only queries the standard price book ID since it already exists in the org

set -e  # Exit on any error

# Function to show usage and exit
show_usage() {
    echo "Usage: $0 [-cleanup]"
    echo "  -cleanup: Run cleanup before import"
    echo "  Uses default scratch org alias"
    exit 1
}

CLEANUP_ONLY=false

# Parse command line arguments
while [ $# -gt 0 ]; do
    case $1 in
        -cleanup)
            CLEANUP_ONLY=true
            shift
            ;;
        -*|*)
            show_usage
            ;;
    esac
done

# Check if there's a default org alias set
SCRATCH_ORG_ALIAS=$(sf config get target-org --json 2>/dev/null | jq -r '.result[0].value // empty')
if [ -z "$SCRATCH_ORG_ALIAS" ]; then
    echo "Error: No default scratch org alias set"
    echo "Please set a default org with: sf config set target-org <alias>"
    echo "Or run: sf org list to see available orgs"
    exit 1
fi

echo "Setting up data in scratch org: $SCRATCH_ORG_ALIAS"

# Resolve script directory so this script can be run from anywhere (e.g., repo root)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Clean up any existing data (only when -cleanup is specified)
if [ "$CLEANUP_ONLY" = true ]; then
    echo "Executing Apex cleanup script..."
    set +e
    APEX_OUTPUT=$(
    sf apex run -o "$SCRATCH_ORG_ALIAS" << 'EOF' 2>&1
delete [SELECT Id FROM Opportunity];
delete [SELECT Id FROM Product2];
delete [SELECT Id FROM Account WHERE Name != 'Sample Account for Entitlements'];
EOF
    )
    APEX_STATUS=$?
    set -e
    if [ "$APEX_STATUS" -ne 0 ]; then
        echo "$APEX_OUTPUT"
        echo "Apex cleanup failed"
        exit 1
    fi
    echo "Cleanup completed"
fi

# Create temporary directory for dynamic files
TMP_DIR="$SCRIPT_DIR/tmp"
mkdir -p "$TMP_DIR"

# Copy all data files to temp directory
cp "$SCRIPT_DIR/../data/accounts.json" "$TMP_DIR/"
cp "$SCRIPT_DIR/../data/products.json" "$TMP_DIR/"
cp "$SCRIPT_DIR/../data/opportunities.json" "$TMP_DIR/"
cp "$SCRIPT_DIR/../data/pricebook-entries.json" "$TMP_DIR/"
cp "$SCRIPT_DIR/../data/opportunity-line-items.json" "$TMP_DIR/"
cp "$SCRIPT_DIR/../data/import-plan.json" "$TMP_DIR/"

# Query the standard price book ID
echo "Querying standard price book ID..."
PRICEBOOK_ID=$(sf data query -q "SELECT Id FROM Pricebook2 WHERE IsStandard = TRUE" -o "$SCRATCH_ORG_ALIAS" --json | jq -r '.result.records[0].Id')

if [ -z "$PRICEBOOK_ID" ] || [ "$PRICEBOOK_ID" = "null" ]; then
    echo "Error: Could not find standard price book ID"
    exit 1
fi

# Update pricebook-entries.json with actual standard price book ID
jq --arg id "$PRICEBOOK_ID" '(.records[] | select(.Pricebook2Id == "@standardPricebookId")).Pricebook2Id = $id' "$TMP_DIR/pricebook-entries.json" > "$TMP_DIR/pricebook-entries.json.tmp" && mv "$TMP_DIR/pricebook-entries.json.tmp" "$TMP_DIR/pricebook-entries.json"

# Run the complete data import
echo "Running complete data import..."
( cd "$TMP_DIR" && sf data import tree --plan import-plan.json --target-org "$SCRATCH_ORG_ALIAS" )

# Clean up temporary directory
rm -rf "$TMP_DIR"

# Verify the setup
echo "Verifying data setup..."
echo "Accounts: $(sf data query -q "SELECT COUNT() FROM Account WHERE Name != 'Sample Account for Entitlements'" -o "$SCRATCH_ORG_ALIAS" --json | jq -r '.result.totalSize')"
echo "Products: $(sf data query -q "SELECT COUNT() FROM Product2" -o "$SCRATCH_ORG_ALIAS" --json | jq -r '.result.totalSize')"
echo "Opportunities: $(sf data query -q "SELECT COUNT() FROM Opportunity" -o "$SCRATCH_ORG_ALIAS" --json | jq -r '.result.totalSize')"
echo "PricebookEntries: $(sf data query -q "SELECT COUNT() FROM PricebookEntry WHERE Pricebook2.IsStandard = TRUE" -o "$SCRATCH_ORG_ALIAS" --json | jq -r '.result.totalSize')"
echo "OpportunityLineItems: $(sf data query -q "SELECT COUNT() FROM OpportunityLineItem" -o "$SCRATCH_ORG_ALIAS" --json | jq -r '.result.totalSize')"
echo ""
echo "✅ Data setup completed successfully"

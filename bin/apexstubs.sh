#!/bin/bash

# ApexStubs Tool Runner
# Extracts dynamically generated Apex classes from Salesforce External Services and AppLink integrations

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APEXSTUBS_DIR="$SCRIPT_DIR/apexstubs"

# Check if apexstubs directory exists
if [ ! -d "$APEXSTUBS_DIR" ]; then
    echo "❌ Error: apexstubs directory not found at $APEXSTUBS_DIR"
    exit 1
fi

# Change to the apexstubs directory
cd "$APEXSTUBS_DIR"

# Check if node_modules exists, install dependencies if not
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Run the Apex code extractor
echo "🚀 Running ApexStubs tool..."
if npm run extract; then
    echo "✅ ApexStubs tool completed!"
    echo "📁 Downloaded files are in: $APEXSTUBS_DIR/downloads/"
else
    echo ""
    echo "❌ ApexStubs tool failed!"
    echo ""
    echo "🔑 Authentication Error: SF_PASSWORD environment variable is required for non-scratch orgs."
    echo ""
    echo "📋 To resolve this issue, you have two options:"
    echo ""
    echo "1️⃣ For Scratch Orgs:"
    echo "   Run this command to generate a password:"
    echo "   sf org generate password"
    echo ""
    echo "2️⃣ For Non-Scratch Orgs:"
    echo "   Set the SF_PASSWORD environment variable:"
    echo "   export SF_PASSWORD='your-org-password'"
    echo ""
    echo "   Or run the script with the password inline:"
    echo "   SF_PASSWORD='your-org-password' ./bin/apexstubs.sh"
    echo ""
    echo "📚 For more information, check the README.md file."
    exit 1
fi

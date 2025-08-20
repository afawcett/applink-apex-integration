#!/bin/bash

# ApexStubs Tool Runner
# Extracts dynamically generated Apex classes from Salesforce HerokuAppLink integration

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APEXSTUBS_DIR="$SCRIPT_DIR/apexstubs"

# Check if apexstubs directory exists
if [ ! -d "$APEXSTUBS_DIR" ]; then
    echo "❌ Error: apexstubs directory not found at $APEXSTUBS_DIR"
    exit 1
fi

# Kill any lingering Chrome processes to prevent hanging
echo "🧹 Cleaning up any lingering Chrome processes..."
pkill -f "chrome" 2>/dev/null || echo "ℹ️  No Chrome processes found to kill"

# Wait a moment for processes to fully terminate
sleep 2

# Change to the apexstubs directory
cd "$APEXSTUBS_DIR"

# Check if node_modules exists, install dependencies if not
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Run the Apex code extractor
echo "🚀 Running ApexStubs tool..."
npm run extract

echo "✅ ApexStubs tool completed!"
echo "📁 Downloaded files are in: $APEXSTUBS_DIR/downloads/"

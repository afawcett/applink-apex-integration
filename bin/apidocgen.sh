#!/bin/bash

# apidocgen.sh - Generate OpenAPI docs with proper callbacks
# This script:
# 1. Starts the Node.js server in the background
# 2. Waits for it to be ready
# 3. Downloads the YAML
# 4. Converts x-callbacks to callbacks
# 5. Stops the server

set -e

echo "🚀 Starting API documentation generation..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to cleanup background processes
cleanup() {
    echo -e "${YELLOW}🧹 Cleaning up background processes...${NC}"
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null || true
        echo -e "${GREEN}✅ Server stopped${NC}"
    fi
}

# Set trap to cleanup on script exit
trap cleanup EXIT

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Must run from project root directory${NC}"
    exit 1
fi

# Check if port 5000 is already in use
if lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${RED}❌ Error: Port 5000 is already in use. Please stop any running servers first.${NC}"
    exit 1
fi

echo -e "${YELLOW}📡 Starting Node.js server...${NC}"

# Start the server in the background
npm start > /dev/null 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
echo -e "${YELLOW}⏳ Waiting for server to start...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:5000/docs/json > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Server is ready${NC}"
        break
    fi
    
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Error: Server failed to start within 30 seconds${NC}"
        exit 1
    fi
    
    sleep 1
done

echo -e "${YELLOW}📥 Downloading OpenAPI YAML...${NC}"

# Download the YAML
if curl -s http://localhost:5000/docs/yaml > api-docs.yaml; then
    echo -e "${GREEN}✅ YAML downloaded successfully${NC}"
else
    echo -e "${RED}❌ Error: Failed to download YAML${NC}"
    exit 1
fi

echo -e "${YELLOW}🔄 Converting x-callbacks to callbacks...${NC}"

# Convert x-callbacks to callbacks using sed
if sed -i '' 's/x-callbacks:/callbacks:/g' api-docs.yaml; then
    echo -e "${GREEN}✅ Successfully converted x-callbacks to callbacks${NC}"
else
    echo -e "${RED}❌ Error: Failed to convert callbacks${NC}"
    exit 1
fi

# Verify the conversion worked
if grep -q "callbacks:" api-docs.yaml; then
    echo -e "${GREEN}✅ Verification: callbacks found in api-docs.yaml${NC}"
else
    echo -e "${RED}❌ Error: callbacks not found after conversion${NC}"
    exit 1
fi

echo -e "${GREEN}🎉 API documentation generation complete!${NC}"
echo -e "${GREEN}📄 Generated: api-docs.yaml${NC}"

# Show a sample of the converted content
echo -e "${YELLOW}📋 Sample of generated content:${NC}"
grep -A 5 "callbacks:" api-docs.yaml || echo "No callbacks section found"

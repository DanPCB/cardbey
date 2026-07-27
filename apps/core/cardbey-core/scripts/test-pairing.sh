#!/bin/bash
# C-Net Pairing Engine Test Script
# Tests the complete pairing flow: initiate → peek → complete → status

BASE_URL="${BASE_URL:-http://localhost:3001}"

echo "🧪 Testing C-Net Pairing Engine"
echo "Base URL: $BASE_URL"
echo ""

# Step 1: Initiate pairing (TV calls this)
echo "1️⃣  POST /api/screens/pair/initiate"
INIT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/screens/pair/initiate" \
  -H "Content-Type: application/json" \
  -d '{
    "fingerprint": "TEST-'$(date +%s)'",
    "model": "AndroidTablet",
    "name": "Test Device",
    "location": "Test Location"
  }')

echo "Response: $INIT_RESPONSE"
SESSION_ID=$(echo $INIT_RESPONSE | grep -o '"sessionId":"[^"]*' | cut -d'"' -f4)
CODE=$(echo $INIT_RESPONSE | grep -o '"code":"[^"]*' | cut -d'"' -f4)

if [ -z "$SESSION_ID" ] || [ -z "$CODE" ]; then
  echo "❌ Failed to get sessionId or code"
  exit 1
fi

echo "✅ Got sessionId: $SESSION_ID"
echo "✅ Got code: $CODE"
echo ""

# Step 2: Check status (TV polls this)
echo "2️⃣  GET /api/screens/pair/sessions/$SESSION_ID/status"
STATUS_RESPONSE=$(curl -s "$BASE_URL/api/screens/pair/sessions/$SESSION_ID/status")
echo "Response: $STATUS_RESPONSE"
echo ""

# Step 3: Peek at code (Dashboard checks this)
echo "3️⃣  GET /api/screens/pair/peek/$CODE"
PEEK_RESPONSE=$(curl -s "$BASE_URL/api/screens/pair/peek/$CODE")
echo "Response: $PEEK_RESPONSE"
echo ""

# Step 4: Complete pairing (Dashboard calls this)
echo "4️⃣  POST /api/screens/pair/complete"
COMPLETE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/screens/pair/complete" \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$CODE\",
    \"name\": \"Test Device Updated\",
    \"location\": \"Test Location Updated\"
  }")

echo "Response: $COMPLETE_RESPONSE"
SCREEN_ID=$(echo $COMPLETE_RESPONSE | grep -o '"screenId":"[^"]*' | cut -d'"' -f4)
TOKEN=$(echo $COMPLETE_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$SCREEN_ID" ] || [ -z "$TOKEN" ]; then
  echo "❌ Failed to get screenId or token"
  exit 1
fi

echo "✅ Got screenId: $SCREEN_ID"
echo "✅ Got token: $TOKEN"
echo ""

# Step 5: Check status again (TV polls - should be bound now)
echo "5️⃣  GET /api/screens/pair/sessions/$SESSION_ID/status (should be bound)"
FINAL_STATUS=$(curl -s "$BASE_URL/api/screens/pair/sessions/$SESSION_ID/status")
echo "Response: $FINAL_STATUS"
echo ""

# Verify bound status
if echo "$FINAL_STATUS" | grep -q '"status":"bound"'; then
  echo "✅ Status is 'bound' - pairing successful!"
else
  echo "❌ Status is not 'bound'"
  exit 1
fi

echo ""
echo "🎉 All tests passed!"


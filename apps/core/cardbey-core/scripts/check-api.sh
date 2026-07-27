# check-api.sh
# Quick health check script for Cardbey Core API endpoints
# Usage: ./check-api.sh

set -e

BASE_URL="${CARDBEY_API_URL:-http://localhost:3001}"

echo "🔍 Checking Cardbey Core API endpoints..."
echo "Base URL: $BASE_URL"
echo ""

# Check /api/health
echo "1️⃣  Testing /api/health..."
curl -s "$BASE_URL/api/health" | jq '.' || echo "❌ Failed to get health status"
echo ""

# Check /api/dashboard/trend
echo "2️⃣  Testing /api/dashboard/trend..."
curl -s "$BASE_URL/api/dashboard/trend" | jq '.series | length' || echo "❌ Failed to get trend data"
echo ""

# Check SSE endpoint (show headers, then quit after 2s)
echo "3️⃣  Testing /api/stream?key=admin (SSE headers)..."
timeout 2 curl -N -v "$BASE_URL/api/stream?key=admin" 2>&1 | grep -E "(HTTP|Content-Type|Cache-Control|Connection)" || echo "⚠️  SSE stream opened (timeout after 2s)"
echo ""

echo "✅ Health check complete!"
echo ""
echo "💡 Tip: Set CARDBEY_API_URL environment variable to test a different server:"
echo "   CARDBEY_API_URL=http://192.168.1.11:3001 ./check-api.sh"

































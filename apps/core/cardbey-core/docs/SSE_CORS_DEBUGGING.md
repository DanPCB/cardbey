# SSE CORS Debugging Guide

## Common "CORS request did not succeed" Causes

According to MDN documentation, this error can occur when:

1. **Network/Protocol Level Failure**: The HTTP connection failed at the network or protocol level
2. **Browser Plugins**: Ad blockers or privacy protectors blocking the request
3. **Invalid SSL Certificates**: Trying to access an `https` resource with an invalid certificate
4. **Mixed Content**: Trying to access an `http` resource from an `https` page
5. **Server Not Responding**: Server didn't respond to the actual request (even if preflight succeeded)
6. **Private Browsing**: Window is in "Private Browsing" mode

## Current Implementation

### CORS Headers
- Uses **specific origin** (not `*`) to avoid credential issues
- Sets `Access-Control-Allow-Origin: <origin>` where `<origin>` is from the request
- Sets `Access-Control-Allow-Credentials: false`
- Includes `Vary: Origin` header for proper caching

### SSE Connection Setup
- Headers are set **before** any writes
- Initial keep-alive comment (`:connected`) is written immediately
- Socket keep-alive is enabled with 60s interval
- No socket timeout (setTimeout(0))
- Nagle's algorithm disabled for lower latency

## Debugging Steps

### 1. Check Server Logs

When a connection attempt is made, you should see:

```
[SSE] OPTIONS preflight handler hit { url: '/api/stream?key=admin', origin: 'http://localhost:5174', ... }
[SSE DEBUG] GET /stream handler hit { url: '/api/stream?key=admin', origin: 'http://localhost:5174', ... }
[SSE DEBUG] response headers { 'access-control-allow-origin': 'http://localhost:5174', ... }
[SSE] CORS header set: http://localhost:5174
[SSE] Initial SSE data written and flushed
[SSE] Client attached { id: '...', label: 'admin', clientsCount: 1 }
[SSE] Connection established { url: '/api/stream?key=admin', origin: 'http://localhost:5174', ... }
```

**If you don't see these logs:**
- The request isn't reaching the server (network issue, firewall, etc.)
- Check if the server is running and accessible
- Verify the URL is correct

**If you see OPTIONS but not GET:**
- Preflight is succeeding but the actual request is being blocked
- Check browser console for specific CORS errors
- Verify CORS headers in the OPTIONS response

**If you see GET but connection closes immediately:**
- Check for errors in the logs after "Connection established"
- Verify socket settings are correct
- Check if any middleware is closing the connection

### 2. Check Browser Network Tab

1. Open DevTools → Network tab
2. Filter by "WS" or "EventStream" or look for `/api/stream`
3. Check the request:
   - **Status**: Should be `200 OK` (or `(pending)` for active SSE)
   - **Type**: Should be `eventsource` or `xhr`
   - **Response Headers**: Should include:
     - `Access-Control-Allow-Origin: http://localhost:5174`
     - `Content-Type: text/event-stream`
     - `Cache-Control: no-cache`
     - `Connection: keep-alive`

4. Check for errors:
   - **Blocked**: Request was blocked (CORS, network, etc.)
   - **Failed**: Connection failed (network issue)
   - **CORS error**: Check response headers

### 3. Test with curl

Test the SSE endpoint directly:

```bash
# Test OPTIONS preflight
curl -X OPTIONS http://192.168.1.7:3001/api/stream?key=admin \
  -H "Origin: http://localhost:5174" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Test GET request
curl -N http://192.168.1.7:3001/api/stream?key=admin \
  -H "Origin: http://localhost:5174" \
  -v
```

Expected response headers:
```
< HTTP/1.1 200 OK
< Access-Control-Allow-Origin: http://localhost:5174
< Content-Type: text/event-stream
< Cache-Control: no-cache
< Connection: keep-alive
```

### 4. Check Browser Console

Look for specific error messages:
- `"CORS request did not succeed"` → Network/protocol failure
- `"Credential is not supported if the CORS header 'Access-Control-Allow-Origin' is '*'"` → Fixed by using specific origin
- `"Connection interrupted"` → Server closed connection or network issue
- `"NS_BINDING_ABORTED"` → Request was aborted (often by browser/plugin)

### 5. Verify Server Configuration

- **Port**: Server should be listening on `0.0.0.0:3001` (not just `localhost`)
- **Firewall**: Ensure port 3001 is accessible from the client machine
- **Network**: Verify client can reach `http://192.168.1.7:3001` (ping, curl, etc.)

## Common Fixes

### Fix 1: Use Specific Origin (Already Implemented)
✅ Changed from `Access-Control-Allow-Origin: *` to `Access-Control-Allow-Origin: <origin>`

### Fix 2: Ensure Headers Are Set Before Writes
✅ Headers are set in `setupSseHeaders()` before any `res.write()` calls

### Fix 3: Keep Socket Alive
✅ Socket keep-alive enabled with 60s interval, no timeout

### Fix 4: Write Initial Data Immediately
✅ Initial `:connected` comment and `ready` event written immediately after headers

### Fix 5: Handle Errors Gracefully
✅ Errors are logged but don't close the connection

## Still Having Issues?

1. **Check server logs** - Look for `[SSE]` prefixed messages
2. **Test with curl** - Verify the endpoint works outside the browser
3. **Check browser plugins** - Disable ad blockers/privacy tools temporarily
4. **Try different browser** - Rule out browser-specific issues
5. **Check network** - Verify client can reach server (ping, telnet, etc.)
6. **Check firewall** - Ensure port 3001 is open

## Related Files

- `src/realtime/sse.js` - Main SSE implementation
- `src/config/cors.js` - CORS configuration
- `src/server.js` - Server setup and route mounting
- `src/middleware/errorHandler.js` - Error handling (skips SSE connections)



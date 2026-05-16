// Explicit base whitelist for production and development
const BASE_WHITELIST = [
  // Production domains
  'https://cardbey.com',
  'https://www.cardbey.com',
  'https://cardbey.onrender.com',
  'https://marketing.cardbey.com',
  // Android WebView - WebViewAssetLoader uses this domain
  'https://appassets.androidplatform.net',
  // Local development
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  "http://192.168.1.9:3001",
  'http://127.0.0.1:5174',
  'http://192.168.1.9:5174',
  'http://192.168.1.12:5174', // Added for LAN access
  'http://192.168.1.12:3000', // LAN dashboard on port 3000
  'http://192.168.1.12:5173', // LAN dashboard on port 5173 (Vite default)
  // Additional LAN IPs for mobile/tablet access
  'http://172.20.10.4:3001', // LAN IP for server access
  'http://172.20.10.4:5174', // LAN IP for dashboard
  'http://172.20.10.4:3000', // LAN IP alternative port
  'http://192.168.1.3:3001', // LAN IP for server access
  'http://192.168.1.3:5174', // LAN IP for dashboard
  'http://192.168.1.3:3000', // LAN IP alternative port
  // Render staging/production dashboards (legacy support)
  'https://cardbey-marketing-dashboard.onrender.com',
  'http://cardbey-marketing-dashboard.onrender.com',
  "https://appassets.androidplatform.net",
];

// Support staging/production dashboard URLs via environment variables
const DASHBOARD_URLS = [
  process.env.DASHBOARD_URL,
  process.env.DASHBOARD_STAGING_URL,
  process.env.DASHBOARD_PRODUCTION_URL,
  process.env.FRONTEND_URL,
  process.env.STUDIO_URL,
].filter(Boolean);

// Support comma-separated ALLOWED_ORIGINS env var
const envLists = [
  process.env.ALLOWED_ORIGINS,
  process.env.CORS_WHITELIST,
]
  .filter(Boolean)
  .flatMap((value) => value.split(',')).map(s => s.trim());

const explicitOrigins = [
  process.env.STUDIO_URL,
  process.env.PLAYER_URL,
  process.env.PLAYER_ORIGIN,
].filter(Boolean).map(s => s.trim());

const dynamicOrigins = [...envLists, ...explicitOrigins, ...DASHBOARD_URLS]
  .map((value) => value.trim())
  .filter(Boolean);

// Combine all allowed origins
export const WHITELIST = new Set([...BASE_WHITELIST, ...dynamicOrigins]);

// Always log allowed origins on startup (critical for debugging on Render)
const allowedOriginsArray = Array.from(WHITELIST);
console.log('[CORS] Allowed origins:', allowedOriginsArray);

export function isOriginAllowed(origin) {
  if (!origin) return true;
  const allowed = WHITELIST.has(origin);
  if (!allowed) {
    console.warn(`[CORS] Origin not allowed: ${origin}`);
    console.warn(`[CORS] Allowed origins:`, Array.from(WHITELIST));
  }
  return allowed;
}

/**
 * Normalized CORS options for all routes
 * Use this for JSON APIs (with credentials)
 * Explicit configuration to ensure proper CORS headers
 * 
 * In development: Allows all origins for easier testing
 * In production: Uses whitelist
 */
export const corsOptions = {
  origin(origin, callback) {
    // In development, allow all origins
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // In production, check whitelist
    if (!origin || isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Pragma', // Required - browser sends this header
    'Cache-Control',
    'X-Requested-With',
    'x-cardbey-context',
    'x-user-key', // Performer app uses this header
    'X-User-Key', // Also support uppercase variant
    'Last-Event-ID',
    // File upload headers
    'Content-Length',
    'Accept',
    'Origin',
  ],
  exposedHeaders: ['Content-Length'],
  maxAge: 86400, // 24 hours
};

/**
 * CORS options for SSE routes (credentials not needed)
 * Includes headers that EventSource may send
 * Uses permissive CORS policy - allows any origin for SSE
 */
export const sseCorsOptions = {
  origin(origin, callback) {
    // For SSE, always allow - use permissive CORS
    // This ensures browsers don't block the connection
    if (!origin) {
      return callback(null, true); // allow same-origin / curl
    }
    // Always allow for SSE - we'll set Access-Control-Allow-Origin: * in the handler
    return callback(null, true);
  },
  credentials: false, // SSE doesn't need credentials
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Cache-Control',
    'Last-Event-ID',
    'X-Requested-With',
    'Accept',
    'Authorization',
  ],
};

/**
 * CORS options for WebSocket connections
 * WebSocket connections use the Upgrade header and require credentials
 */
export const websocketCorsOptions = {
  origin(origin, callback) {
    if (!origin || isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true, // WebSocket supports credentials
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Upgrade',
    'Connection',
    'Sec-WebSocket-Key',
    'Sec-WebSocket-Version',
    'Sec-WebSocket-Protocol',
    'Sec-WebSocket-Extensions',
  ],
};


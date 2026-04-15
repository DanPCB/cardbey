/**
 * Guest Rate Limiting
 * Limit guests to 20 requests per day
 */

const MAX_REQUESTS_PER_DAY = 20;
const guestRequestMap = new Map(); // {guestId: {count, day}}

// Clear old entries every hour
setInterval(() => {
  const today = new Date().toISOString().slice(0, 10);
  for (const [guestId, data] of guestRequestMap.entries()) {
    if (data.day !== today) {
      guestRequestMap.delete(guestId);
    }
  }
}, 60 * 60 * 1000);

export function guestLimit(req, res, next) {
  // Only apply to guests
  if (!req.isGuest) {
    return next();
  }
  
  const guestId = req.guest?.id;
  if (!guestId) {
    return next();
  }
  
  const today = new Date().toISOString().slice(0, 10);
  const entry = guestRequestMap.get(guestId) || { count: 0, day: today };
  
  // Reset if new day
  if (entry.day !== today) {
    entry.count = 0;
    entry.day = today;
  }
  
  // Check limit
  if (entry.count >= MAX_REQUESTS_PER_DAY) {
    return res.status(429).json({
      error: 'limit',
      message: 'Daily guest limit reached (20 requests). Create a free account to continue.',
      upgradeUrl: '/signup',
      remainingRequests: 0,
    });
  }
  
  // Increment count
  entry.count++;
  guestRequestMap.set(guestId, entry);
  
  // Add rate limit headers
  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS_PER_DAY);
  res.setHeader('X-RateLimit-Remaining', MAX_REQUESTS_PER_DAY - entry.count);
  res.setHeader('X-RateLimit-Reset', new Date(today + 'T00:00:00Z').getTime() + 24 * 60 * 60 * 1000);
  
  next();
}


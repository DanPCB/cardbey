/**
 * Device Type Inference
 * Maps platform/capabilities to device type categories
 */

/**
 * Device type categories
 * @typedef {'screen' | 'pos' | 'drone' | 'robot' | 'other'} DeviceType
 */

/**
 * Infer device type from platform string
 * Maps common platform identifiers to device categories
 * 
 * @param {string|null|undefined} platform - Platform identifier
 * @returns {DeviceType} Inferred device type
 */
export function inferDeviceType(platform) {
  if (!platform) {
    return 'other';
  }

  const p = String(platform).toLowerCase();

  // Screen devices: TVs, tablets, web players, displays
  // Also check if platform itself is "screen" (explicit deviceType)
  if (
    p === 'screen' ||
    p.includes('android_tv') ||
    p.includes('tv') ||
    p.includes('tablet') ||
    p.includes('web') ||
    p.includes('browser') ||
    p.includes('display') ||
    p.includes('screen') ||
    p.includes('signage')
  ) {
    return 'screen';
  }

  // POS devices
  if (p.includes('pos') || p.includes('point-of-sale') || p.includes('terminal')) {
    return 'pos';
  }

  // Drones
  if (p.includes('drone') || p.includes('uav')) {
    return 'drone';
  }

  // Robots
  if (p.includes('robot') || p.includes('bot')) {
    return 'robot';
  }

  // Default to other
  return 'other';
}



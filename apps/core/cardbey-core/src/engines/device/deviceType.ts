/**
 * Device Type Inference
 * Maps platform/capabilities to device type categories
 */

export type DeviceType = 'screen' | 'pos' | 'drone' | 'robot' | 'other';

/**
 * Infer device type from platform string
 * Maps common platform identifiers to device categories
 */
export function inferDeviceType(platform?: string | null): DeviceType {
  if (!platform) {
    return 'other';
  }

  const p = platform.toLowerCase();

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


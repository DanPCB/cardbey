export type DeviceIdentity = {
  deviceId: string;
  installationId: string;
  platform: string;
  appVersion: string;
  engineVersion: string;
  modelName?: string;
  platformVersion?: string;
};

export function createDeviceIdentity(input: {
  deviceId: string;
  installationId: string;
  platform: string;
  appVersion: string;
  engineVersion?: string;
  modelName?: string;
  platformVersion?: string;
}): DeviceIdentity {
  return {
    deviceId: input.deviceId.trim(),
    installationId: input.installationId.trim(),
    platform: input.platform.trim(),
    appVersion: input.appVersion.trim(),
    engineVersion: (input.engineVersion ?? 'DEVICE_V2').trim(),
    modelName: input.modelName?.trim() || undefined,
    platformVersion: input.platformVersion?.trim() || undefined,
  };
}

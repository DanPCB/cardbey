import type {
  BusinessCandidate,
  DiscoveryDiscoverParams,
  DiscoveryProvider,
  DiscoveryProviderId,
} from '../types/index.js';

export class DiscoveryRegistry {
  private readonly providers = new Map<DiscoveryProviderId, DiscoveryProvider>();

  registerProvider(provider: DiscoveryProvider): void {
    this.providers.set(provider.providerId, provider);
  }

  unregisterProvider(providerId: DiscoveryProviderId): void {
    this.providers.delete(providerId);
  }

  getProvider(providerId: DiscoveryProviderId): DiscoveryProvider | undefined {
    return this.providers.get(providerId);
  }

  listProviderIds(): DiscoveryProviderId[] {
    return [...this.providers.keys()];
  }

  async discover(params: DiscoveryDiscoverParams): Promise<BusinessCandidate[]> {
    const provider = this.providers.get(params.provider);
    if (!provider) {
      throw new Error(`Discovery provider not registered: ${params.provider}`);
    }
    return provider.discover(params);
  }
}

export const discoveryRegistry = new DiscoveryRegistry();

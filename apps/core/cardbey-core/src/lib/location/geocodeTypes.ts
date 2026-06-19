/**
 * Shared geocoding types — provider-agnostic contract for store location services.
 */

export type GeocodeConfidence = 'high' | 'medium' | 'low' | 'city_level';

export type GeocodeResult = {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  confidence: GeocodeConfidence;
  provider: string;
  providerPlaceId: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  suburb: string | null;
};

export type ReverseGeocodeResult = {
  formattedAddress: string;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  suburb: string | null;
  confidence: GeocodeConfidence;
  provider: string;
};

export type GeocodeSearchInput = {
  query: string;
  countryBias?: string | null;
  cityBias?: string | null;
  limit?: number;
};

export type ReverseGeocodeInput = {
  latitude: number;
  longitude: number;
};

export interface GeocodeProvider {
  readonly name: string;
  search(input: GeocodeSearchInput): Promise<GeocodeResult[]>;
  reverse(input: ReverseGeocodeInput): Promise<ReverseGeocodeResult | null>;
}

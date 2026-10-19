export const GEOCODER = Symbol('GEOCODER');

export interface Place {
  /** Full address, e.g. "Rue de la République, Étampes, Essonne, France". */
  label: string;
  /** Short name people use: village, town or city. */
  locality: string;
  region: string | null;
  countryCode: string | null;
  lat: number;
  lng: number;
}

export interface Geocoder {
  search(query: string): Promise<Place[]>;
  reverse(lat: number, lng: number): Promise<Place | null>;
}

/** Used when geocoding is turned off (tests, or no internet on the server). */
export class NoGeocoder implements Geocoder {
  async search(): Promise<Place[]> {
    return [];
  }
  async reverse(): Promise<Place | null> {
    return null;
  }
}

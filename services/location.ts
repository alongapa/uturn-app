import * as Location from 'expo-location';

export async function requestLocationPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getCurrentPosition(): Promise<Location.LocationObject | null> {
  const granted = await requestLocationPermission();
  if (!granted) {
    return null;
  }

  return Location.getCurrentPositionAsync({});
}

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type GeocodedAddress = {
  address: string;
  coordinates: Coordinates;
};

type GeocodeResult = {
  latitude: number;
  longitude: number;
  street?: string;
  city?: string;
  region?: string;
  name?: string;
};

export async function geocodeAddress(query: string): Promise<GeocodedAddress[]> {
  if (!query.trim()) return [];
  const granted = await requestLocationPermission();
  if (!granted) {
    return [];
  }

  const results = await Location.geocodeAsync(query);
  return results.map((result: GeocodeResult) => ({
    address: [result.name, result.street, result.city, result.region].filter(Boolean).join(', ') || query,
    coordinates: { latitude: result.latitude, longitude: result.longitude },
  }));
}

export async function reverseGeocode(coords: Coordinates): Promise<string | null> {
  const granted = await requestLocationPermission();
  if (!granted) {
    return null;
  }

  const results = await Location.reverseGeocodeAsync(coords);
  if (!results.length) return null;

  const result = results[0] as GeocodeResult;
  return [result.name, result.street, result.city, result.region].filter(Boolean).join(', ') || null;
}

export async function watchPosition(
  callback: (coords: Coordinates) => void
): Promise<{ remove: () => void } | null> {
  const granted = await requestLocationPermission();
  if (!granted) {
    return null;
  }

  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 10,
    },
    ({ coords }: { coords: { latitude: number; longitude: number } }) =>
      callback({ latitude: coords.latitude, longitude: coords.longitude })
  ) as Promise<{ remove: () => void }>;
}

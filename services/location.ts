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

export type Coordinates = {
  latitude: number;
  longitude: number;
};

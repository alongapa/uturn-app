import * as Location from 'expo-location';

export async function requestLocationPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getCurrentPosition() {
  return Location.getCurrentPositionAsync({});
}

export type Coordinates = {
  latitude: number;
  longitude: number;
};

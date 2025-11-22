declare module 'expo-location' {
  export type PermissionStatus = 'undetermined' | 'granted' | 'denied';
  export type PermissionResponse = { status: PermissionStatus };
  export type LocationObject = {
    coords: {
      latitude: number;
      longitude: number;
    };
  };
  export function requestForegroundPermissionsAsync(): Promise<PermissionResponse>;
  export function getCurrentPositionAsync(options?: object): Promise<LocationObject>;
}

declare module 'react-native-maps' {
  import * as React from 'react';
  import { ViewStyle } from 'react-native';

  export type LatLng = {
    latitude: number;
    longitude: number;
  };

  export type Region = LatLng & {
    latitudeDelta: number;
    longitudeDelta: number;
  };

  export interface MapViewProps {
    style?: ViewStyle | ViewStyle[];
    region?: Region;
    children?: React.ReactNode;
  }

  export default class MapView extends React.Component<MapViewProps> {}

  export class Marker extends React.Component<{
    coordinate: LatLng;
    title?: string;
    description?: string;
    pinColor?: string;
  }> {}
}

declare module 'expo-image-picker' {
  export type PermissionStatus = 'undetermined' | 'granted' | 'denied';
  export type PermissionResponse = { status: PermissionStatus };

  export enum MediaTypeOptions {
    Images = 'Images',
    Videos = 'Videos',
    All = 'All',
  }

  export type ImagePickerAsset = {
    uri?: string;
    width?: number;
    height?: number;
    fileName?: string;
  };

  export type ImagePickerResult =
    | { canceled: true }
    | { canceled: false; assets: ImagePickerAsset[] };

  export function requestMediaLibraryPermissionsAsync(): Promise<PermissionResponse>;
  export function launchImageLibraryAsync(options?: {
    allowsMultipleSelection?: boolean;
    quality?: number;
    mediaTypes?: MediaTypeOptions;
  }): Promise<ImagePickerResult>;
}

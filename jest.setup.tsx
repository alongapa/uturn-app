// Setup común de Jest (Sesión 10).
//
// Criterio: acá van solo los mocks de *plataforma* — módulos nativos que en
// Node no existen y que harían fallar cualquier import. Los mocks de datos
// (respuestas de Supabase, perfiles, viajes) van en cada test, para que se lea
// en el propio archivo qué está devolviendo el servidor.

// Desde @testing-library/react-native 13 los matchers (toBeOnTheScreen,
// toHaveTextContent...) vienen incorporados; no hay que importar
// 'extend-expect' como en las versiones viejas.

// AsyncStorage es nativo: sin este mock, importar services/supabase.ts falla.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// expo-router monta un contexto de navegación real; los tests de componente
// solo necesitan comprobar a dónde se navega.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissAll: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/',
  Link: 'Link',
  Stack: Object.assign(() => null, { Screen: () => null }),
  Redirect: () => null,
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', canAskAgain: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', canAskAgain: true }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[test]' }),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  setBadgeCountAsync: jest.fn().mockResolvedValue(true),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  AndroidImportance: { MAX: 5, DEFAULT: 3 },
}));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', canAskAgain: true }),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', canAskAgain: true }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: -33.4489, longitude: -70.6693, accuracy: 10 },
  }),
  Accuracy: { Balanced: 3, High: 4 },
}));

jest.mock('expo-device', () => ({ isDevice: true, deviceName: 'jest' }));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// react-native-maps trae vistas nativas; en tests basta con que rendericen algo.
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockMapView = (props: Record<string, unknown> & { children?: React.ReactNode }) =>
    React.createElement(View, props, props.children);
  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMapView,
    Polyline: MockMapView,
    Callout: MockMapView,
    PROVIDER_GOOGLE: 'google',
  };
});

// Silencia el aviso de "Supabase no está configurado" de services/supabase.ts:
// en tests nunca hay .env y el warning ensucia la salida de todos los suites.
const originalWarn = console.warn;
beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Supabase no está configurado')) return;
    originalWarn(...args);
  });
});

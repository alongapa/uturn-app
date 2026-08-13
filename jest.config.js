// Runner de tests (Sesión 10). Antes de esta sesión `npm test` era solo
// lint + typecheck; ahora corre además Jest.
//
// El preset `jest-expo` es el que sabe transformar el runtime de Expo/React
// Native (Flow en los .js de react-native, los módulos nativos, `expo-*`).
// Con el preset de `ts-jest` o el `react-native` a secas, importar cualquier
// pantalla revienta en el primer `import` de un paquete de Expo.

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',

  setupFilesAfterEnv: ['<rootDir>/jest.setup.tsx'],

  // Mismo alias que tsconfig.json, si no `@/services/...` no resuelve.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },

  testMatch: ['<rootDir>/__tests__/**/*.test.ts', '<rootDir>/__tests__/**/*.test.tsx'],

  // `supabase/functions` corre en Deno y tiene su propio typecheck; que Jest
  // ni lo mire. `node_modules` va explícito porque al sobrescribir esta lista
  // se pierde el default.
  testPathIgnorePatterns: ['/node_modules/', '/supabase/functions/', '/.expo/', '/dist/'],

  collectCoverageFrom: [
    'services/**/*.ts',
    'hooks/**/*.ts',
    'components/**/*.tsx',
    '!services/api/index.ts',
    '!**/*.d.ts',
  ],

  // La lógica de negocio que esta sesión cubre (penalizaciones, comisiones,
  // créditos, k-anonimato) es pura y no debería bajar de acá sin que alguien
  // lo note en CI.
  coverageThreshold: {
    'services/penalties.ts': { statements: 90, branches: 85, functions: 100, lines: 90 },
    'services/payments.ts': { statements: 90, branches: 85, functions: 90, lines: 90 },
    'services/analytics/k-anonymity.ts': { statements: 95, branches: 90, functions: 100, lines: 95 },
  },
};

// Filtrado de datos personales antes de enviar un crash a Sentry.
//
// Esto no es un detalle de implementación: la política de privacidad declara
// que a la herramienta de diagnóstico no viajan datos personales. El test
// existe para que esa frase siga siendo cierta cuando alguien agregue un
// `extra` nuevo dentro de seis meses.

type SentryOptions = {
  sendDefaultPii?: boolean;
  tracesSampleRate?: number;
  beforeSend?: (event: Record<string, unknown>) => Record<string, unknown> | null;
  beforeBreadcrumb?: (crumb: Record<string, unknown>) => Record<string, unknown> | null;
};

/**
 * Carga services/monitoring.ts con un DSN presente y devuelve las opciones con
 * las que llamó a Sentry.init.
 *
 * Hace falta reimportar el módulo porque el DSN se lee una sola vez, al
 * evaluarlo. Y hay que pedir el mock de Sentry DESPUÉS del resetModules, en el
 * mismo registro: si se importara arriba, `jest.resetModules()` le daría a
 * monitoring.ts una instancia distinta y las llamadas no se verían acá.
 */
function initWithDsn(): SentryOptions {
  jest.resetModules();
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@sentry.example/1';

  /* eslint-disable @typescript-eslint/no-require-imports */
  const Sentry = require('@sentry/react-native') as { init: jest.Mock };
  const monitoring = require('@/services/monitoring') as typeof import('@/services/monitoring');
  /* eslint-enable @typescript-eslint/no-require-imports */

  Sentry.init.mockClear();
  monitoring.initMonitoring();

  return Sentry.init.mock.calls[0][0] as SentryOptions;
}

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  jest.resetModules();
});

describe('configuración', () => {
  it('no activa la recolección automática de datos personales', () => {
    // sendDefaultPii mandaría IP y datos de usuario sin que nadie lo pida.
    expect(initWithDsn().sendDefaultPii).toBe(false);
  });

  it('no muestrea trazas de rendimiento', () => {
    // El piloto necesita saber qué se rompe, no cuánto tarda; las trazas son
    // la parte cara del plan.
    expect(initWithDsn().tracesSampleRate).toBe(0);
  });

  it('queda en no-op sin DSN', () => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;

    /* eslint-disable @typescript-eslint/no-require-imports */
    const Sentry = require('@sentry/react-native') as { init: jest.Mock };
    const monitoring = require('@/services/monitoring') as typeof import('@/services/monitoring');
    /* eslint-enable @typescript-eslint/no-require-imports */

    Sentry.init.mockClear();
    monitoring.initMonitoring();

    expect(monitoring.isMonitoringEnabled).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });
});

describe('filtrado de datos personales', () => {
  it('borra el correo institucional del contexto', () => {
    const { beforeSend } = initWithDsn();

    const event = beforeSend!({ extra: { email: 'juan.perez@udd.cl', tripId: 't-1' } });

    expect((event!.extra as Record<string, unknown>).email).toBe('[filtrado]');
    // Lo que no es personal tiene que sobrevivir, o el reporte no sirve.
    expect((event!.extra as Record<string, unknown>).tripId).toBe('t-1');
  });

  it.each([
    ['nombre', 'Juan Pérez'],
    ['patente', 'ABCD12'],
    ['numeroCuenta', '00012345678'],
    ['driver_license_number', '12345678-9'],
    ['access_token', 'eyJhbGciOi'],
  ])('borra %s', (key, value) => {
    const { beforeSend } = initWithDsn();

    const event = beforeSend!({ extra: { [key]: value } });

    expect((event!.extra as Record<string, unknown>)[key]).toBe('[filtrado]');
  });

  it('borra el contenido de los mensajes', () => {
    // Un error en el chat no puede llevarse el texto de la conversación.
    const { beforeSend } = initWithDsn();

    const event = beforeSend!({ extra: { body: 'nos vemos en la entrada', conversationId: 'c-1' } });

    expect((event!.extra as Record<string, unknown>).body).toBe('[filtrado]');
    expect((event!.extra as Record<string, unknown>).conversationId).toBe('c-1');
  });

  it('filtra sin importar mayúsculas ni prefijos', () => {
    const { beforeSend } = initWithDsn();

    const event = beforeSend!({ extra: { userEmail: 'a@udd.cl', PATENTE: 'XY1234' } });

    expect((event!.extra as Record<string, unknown>).userEmail).toBe('[filtrado]');
    expect((event!.extra as Record<string, unknown>).PATENTE).toBe('[filtrado]');
  });

  it('deja solo el id del usuario', () => {
    const { beforeSend } = initWithDsn();

    const event = beforeSend!({
      user: { id: 'uuid-1', email: 'juan@udd.cl', username: 'juanp' },
    });

    expect(event!.user).toEqual({ id: 'uuid-1' });
  });

  it('también filtra los breadcrumbs', () => {
    // Las migas se envían junto al crash: filtrar solo el evento dejaría el
    // correo en la miga de "abrió su perfil".
    const { beforeBreadcrumb } = initWithDsn();

    const crumb = beforeBreadcrumb!({ message: 'perfil', data: { email: 'a@udd.cl', screen: 'perfil' } });

    expect((crumb!.data as Record<string, unknown>).email).toBe('[filtrado]');
    expect((crumb!.data as Record<string, unknown>).screen).toBe('perfil');
  });

  it('no se cae si no hay contexto', () => {
    const { beforeSend, beforeBreadcrumb } = initWithDsn();

    expect(() => beforeSend!({})).not.toThrow();
    expect(() => beforeBreadcrumb!({ message: 'x' })).not.toThrow();
  });
});

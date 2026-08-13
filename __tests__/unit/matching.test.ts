// Ranking de viajes para un pasajero y sugerencia de punto de encuentro.
//
// El score mezcla cinco factores con pesos; testear el número exacto sería
// testear los pesos y romperse en cada ajuste. Lo que se fija acá es el
// comportamiento observable: qué viaje queda arriba, qué se filtra, y que la
// sugerencia de punto de encuentro no mande a nadie a caminar kilómetros.

import { rankTripsForPassenger, suggestMeetingPoint } from '@/services/matching';
import type { Coordinates, Trip } from '@/store/appState';

const NOW = new Date('2026-03-10T12:00:00.000Z');

// Referencias reales de Santiago: el pasajero vive cerca de Tobalaba.
const TOBALABA: Coordinates = { latitude: -33.4239, longitude: -70.6045 };
const LAS_CONDES: Coordinates = { latitude: -33.4055, longitude: -70.5448 };
const MAIPU: Coordinates = { latitude: -33.5111, longitude: -70.7581 };

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    driverId: 'd1',
    origenCampus: 'Campus A',
    destinoCampus: 'Campus B',
    horaSalida: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
    precioCLP: 2000,
    asientosDisponibles: 3,
    asientosOcupados: 0,
    coordenadasOrigen: TOBALABA,
    coordenadasDestino: LAS_CONDES,
    ...overrides,
  } as Trip;
}

describe('ranking de viajes', () => {
  it('pone arriba el viaje cuya ruta pasa más cerca', () => {
    const cerca = trip({ id: 'cerca', coordenadasOrigen: TOBALABA, coordenadasDestino: LAS_CONDES });
    const lejos = trip({ id: 'lejos', coordenadasOrigen: MAIPU, coordenadasDestino: LAS_CONDES });

    const ranked = rankTripsForPassenger({
      passengerLocation: TOBALABA,
      trips: [lejos, cerca],
      now: NOW,
    });

    expect(ranked[0].trip.id).toBe('cerca');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('desempata por distancia a la ruta con todo lo demás igual', () => {
    const a = trip({ id: 'a' });
    const b = trip({ id: 'b', coordenadasOrigen: { latitude: -33.4300, longitude: -70.6100 } });

    const ranked = rankTripsForPassenger({
      passengerLocation: TOBALABA,
      trips: [b, a],
      now: NOW,
    });

    expect(ranked[0].distanceToRoute).toBeLessThanOrEqual(ranked[1].distanceToRoute);
  });

  it('descarta los viajes a otro campus cuando se filtra por destino', () => {
    const aIngenieria = trip({ id: 'ing', destinoCampusId: 'udd-las-condes' });
    const aOtro = trip({ id: 'otro', destinoCampusId: 'uai-penalolen' });

    const ranked = rankTripsForPassenger({
      passengerLocation: TOBALABA,
      destinationId: 'udd-las-condes',
      trips: [aIngenieria, aOtro],
      now: NOW,
    });

    expect(ranked.map((match) => match.trip.id)).toEqual(['ing']);
  });

  it('no descarta viajes sin campus de destino declarado', () => {
    // Los viajes del prototipo local no siempre traen destinoCampusId; que el
    // filtro los coma dejaría el buscador vacío sin explicación.
    const sinCampus = trip({ id: 'sin-campus', destinoCampusId: undefined });

    const ranked = rankTripsForPassenger({
      passengerLocation: TOBALABA,
      destinationId: 'udd-las-condes',
      trips: [sinCampus],
      now: NOW,
    });

    expect(ranked).toHaveLength(1);
  });

  it('penaliza un viaje que ya salió', () => {
    const yaSalio = trip({ id: 'pasado', horaSalida: new Date(NOW.getTime() - 3600_000).toISOString() });
    const porSalir = trip({ id: 'futuro' });

    const ranked = rankTripsForPassenger({
      passengerLocation: TOBALABA,
      trips: [yaSalio, porSalir],
      now: NOW,
    });

    expect(ranked[0].trip.id).toBe('futuro');
  });

  it('prefiere al conductor mejor evaluado en igualdad de condiciones', () => {
    const bueno = trip({ id: 'bueno', driverReputation: 5 });
    const malo = trip({ id: 'malo', driverReputation: 2 });

    const ranked = rankTripsForPassenger({
      passengerLocation: TOBALABA,
      trips: [malo, bueno],
      now: NOW,
    });

    expect(ranked[0].trip.id).toBe('bueno');
    expect(ranked[0].reasons).toContain('Conductor con buena reputación');
  });

  it('etiqueta y rankea de forma coherente con el score', () => {
    const ranked = rankTripsForPassenger({
      passengerLocation: TOBALABA,
      trips: [trip({ driverReputation: 5 })],
      now: NOW,
    });

    const match = ranked[0];
    expect(match.score).toBeGreaterThanOrEqual(0);
    expect(match.score).toBeLessThanOrEqual(1);
    expect([100, 80, 60, 30]).toContain(match.rank);
    // La etiqueta no puede contradecir al rank que se muestra al lado.
    if (match.rank === 100) expect(match.matchLabel).toBe('Coincidencia alta');
    if (match.rank === 30) expect(match.matchLabel).toBe('Coincidencia baja');
  });

  it('devuelve una lista vacía sin viajes', () => {
    expect(rankTripsForPassenger({ passengerLocation: TOBALABA, trips: [], now: NOW })).toEqual([]);
  });

  it('ordena de mayor a menor score', () => {
    const ranked = rankTripsForPassenger({
      passengerLocation: TOBALABA,
      trips: [
        trip({ id: 'a', coordenadasOrigen: MAIPU }),
        trip({ id: 'b', driverReputation: 5 }),
        trip({ id: 'c', coordenadasOrigen: LAS_CONDES }),
      ],
      now: NOW,
    });

    const scores = ranked.map((match) => match.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });
});

describe('sugerencia de punto de encuentro', () => {
  it('propone un punto sobre la ruta si queda a distancia caminable', () => {
    const route = [TOBALABA, LAS_CONDES];

    const suggestion = suggestMeetingPoint(TOBALABA, route);

    expect(suggestion?.reason).toBe('Ruta cercana');
    expect(suggestion!.distance).toBeLessThanOrEqual(800);
  });

  it('cae a un punto público seguro cuando la ruta queda lejos', () => {
    // El pasajero está lejos de la ruta pero cerca de una estación de metro:
    // mejor mandarlo a un lugar concurrido que a un punto aleatorio del mapa.
    const route = [MAIPU, { latitude: -33.5200, longitude: -70.7700 }];
    const nearTobalaba: Coordinates = { latitude: -33.4245, longitude: -70.6050 };

    const suggestion = suggestMeetingPoint(nearTobalaba, route);

    expect(suggestion?.reason).toBe('Punto seguro');
    expect(suggestion?.name).toBe('Metro Tobalaba');
  });

  it('no inventa un punto si no hay nada razonable cerca', () => {
    const route = [MAIPU, { latitude: -33.5200, longitude: -70.7700 }];
    const enOtraRegion: Coordinates = { latitude: -36.8270, longitude: -73.0503 }; // Concepción

    expect(suggestMeetingPoint(enOtraRegion, route)).toBeNull();
  });

  it('devuelve null con una ruta degenerada', () => {
    expect(suggestMeetingPoint(TOBALABA, [])).toBeNull();
    expect(suggestMeetingPoint(TOBALABA, [TOBALABA])).toBeNull();
  });
});

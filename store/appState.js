import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
const AppStateContext = createContext(undefined);
const mockTrips = [
    {
        id: 'trip-1',
        driverId: 'driver-1',
        origenCampus: 'Campus Peñalolén',
        destinoCampus: 'Providencia',
        puntoEncuentroId: 'mp-1',
        horaSalida: new Date().toISOString(),
        precioCLP: 2500,
        asientosDisponibles: 3,
        asientosOcupados: 1,
        coordenadasOrigen: { latitude: -33.489, longitude: -70.497 },
        coordenadasDestino: { latitude: -33.4329, longitude: -70.63 },
    },
    {
        id: 'trip-2',
        driverId: 'driver-2',
        origenCampus: 'Campus San Carlos',
        destinoCampus: 'La Reina',
        puntoEncuentroId: 'mp-2',
        horaSalida: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        precioCLP: 2200,
        asientosDisponibles: 2,
        asientosOcupados: 2,
        coordenadasOrigen: { latitude: -33.4248, longitude: -70.5133 },
        coordenadasDestino: { latitude: -33.441, longitude: -70.546 },
    },
];
const mockBookings = [
    {
        id: 'booking-1',
        tripId: 'trip-1',
        passengerId: 'user-1',
        estado: 'confirmada',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
        id: 'booking-2',
        tripId: 'trip-2',
        passengerId: 'user-1',
        estado: 'pendiente',
        createdAt: new Date().toISOString(),
    },
];
const initialUser = {
    id: 'user-1',
    nombre: 'Estudiante UTURN',
    email: 'estudiante@alumnos.uai.cl',
    universidad: 'UAI',
    campus: 'Peñalolén',
    fechaNacimiento: '2000-01-01',
    urlFotoPerfil: undefined,
    lateCancellationsCount: 0,
    lastLateCancellationAt: null,
    blockedUntil: null,
};
export function AppStateProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(initialUser);
    const [cars, setCars] = useState([
        {
            id: 'car-1',
            modelo: 'Mazda 3',
            año: 2021,
            patente: 'UT-URN1',
            color: 'Azul',
            capacidadAsientos: 4,
        },
    ]);
    const [trips, setTrips] = useState(mockTrips);
    const [bookings, setBookings] = useState(mockBookings);
    const addCar = useCallback((car) => {
        setCars((prev) => [...prev, car]);
    }, []);
    const updateCar = useCallback((carId, updated) => {
        setCars((prev) => prev.map((car) => (car.id === carId ? Object.assign(Object.assign({}, car), updated) : car)));
    }, []);
    const removeCar = useCallback((carId) => {
        setCars((prev) => prev.filter((car) => car.id !== carId));
    }, []);
    const addTrip = useCallback((trip) => {
        var _a;
        const newTrip = Object.assign(Object.assign({}, trip), { id: `trip-${Date.now()}`, asientosOcupados: (_a = trip.asientosOcupados) !== null && _a !== void 0 ? _a : 0 });
        setTrips((prev) => [newTrip, ...prev]);
        return newTrip;
    }, []);
    const updateTrip = useCallback((tripId, updated) => {
        setTrips((prev) => prev.map((trip) => (trip.id === tripId ? Object.assign(Object.assign({}, trip), updated) : trip)));
    }, []);
    const cancelTrip = useCallback((tripId) => {
        setTrips((prev) => prev.map((trip) => trip.id === tripId
            ? Object.assign(Object.assign({}, trip), { asientosDisponibles: 0, asientosOcupados: 0 }) : trip));
    }, []);
    const addBooking = useCallback((booking) => {
        var _a, _b;
        const newBooking = Object.assign(Object.assign({}, booking), { id: `booking-${Date.now()}`, estado: (_a = booking.estado) !== null && _a !== void 0 ? _a : 'pendiente', createdAt: (_b = booking.createdAt) !== null && _b !== void 0 ? _b : new Date().toISOString() });
        setBookings((prev) => [newBooking, ...prev]);
        return newBooking;
    }, []);
    const updateBooking = useCallback((bookingId, updated) => {
        setBookings((prev) => prev.map((booking) => (booking.id === bookingId ? Object.assign(Object.assign({}, booking), updated) : booking)));
    }, []);
    const canUserBookOrCancel = useCallback((user, now) => {
        if (!user) {
            return { allowed: false, reason: 'Debes iniciar sesión para continuar' };
        }
        const blockedUntil = user.blockedUntil ? new Date(user.blockedUntil) : null;
        if (blockedUntil && blockedUntil > now) {
            return {
                allowed: false,
                reason: `Usuario bloqueado hasta ${blockedUntil.toLocaleString('es-CL')}`,
            };
        }
        if (user.lastLateCancellationAt) {
            const daysSinceLastLate = (now.getTime() - new Date(user.lastLateCancellationAt).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceLastLate >= 30 && user.lateCancellationsCount > 0) {
                setCurrentUser(Object.assign(Object.assign({}, user), { lateCancellationsCount: 0, lastLateCancellationAt: null }));
            }
        }
        return { allowed: true };
    }, [setCurrentUser]);
    const cancelBooking = useCallback((bookingId, now) => {
        const booking = bookings.find((b) => b.id === bookingId);
        if (!booking) {
            return { success: false, reason: 'Reserva no encontrada' };
        }
        const trip = trips.find((t) => t.id === booking.tripId);
        if (!trip) {
            return { success: false, reason: 'Viaje no encontrado' };
        }
        const user = currentUser;
        const canProceed = canUserBookOrCancel(user, now);
        if (!canProceed.allowed) {
            return { success: false, reason: canProceed.reason };
        }
        const departure = new Date(trip.horaSalida);
        const hour = departure.getHours();
        const isMorningArrival = hour >= 8 && hour < 10;
        const freeWindowHours = isMorningArrival ? 12 : 2;
        const diffHours = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);
        const isLate = diffHours < freeWindowHours;
        setBookings((prev) => prev.map((b) => (b.id === bookingId ? Object.assign(Object.assign({}, b), { estado: 'cancelada' }) : b)));
        if (!isLate || !user) {
            return { success: true };
        }
        setCurrentUser((prev) => {
            if (!prev)
                return prev;
            let count = prev.lateCancellationsCount;
            if (prev.lastLateCancellationAt) {
                const days = (now.getTime() - new Date(prev.lastLateCancellationAt).getTime()) / (1000 * 60 * 60 * 24);
                if (days >= 30) {
                    count = 0;
                }
            }
            const newCount = count + 1;
            let blockedUntil = prev.blockedUntil ? new Date(prev.blockedUntil) : null;
            if (newCount % 3 === 0) {
                const blockIndex = newCount / 3;
                if (blockIndex === 1) {
                    blockedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                }
                else if (blockIndex === 2) {
                    blockedUntil = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
                }
                else if (blockIndex >= 3) {
                    blockedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                }
            }
            return Object.assign(Object.assign({}, prev), { lateCancellationsCount: newCount, lastLateCancellationAt: now, blockedUntil });
        });
        return { success: true, reason: isLate ? 'Cancelación tardía registrada' : undefined };
    }, [bookings, trips, currentUser, canUserBookOrCancel]);
    const value = useMemo(() => ({
        currentUser,
        setCurrentUser,
        cars,
        addCar,
        updateCar,
        removeCar,
        trips,
        addTrip,
        updateTrip,
        cancelTrip,
        bookings,
        addBooking,
        updateBooking,
        canUserBookOrCancel,
        cancelBooking,
    }), [
        currentUser,
        cars,
        trips,
        bookings,
        addCar,
        updateCar,
        removeCar,
        addTrip,
        updateTrip,
        cancelTrip,
        addBooking,
        updateBooking,
        canUserBookOrCancel,
        cancelBooking,
    ]);
    return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}
export function useAppState() {
    const context = useContext(AppStateContext);
    if (!context) {
        throw new Error('useAppState debe usarse dentro de AppStateProvider');
    }
    return context;
}

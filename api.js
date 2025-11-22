var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// --- Datos simulados ---
let users = [];
let trips = [];
let bookings = [];
let ratings = [];
const wait = (ms = 300) => new Promise(r => setTimeout(r, ms));
// --- login y rol ---
export function login(email, name) {
    return __awaiter(this, void 0, void 0, function* () {
        yield wait();
        const ok = /(@alumnos.uai\.cl|@udd\.cl|@miuandes\.cl)$/i.test(email);
        if (!ok)
            throw new Error('Debe usar correo institucional (@alumnos.uai.cl, @miudd.cl o @miuandes.cl)');
        let u = users.find(x => x.email === email);
        if (!u) {
            u = { id: 'u' + (users.length + 1), name, email, role: 'rider' };
            users.push(u);
        }
        return u;
    });
}
export function setRole(userId, role) {
    return __awaiter(this, void 0, void 0, function* () {
        yield wait();
        const u = users.find(x => x.id === userId);
        if (!u)
            throw new Error('Usuario no encontrado');
        u.role = role;
        return u;
    });
}
// --- viajes ---
export function listTrips(q) {
    return __awaiter(this, void 0, void 0, function* () {
        yield wait();
        return (q === null || q === void 0 ? void 0 : q.dest) ? trips.filter(t => { var _a; return t.dest.toLowerCase().includes(((_a = q.dest) !== null && _a !== void 0 ? _a : '').toLowerCase()); }) : trips;
    });
}
export function createTrip(user, data) {
    return __awaiter(this, void 0, void 0, function* () {
        yield wait();
        const t = Object.assign(Object.assign({}, data), { id: 't' + (trips.length + 1), driverId: user.id, driverName: user.name });
        trips.unshift(t);
        return t;
    });
}
export function reserve(tripId, riderId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield wait();
        const t = trips.find(x => x.id === tripId);
        if (!t || t.seats < 1)
            throw new Error('Sin cupos disponibles');
        t.seats -= 1;
        const b = { id: 'b' + (bookings.length + 1), tripId, riderId, status: 'reserved' };
        bookings.push(b);
        return b;
    });
}
// --- calificación ---
export function rate(fromId, toId, tripId, stars, note) {
    return __awaiter(this, void 0, void 0, function* () {
        yield wait();
        const r = { id: 'r' + (ratings.length + 1), fromId, toId, tripId, stars, note };
        ratings.push(r);
        return r;
    });
}
// --- getters para KPIs ---
export function getTrips() { return [...trips]; }
export function getBookings() { return [...bookings]; }
export function getRatings() { return [...ratings]; }

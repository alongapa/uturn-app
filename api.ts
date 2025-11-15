// Local type definitions (replaces missing ../models/types)
type StarRating = 1 | 2 | 3 | 4 | 5;

interface User {
  id: string;
  name: string;
  email: string;
  role: 'driver' | 'rider';
}

interface Trip {
  id: string;
  driverId: string;
  driverName: string;
  dest: string;
  seats: number;
  date?: string;
  notes?: string;
}

interface Booking {
  id: string;
  tripId: string;
  riderId: string;
  status: 'reserved' | 'cancelled' | 'completed';
}

interface Rating {
  id: string;
  fromId: string;
  toId: string;
  tripId: string;
  stars: StarRating;
  note?: string;
}

// --- Datos simulados ---
let users: User[] = [];
let trips: Trip[] = [];
let bookings: Booking[] = [];
let ratings: Rating[] = [];

const wait = (ms = 300) => new Promise(r => setTimeout(r, ms));

// --- login y rol ---
export async function login(email: string, name: string) {
  await wait();
  const ok = /(@alumnos.uai\.cl|@udd\.cl|@miuandes\.cl)$/i.test(email);
  if (!ok) throw new Error('Debe usar correo institucional (@alumnos.uai.cl, @miudd.cl o @miuandes.cl)');
  let u = users.find(x => x.email === email);
  if (!u) { u = { id: 'u' + (users.length + 1), name, email, role: 'rider' }; users.push(u); }
  return u;
}

export async function setRole(userId: string, role: 'driver' | 'rider') {
  await wait();
  const u = users.find(x => x.id === userId);
  if (!u) throw new Error('Usuario no encontrado');
  u.role = role;
  return u;
}

// --- viajes ---
export async function listTrips(q?: { dest?: string }) {
  await wait();
  return q?.dest ? trips.filter(t => t.dest.toLowerCase().includes((q.dest ?? '').toLowerCase())) : trips;
}

export async function createTrip(user: User, data: Omit<Trip, 'id' | 'driverId' | 'driverName'>) {
  await wait();
  const t: Trip = { ...data, id: 't' + (trips.length + 1), driverId: user.id, driverName: user.name };
  trips.unshift(t);
  return t;
}

export async function reserve(tripId: string, riderId: string) {
  await wait();
  const t = trips.find(x => x.id === tripId);
  if (!t || t.seats < 1) throw new Error('Sin cupos disponibles');
  t.seats -= 1;
  const b: Booking = { id: 'b' + (bookings.length + 1), tripId, riderId, status: 'reserved' };
  bookings.push(b);
  return b;
}

// --- calificación ---
export async function rate(
  fromId: string,
  toId: string,
  tripId: string,
  stars: 1 | 2 | 3 | 4 | 5,
  note?: string
) {
  await wait();
  const r: Rating = { id: 'r' + (ratings.length + 1), fromId, toId, tripId, stars, note };
  ratings.push(r);
  return r;
}

// --- getters para KPIs ---
export function getTrips() { return [...trips]; }
export function getBookings() { return [...bookings]; }
export function getRatings() { return [...ratings]; }

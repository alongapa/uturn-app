import type {
  AppSettings,
  CreditTransaction,
  RedeemableItem,
  Redemption,
  WeeklyHighlight,
} from '@/models/uturn';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY).toISOString();

// Catálogo de canjeables. En la Sesión 4 lo publican los admins; por ahora es mock tipado.
export const REDEEMABLE_ITEMS: RedeemableItem[] = [
  {
    id: 'redeem-cafe',
    titulo: 'Café gratis en Cafetería Central',
    descripcion: 'Un café de especialidad a elección en la cafetería del campus.',
    categoria: 'comida',
    costoCreditos: 80,
    patrocinador: 'Cafetería Central',
    stock: 20,
    vigenciaDias: 7,
    publicadoPorAdmin: true,
  },
  {
    id: 'redeem-snack',
    titulo: 'Snack + bebida',
    descripcion: 'Combo de snack y bebida en los kioscos adheridos.',
    categoria: 'comida',
    costoCreditos: 40,
    stock: 50,
    vigenciaDias: 5,
    publicadoPorAdmin: true,
  },
  {
    id: 'redeem-bencina',
    titulo: 'Descuento $3.000 en bencina',
    descripcion: 'Descuento directo para conductores en estaciones adheridas.',
    categoria: 'servicios',
    costoCreditos: 120,
    patrocinador: 'Copec',
    vigenciaDias: 14,
    publicadoPorAdmin: true,
  },
  {
    id: 'redeem-evento',
    titulo: 'Entrada Fiesta Mechona',
    descripcion: 'Una entrada general para la fiesta de bienvenida del semestre.',
    categoria: 'eventos',
    costoCreditos: 150,
    stock: 10,
    vigenciaDias: 3,
    publicadoPorAdmin: true,
  },
  {
    id: 'redeem-polera',
    titulo: 'Polera Uturn edición limitada',
    descripcion: 'Merch oficial Uturn, retiro en punto de encuentro del campus.',
    categoria: 'merch',
    costoCreditos: 250,
    stock: 15,
    vigenciaDias: 30,
    publicadoPorAdmin: true,
  },
  {
    id: 'redeem-estacionamiento',
    titulo: 'Semana de estacionamiento preferente',
    descripcion: 'Estacionamiento reservado cerca del punto de encuentro por una semana.',
    categoria: 'servicios',
    costoCreditos: 100,
    vigenciaDias: 7,
    publicadoPorAdmin: true,
  },
];

// Historial inicial: créditos ganados con viajes pagados y rachas (Sesión 1), más recientes primero.
export const INITIAL_CREDIT_TRANSACTIONS: CreditTransaction[] = [
  {
    id: 'ctx-7',
    tipo: 'cargo',
    fuente: 'canje',
    monto: 80,
    descripcion: 'Canje: Café gratis en Cafetería Central',
    referenciaId: 'redemption-cafe',
    createdAt: daysFromNow(-1),
  },
  {
    id: 'ctx-6',
    tipo: 'abono',
    fuente: 'viaje',
    monto: 25,
    descripcion: 'Pago confirmado a tiempo',
    createdAt: daysFromNow(-1),
  },
  {
    id: 'ctx-5',
    tipo: 'abono',
    fuente: 'racha',
    monto: 50,
    descripcion: 'Racha de 3 pagos a tiempo',
    createdAt: daysFromNow(-2),
  },
  {
    id: 'ctx-4',
    tipo: 'abono',
    fuente: 'viaje',
    monto: 25,
    descripcion: 'Pago confirmado a tiempo',
    createdAt: daysFromNow(-2),
  },
  {
    id: 'ctx-3',
    tipo: 'abono',
    fuente: 'viaje',
    monto: 25,
    descripcion: 'Pago confirmado a tiempo',
    createdAt: daysFromNow(-4),
  },
  {
    id: 'ctx-2',
    tipo: 'cargo',
    fuente: 'canje',
    monto: 40,
    descripcion: 'Canje: Snack + bebida',
    referenciaId: 'redemption-snack',
    createdAt: daysFromNow(-9),
  },
  {
    id: 'ctx-1',
    tipo: 'abono',
    fuente: 'bono',
    monto: 100,
    descripcion: 'Bono de bienvenida Uturn',
    createdAt: daysFromNow(-12),
  },
];

export const INITIAL_REDEMPTIONS: Redemption[] = [
  {
    id: 'redemption-cafe',
    itemId: 'redeem-cafe',
    titulo: 'Café gratis en Cafetería Central',
    costoCreditos: 80,
    codigo: 'UT-K3M9-P2XA',
    createdAt: daysFromNow(-1),
    expiraAt: daysFromNow(6),
    canjeadoAt: hoursFromNow(-20),
    estado: 'canjeado',
  },
  {
    // Sigue 'disponible' en datos, pero su fecha ya pasó: se muestra como expirado
    id: 'redemption-snack',
    itemId: 'redeem-snack',
    titulo: 'Snack + bebida',
    costoCreditos: 40,
    codigo: 'UT-QF83-9WDZ',
    createdAt: daysFromNow(-9),
    expiraAt: daysFromNow(-4),
    estado: 'disponible',
  },
];

// Vista previa de la semana (mock tipado; la fuente real llega con el feed)
export const WEEKLY_HIGHLIGHTS: WeeklyHighlight[] = [
  {
    id: 'week-1',
    tipo: 'evento',
    titulo: 'Feria de clubes y deportes',
    descripcion: 'Conoce los clubes del campus y suma puntos por asistir.',
    fecha: daysFromNow(1),
    lugar: 'Patio central, Campus Peñalolén',
  },
  {
    id: 'week-2',
    tipo: 'activacion',
    titulo: 'Jueves de doble crédito',
    descripcion: 'Los viajes pagados a tiempo este jueves suman doble crédito.',
    fecha: daysFromNow(2),
  },
  {
    id: 'week-3',
    tipo: 'canjeable',
    titulo: 'Nuevo canje: Entrada Fiesta Mechona',
    descripcion: 'Cupos limitados en el catálogo de canjes.',
    fecha: daysFromNow(3),
    canjeableId: 'redeem-evento',
  },
  {
    id: 'week-4',
    tipo: 'evento',
    titulo: 'Copa Uturn interfacultades',
    descripcion: 'Final de babyfútbol entre campus. Hay premios en créditos.',
    fecha: daysFromNow(5),
    lugar: 'Gimnasio, Campus San Carlos de Apoquindo',
  },
];

export const INITIAL_SETTINGS: AppSettings = {
  notificaciones: {
    recordatoriosPago: true,
    mensajes: true,
    novedadesSemanales: true,
  },
  privacidad: {
    mostrarFotoPerfil: true,
    mostrarUniversidad: true,
    perfilVisibleEnViajes: true,
  },
};

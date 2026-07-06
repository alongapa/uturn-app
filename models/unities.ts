// Tipos de la Sesión 2: créditos Unities, canjes, vista semanal y configuración

// --- Créditos ---

export type CreditSource = 'viaje' | 'racha' | 'bono' | 'canje' | 'ajuste';

export type CreditTransaction = {
  id: string;
  tipo: 'abono' | 'cargo';
  fuente: CreditSource;
  monto: number; // siempre positivo; `tipo` define el signo
  descripcion: string;
  createdAt: string; // ISO
  referenciaId?: string; // bookingId, redemptionId, etc.
};

// --- Canjes ---

export type RedeemableCategory = 'comida' | 'merch' | 'eventos' | 'servicios';

// Catálogo publicado por admins (Sesión 4); por ahora datos mock tipados
export type RedeemableItem = {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: RedeemableCategory;
  costoCreditos: number;
  patrocinador?: string;
  stock?: number;
  vigenciaDias: number; // validez del código una vez canjeado
  publicadoPorAdmin: boolean;
};

export type RedemptionStatus = 'disponible' | 'canjeado' | 'expirado';

export type Redemption = {
  id: string;
  itemId: string;
  titulo: string;
  costoCreditos: number;
  codigo: string;
  createdAt: string;
  expiraAt: string;
  canjeadoAt?: string;
  // 'expirado' nunca se guarda: se deriva de expiraAt (ver getRedemptionStatus)
  estado: Exclude<RedemptionStatus, 'expirado'>;
};

// --- Vista previa semanal (mock; la fuente real llega con el feed) ---

export type WeeklyHighlightType = 'evento' | 'activacion' | 'canjeable';

export type WeeklyHighlight = {
  id: string;
  tipo: WeeklyHighlightType;
  titulo: string;
  descripcion: string;
  fecha: string; // ISO
  lugar?: string;
  canjeableId?: string;
};

// --- Configuración ---
// (Los datos bancarios del conductor usan BankDetails de models/types y viven
// en el perfil del usuario, como los dejó la Sesión 1.)

// Sesión 7: categorías alineadas con notification_prefs del servidor (las
// preferencias se respetan server-side antes de encolar cualquier push).
export type NotificationPrefs = {
  pagos: boolean;
  viajes: boolean;
  social: boolean;
  mensajes: boolean;
};

export type PrivacyPrefs = {
  mostrarFotoPerfil: boolean;
  mostrarUniversidad: boolean;
  perfilVisibleEnViajes: boolean;
};

export type AppSettings = {
  notificaciones: NotificationPrefs;
  privacidad: PrivacyPrefs;
};

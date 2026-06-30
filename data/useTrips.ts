import { useEffect, useState } from 'react';

import type { Trip } from '@/models/types';
import { useAppState } from '@/store/appState';
import { isSupabaseConfigured, listTrips } from '@/services/db';

/**
 * Fuente única de viajes para las pantallas.
 * - Si Supabase está configurado → trae los viajes del backend.
 * - Si no → usa los datos mock del store (la app sigue funcionando).
 *
 * Las pantallas no saben de dónde vienen los datos: solo llaman useTrips().
 */
export function useTrips(): { trips: Trip[]; loading: boolean; refresh: () => void } {
  const { state } = useAppState();
  const [remote, setRemote] = useState<Trip[] | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    setLoading(true);
    listTrips()
      .then((data) => { if (active) setRemote(data); })
      .catch(() => { if (active) setRemote(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [nonce]);

  const trips = isSupabaseConfigured && remote ? remote : state.trips;
  return { trips, loading, refresh: () => setNonce((n) => n + 1) };
}

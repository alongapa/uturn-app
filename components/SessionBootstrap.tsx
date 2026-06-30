import { useEffect } from 'react';

import { useUser } from '@/contexts/UserContext';
import { supabase } from '@/lib/supabase';
import { isSupabaseConfigured, getMyProfile } from '@/services/db';

/**
 * Al montar la app, si Supabase está configurado:
 *  - restaura la sesión existente y carga el perfil en UserContext, y
 *  - escucha cambios de auth (login/logout) para mantener el usuario sincronizado.
 *
 * Si Supabase NO está configurado, no hace nada (la app usa el flujo mock).
 * No renderiza UI.
 */
export function SessionBootstrap() {
  const { setUser, clearUser } = useUser();

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;

    async function loadProfile() {
      try {
        const profile = await getMyProfile();
        if (active && profile) setUser(profile);
      } catch {
        /* sin sesión: se queda en login */
      }
    }

    loadProfile();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearUser();
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        loadProfile();
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

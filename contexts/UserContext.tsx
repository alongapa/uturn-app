import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { User } from '@/models/types';
import { primeAnalyticsOptOut } from '@/services/api/analytics';
import * as authApi from '@/services/api/auth';
import { mapProfileToUser } from '@/services/api/mappers';
import {
  getMyBankDetails,
  getProfileRow,
  updateProfile,
  upsertMyBankDetails,
  type ProfilePatch,
} from '@/services/api/profiles';
import { unregisterCurrentDeviceToken } from '@/services/push';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import { STORAGE_KEYS, loadJSON, saveJSON } from '@/services/storage';

interface UserContextValue {
  user: User | null;
  /** true cuando ya se intentó restaurar la sesión (de Supabase o del caché). */
  isHydrated: boolean;
  /** true cuando hay sesión de Supabase activa. */
  isAuthenticated: boolean;
  setUser: (user: User) => void;
  updateUser: (updates: Partial<User>) => void;
  clearUser: () => void;
  // --- Auth por OTP / magic link ---
  signInWithOtp: (email: string, meta?: authApi.SignUpMeta) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

// Traduce el User del cliente a columnas de profiles para el write-through.
function userPatchToProfilePatch(updates: Partial<User>): ProfilePatch {
  const patch: ProfilePatch = {};
  if (updates.name !== undefined) patch.full_name = updates.name;
  if (updates.dateOfBirth !== undefined) patch.date_of_birth = updates.dateOfBirth;
  if (updates.travelMode !== undefined) patch.travel_mode = updates.travelMode;
  if (updates.universityId !== undefined) patch.university_id = updates.universityId ?? null;
  if (updates.homeCampusId !== undefined) patch.home_campus_id = updates.homeCampusId ?? null;
  if (updates.driverLicenseNumber !== undefined)
    patch.driver_license_number = updates.driverLicenseNumber ?? null;
  if (updates.driverLicenseExpiration !== undefined)
    patch.driver_license_expiration = updates.driverLicenseExpiration ?? null;
  return patch;
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Carga el profile de Supabase para una sesión y lo refleja en `user`.
  const loadProfile = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    if (!nextSession?.user) {
      primeAnalyticsOptOut(false);
      setUserState(null);
      return;
    }
    try {
      const row = await getProfileRow(nextSession.user.id);
      if (row) {
        // Evita una consulta aparte en services/api/analytics.ts: ya tenemos el flag.
        primeAnalyticsOptOut(row.analytics_opt_out);
        // Los datos bancarios viven en su propia tabla (RLS de solo-dueño).
        const bankDetails = await getMyBankDetails().catch(() => undefined);
        const mapped = mapProfileToUser(row, bankDetails);
        setUserState(mapped);
        saveJSON(STORAGE_KEYS.user, mapped); // caché offline
      } else {
        // El trigger aún no creó el profile; refleja lo mínimo de la sesión.
        setUserState((prev) =>
          prev ?? { id: nextSession.user.id, name: '', email: nextSession.user.email ?? '', travelMode: 'rider' }
        );
      }
    } catch {
      // Sin red: cae al caché si existe.
      const cached = await loadJSON<User>(STORAGE_KEYS.user);
      if (cached) setUserState(cached);
    }
  }, []);

  useEffect(() => {
    let active = true;

    // Modo sin Supabase (dev/offline): comportamiento local previo con caché.
    if (!isSupabaseConfigured) {
      loadJSON<User>(STORAGE_KEYS.user).then((cached) => {
        if (!active) return;
        if (cached) setUserState(cached);
        setIsHydrated(true);
      });
      return () => {
        active = false;
      };
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      await loadProfile(data.session);
      if (active) setIsHydrated(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      loadProfile(nextSession);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const setUser = useCallback((nextUser: User) => {
    setUserState(nextUser);
    saveJSON(STORAGE_KEYS.user, nextUser);
  }, []);

  const updateUser = useCallback(
    (updates: Partial<User>) => {
      setUserState((prev) => {
        const next = prev ? { ...prev, ...updates } : (updates as User);
        saveJSON(STORAGE_KEYS.user, next);
        return next;
      });
      // Write-through al profile (fire-and-forget) cuando hay sesión.
      if (isSupabaseConfigured && session?.user) {
        const patch = userPatchToProfilePatch(updates);
        if (Object.keys(patch).length > 0) {
          updateProfile(session.user.id, patch).catch((error) =>
            console.warn('No se pudo sincronizar el perfil', error)
          );
        }
        if (updates.bankDetails !== undefined) {
          upsertMyBankDetails(session.user.id, updates.bankDetails ?? null).catch((error) =>
            console.warn('No se pudieron sincronizar los datos bancarios', error)
          );
        }
      }
    },
    [session]
  );

  const clearUser = useCallback(() => {
    setUserState(null);
    saveJSON(STORAGE_KEYS.user, null);
    if (isSupabaseConfigured) {
      // El push token del dispositivo se da de baja ANTES de cerrar la sesión
      // (la RPC necesita auth.uid()): así este teléfono deja de recibir push
      // de la cuenta que sale.
      unregisterCurrentDeviceToken()
        .catch(() => undefined)
        .finally(() => {
          authApi.signOut().catch(() => undefined);
        });
    }
  }, []);

  const signInWithOtp = useCallback(
    (email: string, meta?: authApi.SignUpMeta) => authApi.signInWithOtp(email, meta),
    []
  );

  const verifyOtp = useCallback(async (email: string, token: string) => {
    const data = await authApi.verifyOtp(email, token);
    await loadProfile(data.session);
  }, [loadProfile]);

  const value = useMemo<UserContextValue>(
    () => ({
      user,
      isHydrated,
      isAuthenticated: Boolean(session?.user),
      setUser,
      updateUser,
      clearUser,
      signInWithOtp,
      verifyOtp,
    }),
    [user, isHydrated, session, setUser, updateUser, clearUser, signInWithOtp, verifyOtp]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser debe usarse dentro de UserProvider');
  }

  return context;
}

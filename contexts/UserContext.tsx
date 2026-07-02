import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { User } from '@/models/types';
import { STORAGE_KEYS, loadJSON, saveJSON } from '@/services/storage';

interface UserContextValue {
  user: User | null;
  /** true cuando ya se intentó restaurar la sesión desde AsyncStorage. */
  isHydrated: boolean;
  setUser: (user: User) => void;
  updateUser: (updates: Partial<User>) => void;
  clearUser: () => void;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadJSON<User>(STORAGE_KEYS.user).then((storedUser) => {
      if (cancelled) return;
      if (storedUser) {
        setUserState(storedUser);
      }
      setIsHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    saveJSON(STORAGE_KEYS.user, user);
  }, [user, isHydrated]);

  const setUser = (nextUser: User) => {
    setUserState(nextUser);
  };

  const updateUser = (updates: Partial<User>) => {
    setUserState((prev) => {
      if (!prev) {
        return updates as User;
      }

      return { ...prev, ...updates };
    });
  };

  const clearUser = () => setUserState(null);

  const value = useMemo<UserContextValue>(
    () => ({ user, isHydrated, setUser, updateUser, clearUser }),
    [user, isHydrated]
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

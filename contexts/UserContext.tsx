import React, { createContext, useContext, useMemo, useState } from 'react';

import type { User } from '@/models/types';

interface UserContextValue {
  user: User | null;
  setUser: (user: User) => void;
  updateUser: (updates: Partial<User>) => void;
  clearUser: () => void;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);

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
    () => ({ user, setUser, updateUser, clearUser }),
    [user]
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

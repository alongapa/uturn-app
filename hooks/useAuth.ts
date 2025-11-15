import React, { createContext, createElement, useContext, useMemo, useState } from 'react';

// Tipo básico de usuario que se almacenará en el contexto de autenticación
export type AuthUser = {
  name: string;
  email: string;
  role: 'driver' | 'passenger';
};

// Interfaz que expone el contexto a los componentes consumidores
interface AuthContextValue {
  user: AuthUser | null;
  login: (userData: AuthUser) => void;
  logout: () => void;
}

interface AuthProviderProps {
  children?: React.ReactNode;
}

// Contexto inicializado en null para detectar usos fuera del provider
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null); // Estado centralizado del usuario autenticado

  const login = (userData: AuthUser) => {
    setUser(userData); // Actualiza el estado con los datos entregados por la pantalla de login
  };

  const logout = () => {
    setUser(null); // Limpia el estado cuando el usuario cierra sesión
  };

  const value = useMemo(() => ({ user, login, logout }), [user]); // Memoriza el objeto para evitar renders innecesarios

  return createElement(AuthContext.Provider, { value }, children); // Renderiza el provider sin alterar estilos
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider'); // Ayuda a detectar un provider faltante
  }

  return context;
}

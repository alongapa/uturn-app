import { useMemo } from 'react';

import { useUser } from '@/contexts/UserContext';
import type { AccountRole } from '@/models/types';

// Jerarquía de roles de cuenta: cada rol incluye los permisos de los anteriores.
const ROLE_LEVEL: Record<AccountRole, number> = {
  user: 0,
  tutor: 1,
  admin: 2,
  owner: 3,
};

export function hasRoleAtLeast(role: AccountRole, minimum: AccountRole): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minimum];
}

export type Permissions = {
  role: AccountRole;
  isAtLeast: (minimum: AccountRole) => boolean;
  isTutor: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  /** Moderar contenido y reportes de la comunidad (tutor o superior). */
  canModerate: boolean;
  /** Verificar credenciales universitarias de otros usuarios (tutor o superior). */
  canVerifyUsers: boolean;
  /** Gestionar usuarios: bloquear, sancionar, editar perfiles (admin o superior). */
  canManageUsers: boolean;
  /** Asignar y quitar roles de cuenta a otros usuarios (admin o superior). */
  canAssignRoles: boolean;
  /** Configuración global de la plataforma y transferencia de propiedad (solo owner). */
  canManagePlatform: boolean;
};

export function buildPermissions(role: AccountRole): Permissions {
  const isAtLeast = (minimum: AccountRole) => hasRoleAtLeast(role, minimum);

  return {
    role,
    isAtLeast,
    isTutor: isAtLeast('tutor'),
    isAdmin: isAtLeast('admin'),
    isOwner: isAtLeast('owner'),
    canModerate: isAtLeast('tutor'),
    canVerifyUsers: isAtLeast('tutor'),
    canManageUsers: isAtLeast('admin'),
    canAssignRoles: isAtLeast('admin'),
    canManagePlatform: isAtLeast('owner'),
  };
}

/**
 * Permisos derivados del rol de cuenta del usuario autenticado.
 * Sin sesión (o sin rol asignado) se asume el rol base 'user'.
 */
export function usePermissions(): Permissions {
  const { user } = useUser();
  const role: AccountRole = user?.accountRole ?? 'user';

  return useMemo(() => buildPermissions(role), [role]);
}

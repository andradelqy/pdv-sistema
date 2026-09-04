// src/lib/rbac.ts
export type Role = 'owner' | 'gerente' | 'atendente' | 'entregador';

export const permissions = {
  owner: { canManageUsers: true, canAccessFinance: true, canAccessPDV: true, canAccessEntregas: true },
  gerente: { canManageUsers: false, canAccessFinance: true, canAccessPDV: true, canAccessEntregas: true },
  atendente: { canManageUsers: false, canAccessFinance: false, canAccessPDV: true, canAccessEntregas: false },
  entregador: { canManageUsers: false, canAccessFinance: false, canAccessPDV: false, canAccessEntregas: true }
};

export const hasPermission = (role: Role, action: keyof typeof permissions.owner) => {
  return permissions[role]?.[action] || false;
};

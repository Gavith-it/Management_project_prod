// Permissions matrix gates access to actions by role.
// This is the client-side validation boundary.

export const PERMISSIONS = {
  masters:            { admin: 'edit', inv_sup: 'view', operator: null,     viewer: 'view' },
  purchase:           { admin: 'edit', inv_sup: 'edit', operator: null,     viewer: 'view' },
  issue_material:     { admin: null,   inv_sup: 'edit', operator: null,     viewer: null },
  jobcard_create:     { admin: 'edit', inv_sup: null,   operator: 'view',   viewer: 'view' },
  complete_production:{ admin: null,   inv_sup: null,   operator: 'edit',   viewer: 'view' },
  raise_return:       { admin: null,   inv_sup: null,   operator: 'edit',   viewer: null },
  accept_return:      { admin: 'edit', inv_sup: 'edit', operator: null,     viewer: null },
  approve_tolerance:  { admin: 'edit', inv_sup: null,   operator: null,     viewer: null },
  reverse:            { admin: 'edit', inv_sup: null,   operator: null,     viewer: null },
  stocktake_count:    { admin: 'edit', inv_sup: 'edit', operator: null,     viewer: 'view' },
  stocktake_approve:  { admin: 'edit', inv_sup: null,   operator: null,     viewer: null },
  record_waste:       { admin: 'edit', inv_sup: 'edit', operator: null,     viewer: null },
  cost_visibility:    { admin: 'edit', inv_sup: 'edit', operator: 'never',  viewer: null }, // operator is blocked
  reports:            { admin: 'view', inv_sup: 'view', operator: null,     viewer: 'view' }
};

export function perm(action, role) {
  return (PERMISSIONS[action] || {})[role] || null;
}

export function canEdit(action, role) {
  return perm(action, role) === 'edit';
}

export function canSee(action, role) {
  const p = perm(action, role);
  return p === 'edit' || p === 'view';
}

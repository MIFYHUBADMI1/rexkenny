export type Role =
  | "super_admin"
  | "admin"
  | "editor"
  | "marketing_manager"
  | "analytics_viewer"
  | "fan";

export const ALL_ROLES: Role[] = [
  "super_admin",
  "admin",
  "editor",
  "marketing_manager",
  "analytics_viewer",
  "fan",
];

/** Anything that may enter /admin. A fan is never staff. */
export const STAFF_ROLES: Role[] = [
  "super_admin",
  "admin",
  "editor",
  "marketing_manager",
  "analytics_viewer",
];

/** May change catalogue and content. */
export const EDITOR_ROLES: Role[] = ["super_admin", "admin", "editor"];

/** May change settings, users, distribution and delete rows. */
export const ADMIN_ROLES: Role[] = ["super_admin", "admin"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ALL_ROLES as string[]).includes(value);
}

function intersects(roles: Role[], allowed: Role[]): boolean {
  return roles.some((r) => allowed.includes(r));
}

/**
 * Mirrors the SQL helpers in supabase/migrations/0001 exactly: has_role,
 * is_staff, can_edit_content, is_admin. Keeping both sides in one place means a
 * UI element and its policy cannot disagree — but the policies remain the
 * enforcement point, this is only presentation.
 */
export const roleChecks = (roles: Role[]) => ({
  hasRole: (role: Role) => roles.includes(role),
  isStaff: intersects(roles, STAFF_ROLES),
  canEditContent: intersects(roles, EDITOR_ROLES),
  isAdmin: intersects(roles, ADMIN_ROLES),
});

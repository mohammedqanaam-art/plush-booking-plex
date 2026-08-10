export type UserRole = "superadmin" | "admin" | "editor" | "viewer";
export type PermissionAction = "upload" | "manage_users" | "delete_users" | "edit_settings" | "view" | "manage_employees" | "manage_knowledge";

export type AdminSession = {
  username: string;
  role: UserRole;
};

const USER_ROLES: UserRole[] = ["superadmin", "admin", "editor", "viewer"];

export const getAdminSession = (): AdminSession | null => {
  if (typeof window === "undefined") return null;
  const stored = sessionStorage.getItem("admin_session");
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (
      typeof parsed?.username === "string"
      && parsed.username.trim()
      && USER_ROLES.includes(parsed.role)
    ) return { username: parsed.username.trim(), role: parsed.role };
  } catch {
    // invalid JSON
  }
  return null;
};

export const clearAdminSession = () => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("admin_session");
};

export const hasPermission = (role: UserRole, action: PermissionAction): boolean => {
  const permissions: Record<UserRole, PermissionAction[]> = {
    superadmin: ["upload", "manage_users", "delete_users", "edit_settings", "view", "manage_employees", "manage_knowledge"],
    admin: ["upload", "manage_users", "edit_settings", "view", "manage_employees", "manage_knowledge"],
    editor: ["upload", "view"],
    viewer: ["view"],
  };
  return permissions[role]?.includes(action) ?? false;
};

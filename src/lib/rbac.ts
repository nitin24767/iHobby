import type { Role } from "@/types/domain";

export type Permission =
  | "listing:read"
  | "listing:create"
  | "listing:update:own"
  | "bid:create"
  | "offer:create"
  | "message:create"
  | "watchlist:update"
  | "ai:use"
  | "buyer:dashboard"
  | "seller:apply"
  | "seller:dashboard"
  | "admin:dashboard"
  | "admin:moderate"
  | "admin:manage-users"
  | "admin:manage-settings"
  | "admin:manage-categories";

const permissions: Record<Role, Permission[]> = {
  VISITOR: ["listing:read"],
  BUYER: [
    "listing:read",
    "bid:create",
    "offer:create",
    "message:create",
    "watchlist:update",
    "ai:use",
    "buyer:dashboard",
    "seller:apply"
  ],
  SELLER: [
    "listing:read",
    "listing:create",
    "listing:update:own",
    "offer:create",
    "message:create",
    "watchlist:update",
    "ai:use",
    "seller:dashboard"
  ],
  ADMIN: [
    "listing:read",
    "listing:create",
    "listing:update:own",
    "bid:create",
    "offer:create",
    "message:create",
    "watchlist:update",
    "ai:use",
    "seller:dashboard",
    "admin:dashboard",
    "admin:moderate",
    "admin:manage-users",
    "admin:manage-settings",
    "admin:manage-categories"
  ]
};

export function can(role: Role, permission: Permission) {
  return permissions[role].includes(permission);
}

export function assertCan(role: Role, permission: Permission) {
  if (!can(role, permission)) {
    throw new Error(`Role ${role} is not allowed to perform ${permission}`);
  }
}

export function defaultDashboardFor(role: Role) {
  if (role === "ADMIN") return "/dashboard/admin";
  if (role === "SELLER") return "/dashboard/seller";
  if (role === "BUYER") return "/dashboard/buyer";
  return "/";
}

export function coerceRole(input: string | null | undefined): Role {
  if (input === "ADMIN" || input === "SELLER" || input === "BUYER" || input === "VISITOR") {
    return input;
  }
  return "BUYER";
}

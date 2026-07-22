import { useAuth } from "@/contexts/AuthContext";
import { ReactNode } from "react";

type AppRole = "admin" | "viewer" | "broker";

interface RequireRoleProps {
  role: AppRole;
  children: ReactNode;
  fallback?: ReactNode;
}

export function RequireRole({ role, children, fallback = null }: RequireRoleProps) {
  const { roles } = useAuth();

  if (!roles.includes(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

interface AdminOnlyProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function AdminOnly({ children, fallback }: AdminOnlyProps) {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

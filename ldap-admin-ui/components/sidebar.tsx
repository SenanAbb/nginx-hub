"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, FolderTree, LayoutDashboard, LogOut, Settings, Users } from "lucide-react";

import { cn } from "@/lib/utils";

type SidebarProps = {
  user?: string;
  email?: string;
  ldapHost?: string;
  ldapConnected?: boolean;
};

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Usuarios", href: "/users", icon: Users },
  { name: "Grupos", href: "/groups", icon: FolderTree },
  { name: "Configuración", href: "/settings", icon: Settings },
];

const getInitials = (value?: string) => {
  if (!value) return "U";
  return value
    .split(/\s|\./)
    .filter(Boolean)
    .map((chunk) => chunk[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
};

export function Sidebar({ user, email, ldapHost, ldapConnected }: SidebarProps) {
  const pathname = usePathname();
  const displayName = user ?? "Usuario";
  const displayEmail = email ?? "";
  const initials = getInitials(displayName || displayEmail);
  const connectionHost = ldapHost ?? "ldap";
  const connectionLabel = ldapConnected ? "LDAP conectado" : "LDAP sin conexión";

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center gap-3 border-b border-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          DL
        </div>
        <div>
          <span className="text-sm font-semibold text-foreground">ENO Data Lake</span>
          <p className="text-xs text-muted-foreground">Administración LDAP</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        <p className="mb-3 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Gestión
        </p>
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
          <Database className="h-4 w-4 text-primary" />
          <div className="flex-1">
            <p className="text-xs font-medium text-foreground">{connectionLabel}</p>
            <p className="text-xs text-muted-foreground">{connectionHost}</p>
          </div>
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              ldapConnected ? "bg-emerald-500" : "bg-red-500",
            )}
          />
        </div>
      </div>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{displayEmail || ""}</p>
          </div>
          <a
            href="/logout"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </a>
        </div>
      </div>
    </aside>
  );
}

import { headers } from "next/headers";
import {
  Activity,
  FolderTree,
  Shield,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SyncControls } from "@/components/admin/sync/sync-controls";
import { resolveAuthWithLdapFallback } from "@/lib/auth";
import { fetchGroups, fetchKpis, fetchUsers } from "@/lib/ldap";

export const dynamic = "force-dynamic";

const toUid = (dn: string) => {
  const first = dn.split(",")[0] ?? "";
  return first.replace(/^uid=/, "").trim();
};

export default async function DashboardPage() {
  const auth = await resolveAuthWithLdapFallback(await headers());
  const [users, groups, kpis] = await Promise.all([fetchUsers(), fetchGroups(), fetchKpis()]);
  const {
    totalUsers,
    totalGroups,
    usersWithoutGroups,
    usersWithGroups,
    emptyGroups,
    avgGroupsPerUser,
    coverage,
    uniqueMembers,
  } = kpis;
  const lastUpdated = new Date().toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const kpiCards = [
    {
      title: "Usuarios totales",
      value: totalUsers,
      description: "Usuarios registrados en LDAP",
      icon: Users,
    },
    {
      title: "Grupos totales",
      value: totalGroups,
      description: `${emptyGroups} grupos sin miembros`,
      icon: FolderTree,
    },
    {
      title: "Usuarios sin grupos",
      value: usersWithoutGroups,
      description: `Cobertura de grupos ${coverage}%`,
      icon: UserMinus,
    },
    {
      title: "Promedio grupos/usuario",
      value: avgGroupsPerUser.toString(),
      description: "Distribución actual",
      icon: TrendingUp,
    },
  ];

  const secondaryStats = [
    {
      title: "Usuarios con grupos",
      value: usersWithGroups,
      icon: UserPlus,
    },
    {
      title: "Miembros únicos",
      value: uniqueMembers,
      icon: Activity,
    },
    {
      title: "Grupos vacíos",
      value: emptyGroups,
      icon: Shield,
    },
  ];

  return (
    <div className="space-y-8 px-6 py-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Sesión activa: {auth.user ?? "desconocido"} · Grupo requerido: sp_admin
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary/5 text-primary">
            <Shield className="h-3 w-3" />
            LDAP conectado
          </Badge>
          <Badge variant="outline" className="gap-1.5">
            <Activity className="h-3 w-3" />
            Actualizado {lastUpdated}
          </Badge>
          {auth.isAuthorized ? <SyncControls /> : null}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.title} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <kpi.icon className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{kpi.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{kpi.description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {secondaryStats.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <stat.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.title}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Usuarios recientes</CardTitle>
            <CardDescription>Últimos usuarios registrados en LDAP</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {users.slice(0, 3).map((user) => (
                <div key={user.uid} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{user.uid}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.cn || user.givenName || "Sin nombre"}
                    </p>
                  </div>
                  <Badge variant="secondary">{user.mail || "Sin email"}</Badge>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <a
                href="/users"
                className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
              >
                Ver más usuarios
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </a>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Grupos activos</CardTitle>
            <CardDescription>Grupos con más miembros</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {groups
                .sort((a, b) => b.members.length - a.members.length)
                .slice(0, 3)
                .map((group) => (
                  <div key={group.cn} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{group.cn}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.members.length} miembro{group.members.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <Badge>{group.members.length}</Badge>
                  </div>
                ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <a
                href="/groups"
                className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
              >
                Ver más grupos
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </a>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

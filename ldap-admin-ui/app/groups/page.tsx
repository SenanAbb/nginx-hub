"use client"

import { useEffect, useMemo, useState } from "react"
import { Header } from "@/components/admin/header"
import { GroupCard } from "@/components/admin/groups/group-card"
import { Button } from "@/components/ui/button"
import { LayoutGrid, List } from "lucide-react"
import type { LDAPGroup, LDAPUser } from "@/lib/types"
import { cn } from "@/lib/utils"

type UsersApiUser = {
  dn: string
  uid: string
  cn?: string
  givenName?: string
  sn?: string
  mail?: string
}

type GroupsApiGroup = {
  dn: string
  cn: string
  description?: string
  members: string[]
}

export default function GroupsPage() {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<LDAPUser[]>([])
  const [groups, setGroups] = useState<LDAPGroup[]>([])
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [serviceFilter, setServiceFilter] = useState<"all" | "ambari" | "ranger" | "other">("all")

  const groupService = (cnValue: string): "ambari" | "ranger" | "other" => {
    const cn = (cnValue || "").toLowerCase()
    if (cn.startsWith("ambari_")) return "ambari"
    if (cn.startsWith("ranger_")) return "ranger"
    return "other"
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersRes, groupsRes] = await Promise.all([fetch("/api/users"), fetch("/api/ldap/groups")])
      const usersJson = await usersRes.json()
      const groupsJson = await groupsRes.json()

      const apiUsers: UsersApiUser[] = usersJson.users || []
      const apiGroups: GroupsApiGroup[] = groupsJson.groups || []

      const mappedUsers: LDAPUser[] = apiUsers.map((u) => ({
        dn: u.dn,
        uid: u.uid,
        cn: u.cn || u.uid,
        sn: u.sn || "",
        givenName: u.givenName || "",
        mail: u.mail,
        memberOf: [],
        enabled: true,
        createdAt: undefined,
        lastLogin: undefined,
      }))

      const mappedGroups: LDAPGroup[] = apiGroups.map((g) => ({
        dn: g.dn,
        cn: g.cn,
        description: g.description,
        members: g.members,
        createdAt: undefined,
      }))

      setUsers(mappedUsers)
      setGroups(mappedGroups)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const layoutClassName = useMemo(() => {
    return cn(
      "gap-4",
      viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col",
    )
  }, [viewMode])

  const filteredGroups = useMemo(() => {
    if (serviceFilter === "all") return groups
    return groups.filter((g) => groupService(g.cn) === serviceFilter)
  }, [groups, serviceFilter])

  if (loading) {
    return <div className="flex-1 overflow-auto p-6">Cargando...</div>
  }

  return (
    <>
      <Header title="Gestión de Grupos" description="Administra los grupos y permisos del directorio LDAP">
        <div className="flex items-center gap-2">
          <Button
            variant={serviceFilter === "all" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setServiceFilter("all")}
          >
            Todos
          </Button>
          <Button
            variant={serviceFilter === "ambari" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setServiceFilter("ambari")}
          >
            Ambari
          </Button>
          <Button
            variant={serviceFilter === "ranger" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setServiceFilter("ranger")}
          >
            Ranger
          </Button>
          <Button
            variant={serviceFilter === "other" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setServiceFilter("other")}
          >
            Otros
          </Button>
        </div>
        <div className="flex items-center rounded-lg border border-border p-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 w-7 p-0", viewMode === "grid" && "bg-secondary")}
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="sr-only">Vista de cuadrícula</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 w-7 p-0", viewMode === "list" && "bg-secondary")}
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
            <span className="sr-only">Vista de lista</span>
          </Button>
        </div>
      </Header>

      <div className="flex-1 overflow-auto p-6">
        <div className={layoutClassName}>
          {filteredGroups.map((group) => (
            <GroupCard
              key={group.cn}
              group={group}
              users={users}
              viewMode={viewMode}
            />
          ))}
        </div>
      </div>
    </>
  )
}

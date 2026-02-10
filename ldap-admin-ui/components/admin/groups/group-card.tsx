"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Users, Calendar } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { LDAPGroup, LDAPUser } from "@/lib/types"
import { cn } from "@/lib/utils"

interface GroupCardProps {
  group: LDAPGroup
  users: LDAPUser[]
  viewMode: "grid" | "list"
}

export function GroupCard({ group, users, viewMode }: GroupCardProps) {
  const groupMembers = users.filter((user) => group.members.includes(user.dn))
  const memberLabel = (member: LDAPUser) => {
    const first = (member.givenName || "").trim()
    const last = (member.sn || "").trim()
    const fullName = [first, last].filter(Boolean).join(" ")
    return fullName ? `${member.uid} (${fullName})` : member.uid
  }

  const service = (() => {
    const cnValue = (group.cn || "").toLowerCase()
    if (cnValue.startsWith("ambari_")) return "Ambari"
    if (cnValue.startsWith("ranger_")) return "Ranger"
    return "Otros"
  })()

  if (viewMode === "list") {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{group.cn}</h3>
            <p className="text-sm text-muted-foreground">{group.description || "Sin descripción"}</p>
            <div className="mt-2">
              <Badge variant="secondary">{service}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end gap-2">
            <div className="flex -space-x-2">
              {groupMembers.slice(0, 4).map((member) => (
                <Avatar key={member.uid} className="h-8 w-8 border-2 border-card" title={memberLabel(member)}>
                  <AvatarFallback className="bg-primary/10 text-xs text-primary">
                    {member.givenName?.[0] ?? member.uid?.[0] ?? ""}
                    {member.sn?.[0] ?? ""}
                  </AvatarFallback>
                </Avatar>
              ))}
              {groupMembers.length > 4 && (
                <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-secondary text-xs font-medium">
                  +{groupMembers.length - 4}
                </div>
              )}
            </div>
            <div className="text-right">
              <span className="text-sm text-muted-foreground">{groupMembers.length} miembro(s)</span>
              {groupMembers.length > 0 && (
                <div className="mt-1 max-w-[360px] text-xs text-muted-foreground">
                  {groupMembers
                    .slice(0, 3)
                    .map((m) => memberLabel(m))
                    .join(", ")}
                  {groupMembers.length > 3 ? `, +${groupMembers.length - 3}` : ""}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Card className={cn("transition-colors hover:border-primary/50")}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <Badge variant="secondary">{service}</Badge>
        </div>
        <CardTitle className="text-base">{group.cn}</CardTitle>
        <CardDescription className="line-clamp-2">{group.description || "Sin descripción"}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex -space-x-2">
            {groupMembers.slice(0, 4).map((member) => (
              <Avatar key={member.uid} className="h-8 w-8 border-2 border-card" title={memberLabel(member)}>
                <AvatarFallback className="bg-primary/10 text-xs text-primary">
                  {member.givenName?.[0] ?? member.uid?.[0] ?? ""}
                  {member.sn?.[0] ?? ""}
                </AvatarFallback>
              </Avatar>
            ))}
            {groupMembers.length > 4 && (
              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-secondary text-xs font-medium">
                +{groupMembers.length - 4}
              </div>
            )}
          </div>
          <span className="text-sm text-muted-foreground">{groupMembers.length} miembro(s)</span>
        </div>
        {groupMembers.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            {groupMembers
              .slice(0, 3)
              .map((m) => memberLabel(m))
              .join(", ")}
            {groupMembers.length > 3 ? `, +${groupMembers.length - 3}` : ""}
          </div>
        )}
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>Creado el {group.createdAt || "—"}</span>
        </div>
      </CardContent>
    </Card>
  )
}

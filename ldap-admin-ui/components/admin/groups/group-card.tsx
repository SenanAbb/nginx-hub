"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Users, Mail } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { LDAPGroup, LDAPUser } from "@/lib/types"
import { cn } from "@/lib/utils"

interface GroupCardProps {
  group: LDAPGroup
  users: LDAPUser[]
  viewMode: "grid" | "list"
}

export function GroupCard({ group, users, viewMode }: GroupCardProps) {
  const groupMembers = users.filter((user) => group.members.includes(user.dn))

  const getInitials = (user: LDAPUser) => {
    const g = user.givenName?.trim()?.[0] ?? user.uid?.[0] ?? "U"
    const s = user.sn?.trim()?.[0] ?? ""
    return (g + s).toUpperCase().slice(0, 2)
  }

  const service = (() => {
    const cnValue = (group.cn || "").toLowerCase()
    if (cnValue.startsWith("ambari_")) return "Ambari"
    if (cnValue.startsWith("ranger_")) return "Ranger"
    if (cnValue.startsWith("hue") || cnValue.startsWith("hue_")) return "Hue"
    return "Otros"
  })()

  if (viewMode === "list") {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50">
        <div className="flex items-start justify-between gap-4">
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

          <div className="text-right">
            <span className="text-sm text-muted-foreground">{groupMembers.length} miembro(s)</span>
          </div>
        </div>

        {groupMembers.length > 0 ? (
          <ScrollArea className="h-32 rounded-md border border-border bg-muted/30 p-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {groupMembers
                .slice()
                .sort((a, b) => a.uid.localeCompare(b.uid))
                .map((m) => (
                  <div key={m.uid} className="flex items-center gap-2 rounded-md bg-white p-2 border border-border/50 shadow-sm">
                    <Avatar className="h-8 w-8 border border-border">
                      <AvatarFallback className="bg-primary/5 text-[10px] text-primary font-medium">
                        {getInitials(m)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate text-xs font-medium text-foreground" title={m.uid}>
                        {m.givenName && m.sn ? `${m.givenName} ${m.sn}` : m.uid}
                      </p>
                      {m.mail && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground" title={m.mail}>
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{m.mail}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </ScrollArea>
        ) : (
          <p className="text-sm text-muted-foreground">Sin miembros</p>
        )}
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
          <span className="text-sm text-muted-foreground">{groupMembers.length} miembro(s)</span>
        </div>

        {groupMembers.length > 0 ? (
          <ScrollArea className="mt-3 h-48 rounded-md border border-border bg-muted/30 p-2">
            <div className="grid grid-cols-1 gap-2">
              {groupMembers
                .slice()
                .sort((a, b) => a.uid.localeCompare(b.uid))
                .map((m) => (
                  <div key={m.uid} className="flex items-center gap-3 rounded-md bg-white p-2 border border-border/50 shadow-sm transition-colors hover:border-primary/20">
                    <Avatar className="h-8 w-8 border border-border">
                      <AvatarFallback className="bg-primary/5 text-[10px] text-primary font-medium">
                        {getInitials(m)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground" title={m.uid}>
                          {m.givenName && m.sn ? `${m.givenName} ${m.sn}` : m.uid}
                        </p>
                        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1 rounded">{m.uid}</span>
                      </div>
                      {m.mail && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5" title={m.mail}>
                          <Mail className="h-3 w-3" />
                          <span className="truncate">{m.mail}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </ScrollArea>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Sin miembros</p>
        )}
      </CardContent>
    </Card>
  )
}

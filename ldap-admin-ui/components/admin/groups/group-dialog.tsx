"use client"

import React from "react"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { X, Search } from "lucide-react"
import type { LDAPGroup, LDAPUser } from "@/lib/types"

interface GroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: LDAPGroup | null
  users: LDAPUser[]
  onSave: (group: LDAPGroup) => void
}

export function GroupDialog({ open, onOpenChange, group, users, onSave }: GroupDialogProps) {
  const [formData, setFormData] = useState<Partial<LDAPGroup>>({
    cn: "",
    description: "",
    members: [],
  })
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    if (group) {
      setFormData(group)
    } else {
      setFormData({
        cn: "",
        description: "",
        members: [],
      })
    }
    setSearchQuery("")
  }, [group, open])

  const handleInputChange = (field: keyof LDAPGroup, value: string | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleMemberToggle = (userDn: string, checked: boolean) => {
    const currentMembers = formData.members || []
    if (checked) {
      handleInputChange("members", [...currentMembers, userDn])
    } else {
      handleInputChange("members", currentMembers.filter((m) => m !== userDn))
    }
  }

  const handleRemoveMember = (userDn: string) => {
    const currentMembers = formData.members || []
    handleInputChange("members", currentMembers.filter((m) => m !== userDn))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const newGroup: LDAPGroup = {
      dn: group?.dn || `cn=${formData.cn},ou=groups,dc=larioja,dc=org`,
      cn: formData.cn || "",
      description: formData.description,
      members: formData.members || [],
      createdAt: group?.createdAt || new Date().toISOString().split("T")[0],
    }
    onSave(newGroup)
  }

  const getUserByDn = (userDn: string) => {
    return users.find((u) => u.dn === userDn)
  }

  const filteredUsers = users.filter((user) => {
    const q = searchQuery.toLowerCase()
    return (
      user.cn.toLowerCase().includes(q) ||
      (user.mail || "").toLowerCase().includes(q) ||
      user.uid.toLowerCase().includes(q)
    )
  })

  const selectedMembers = (formData.members || [])
    .map((dn) => getUserByDn(dn))
    .filter((u): u is LDAPUser => u !== undefined)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-white">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{group ? "Editar Grupo" : "Nuevo Grupo"}</DialogTitle>
            <DialogDescription>
              {group
                ? "Modifica los datos del grupo en el directorio LDAP."
                : "Crea un nuevo grupo en el directorio LDAP."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cn">Nombre del Grupo</Label>
              <Input
                id="cn"
                value={formData.cn || ""}
                onChange={(e) => handleInputChange("cn", e.target.value)}
                placeholder="developers"
                required
                disabled={!!group}
                className="bg-white shadow-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={formData.description || ""}
                onChange={(e) => handleInputChange("description", e.target.value)}
                placeholder="Descripción del grupo y sus permisos..."
                rows={3}
                className="bg-white shadow-sm"
              />
            </div>

            <div className="space-y-2">
              <Label>Miembros del grupo ({selectedMembers.length})</Label>
              <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-white p-3 min-h-[60px]">
                {selectedMembers.length > 0 ? (
                  selectedMembers.map((member) => (
                    <Badge key={member.dn} variant="outline" className="gap-1 pr-1">
                      {member.cn}
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member.dn)}
                        className="ml-1 rounded-full p-0.5 hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                        <span className="sr-only">Eliminar miembro</span>
                      </button>
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No hay miembros asignados</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Añadir miembros</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Buscar usuarios..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-white shadow-sm"
                />
              </div>
              <ScrollArea className="h-[200px] rounded-lg border border-border bg-white">
                <div className="p-3 space-y-2">
                  {filteredUsers.map((user) => {
                    const isSelected = formData.members?.includes(user.dn)
                    return (
                      <div
                        key={user.dn}
                        className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted"
                      >
                        <Checkbox
                          id={user.dn}
                          checked={isSelected}
                          onCheckedChange={(checked: boolean | "indeterminate") =>
                            handleMemberToggle(user.dn, checked === true)
                          }
                        />
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-xs text-primary">
                            {user.givenName?.[0] ?? ""}
                            {user.sn?.[0] ?? ""}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <label htmlFor={user.dn} className="cursor-pointer font-medium text-foreground">
                            {user.cn}
                          </label>
                          <p className="text-sm text-muted-foreground">{user.mail || "—"}</p>
                        </div>
                      </div>
                    )
                  })}
                  {filteredUsers.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">No se encontraron usuarios</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">{group ? "Guardar Cambios" : "Crear Grupo"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

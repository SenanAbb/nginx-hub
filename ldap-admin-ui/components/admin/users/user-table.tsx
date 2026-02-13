"use client"

import { useMemo, useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import type { LDAPUser, LDAPGroup } from "@/lib/types"

interface UserTableProps {
  users: LDAPUser[]
  groups: LDAPGroup[]
  onEdit: (user: LDAPUser) => void
  onDelete: (user: LDAPUser) => void
}

const initialsFromUser = (user: LDAPUser) => {
  const g = user.givenName?.trim()?.[0] ?? user.cn?.trim()?.[0] ?? user.uid?.trim()?.[0] ?? "U"
  const s = user.sn?.trim()?.[0] ?? user.cn?.split(" ")?.[1]?.[0] ?? ""
  return `${g}${s}`.toUpperCase()
}

const displayNameFromUser = (user: LDAPUser) => {
  const given = (user.givenName ?? "").trim()
  const sn = (user.sn ?? "").trim()
  const full = `${given} ${sn}`.trim()
  return full || user.cn || user.uid
}

const secondaryLineFromUser = (user: LDAPUser) => {
  const mail = (user.mail ?? "").trim()
  if (user.dni) {
    return mail ? `DNI: ${user.dni} · ${mail}` : `DNI: ${user.dni}`
  }
  return mail || "—"
}

export function UserTable({ users, groups, onEdit, onDelete }: UserTableProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<LDAPUser | null>(null)

  const groupService = (cnValue: string): "ambari" | "ranger" | "hue" | "other" => {
    const cn = (cnValue || "").toLowerCase()
    if (cn.startsWith("ambari_")) return "ambari"
    if (cn.startsWith("ranger_")) return "ranger"
    if (cn.startsWith("hue") || cn.startsWith("hue_")) return "hue"
    return "other"
  }

  const serviceLabel: Record<ReturnType<typeof groupService>, string> = {
    ambari: "Ambari",
    ranger: "Ranger",
    hue: "Hue",
    other: "Otros",
  }

  const groupByDn = useMemo(() => {
    const map = new Map<string, LDAPGroup>()
    for (const g of groups) map.set(g.dn, g)
    return map
  }, [groups])

  const getGroupName = (groupDn: string) => {
    const group = groupByDn.get(groupDn)
    return group?.cn || groupDn.split(",")[0].replace("cn=", "")
  }

  const getGroupService = (groupDn: string) => {
    const group = groupByDn.get(groupDn)
    const cn = group?.cn || groupDn.split(",")[0].replace("cn=", "")
    return groupService(cn)
  }

  const handleDeleteClick = (user: LDAPUser) => {
    setUserToDelete(user)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (userToDelete) {
      onDelete(userToDelete)
    }
    setDeleteDialogOpen(false)
    setUserToDelete(null)
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">Usuario</TableHead>
              <TableHead>Grupos</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.uid}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {initialsFromUser(user)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{displayNameFromUser(user)}</p>
                      <p className="text-sm text-muted-foreground">
                        {secondaryLineFromUser(user)}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {(user.memberOf ?? []).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {([
                        "ambari",
                        "ranger",
                        "hue",
                        "other",
                      ] as const).map((svc) => {
                        const dns = (user.memberOf ?? []).filter((dn) => getGroupService(dn) === svc)
                        if (dns.length === 0) return null
                        return (
                          <Dialog key={svc}>
                            <DialogTrigger asChild>
                              <Badge 
                                variant="secondary" 
                                className="cursor-pointer hover:bg-secondary/80"
                              >
                                {serviceLabel[svc]} ({dns.length})
                              </Badge>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Grupos de {serviceLabel[svc]}</DialogTitle>
                              </DialogHeader>
                              <div className="mt-4 max-h-[60vh] overflow-y-auto">
                                <div className="grid gap-2">
                                  {dns
                                    .sort((a, b) => getGroupName(a).localeCompare(getGroupName(b)))
                                    .map((groupDn) => (
                                      <div 
                                        key={groupDn} 
                                        className="flex items-center justify-between rounded-md border p-2"
                                      >
                                        <span className="text-sm font-medium">
                                          {getGroupName(groupDn)}
                                        </span>
                                      </div>
                                    ))
                                  }
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )
                      })}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Abrir menú</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(user)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDeleteClick(user)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente al usuario{" "}
              <span className="font-semibold">{userToDelete?.cn || userToDelete?.uid}</span> del
              directorio LDAP. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

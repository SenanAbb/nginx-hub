"use client";

import React from "react";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X } from "lucide-react";
import type { LDAPUser, LDAPGroup } from "@/lib/types";

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: LDAPUser | null;
  groups: LDAPGroup[];
  onSave: (input: { user: LDAPUser; password?: string }) => void;
}

export function UserDialog({
  open,
  onOpenChange,
  user,
  groups,
  onSave,
}: UserDialogProps) {
  const [password, setPassword] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [formData, setFormData] = useState<Partial<LDAPUser>>({
    uid: "",
    cn: "",
    sn: "",
    givenName: "",
    mail: "",
    memberOf: [],
    enabled: true,
  });

  useEffect(() => {
    if (user) {
      const fallbackCn = (user.cn ?? "").trim();
      const hasGivenName = !!(user.givenName ?? "").trim();
      const hasSn = !!(user.sn ?? "").trim();

      if (!hasGivenName && fallbackCn) {
        const parts = fallbackCn.split(/\s+/).filter(Boolean);
        const derivedGivenName = parts[0] ?? fallbackCn;
        const derivedSn = parts.slice(1).join(" ");

        setFormData({
          ...user,
          givenName: derivedGivenName,
          sn: hasSn ? user.sn : derivedSn,
        });
      } else {
        setFormData(user);
      }
    } else {
      setFormData({
        uid: "",
        cn: "",
        sn: "",
        givenName: "",
        mail: "",
        memberOf: [],
        enabled: true,
      });
    }
    setPassword("");
    setGroupSearch("");
  }, [user, open]);

  const groupService = (cnValue: string): "ambari" | "ranger" | "hue" | "other" => {
    const cn = (cnValue || "").toLowerCase();
    if (cn.startsWith("ambari_")) return "ambari";
    if (cn.startsWith("ranger_")) return "ranger";
    if (cn.startsWith("hue") || cn.startsWith("hue_")) return "hue";
    return "other";
  };

  const serviceLabel: Record<ReturnType<typeof groupService>, string> = {
    ambari: "Ambari",
    ranger: "Ranger",
    hue: "Hue",
    other: "Otros",
  };

  const serviceOrder: Array<ReturnType<typeof groupService>> = ["ambari", "ranger", "hue", "other"];

  const groupByDn = useMemo(() => {
    const map = new Map<string, LDAPGroup>();
    for (const g of groups) map.set(g.dn, g);
    return map;
  }, [groups]);

  const getGroupService = (groupDn: string) => {
    const group = groupByDn.get(groupDn);
    const cn = group?.cn || groupDn.split(",")[0].replace("cn=", "");
    return groupService(cn);
  };

  const handleInputChange = (
    field: keyof LDAPUser,
    value: string | boolean | string[],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNameChange = (givenName: string, sn: string) => {
    const cn = `${givenName} ${sn}`.trim();
    setFormData((prev) => ({ ...prev, givenName, sn, cn }));
  };

  const handleGroupToggle = (groupDn: string, checked: boolean) => {
    const currentGroups = formData.memberOf || [];
    if (checked) {
      handleInputChange("memberOf", [...currentGroups, groupDn]);
    } else {
      handleInputChange(
        "memberOf",
        currentGroups.filter((g) => g !== groupDn),
      );
    }
  };

  const handleRemoveGroup = (groupDn: string) => {
    const currentGroups = formData.memberOf || [];
    handleInputChange(
      "memberOf",
      currentGroups.filter((g) => g !== groupDn),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newUser: LDAPUser = {
      dn: user?.dn || `uid=${formData.uid},ou=people,dc=larioja,dc=org`,
      uid: formData.uid || "",
      cn: formData.cn || "",
      sn: formData.sn || "",
      givenName: formData.givenName || "",
      mail: formData.mail || undefined,
      memberOf: (formData.memberOf || []) as string[],
      enabled: true,
      createdAt: user?.createdAt,
      lastLogin: user?.lastLogin,
    };

    onSave({ user: newUser, password: password || undefined });
  };

  const getGroupName = (groupDn: string) => {
    const group = groupByDn.get(groupDn);
    return group?.cn || groupDn.split(",")[0].replace("cn=", "");
  };

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      const cn = (g.cn || "").toLowerCase();
      const desc = (g.description || "").toLowerCase();
      return cn.includes(q) || desc.includes(q);
    });
  }, [groups, groupSearch]);

  const filteredGroupsByService = useMemo(() => {
    const out: Record<ReturnType<typeof groupService>, LDAPGroup[]> = {
      ambari: [],
      ranger: [],
      hue: [],
      other: [],
    };
    for (const g of filteredGroups) {
      out[groupService(g.cn)].push(g);
    }
    for (const k of Object.keys(out) as Array<keyof typeof out>) {
      out[k].sort((a, b) => a.cn.localeCompare(b.cn));
    }
    return out;
  }, [filteredGroups]);

  const assignedDnsByService = useMemo(() => {
    const out: Record<ReturnType<typeof groupService>, string[]> = {
      ambari: [],
      ranger: [],
      hue: [],
      other: [],
    };
    for (const dn of (formData.memberOf || []) as string[]) {
      out[getGroupService(dn)].push(dn);
    }
    for (const k of Object.keys(out) as Array<keyof typeof out>) {
      out[k].sort((a, b) => getGroupName(a).localeCompare(getGroupName(b)));
    }
    return out;
  }, [formData.memberOf, groupByDn]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl bg-white">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {user ? "Editar Usuario" : "Nuevo Usuario"}
            </DialogTitle>
            <DialogDescription>
              {user
                ? "Modifica los datos del usuario en el directorio LDAP."
                : "Añade un nuevo usuario al directorio LDAP."}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="general" className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="general">Información General</TabsTrigger>
              <TabsTrigger value="groups">Grupos</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="givenName">Nombre</Label>
                  <Input
                    id="givenName"
                    value={formData.givenName || ""}
                    onChange={(e) =>
                      handleNameChange(e.target.value, formData.sn || "")
                    }
                    placeholder="Juan"
                    required
                    className="bg-white shadow-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sn">Apellidos</Label>
                  <Input
                    id="sn"
                    value={formData.sn || ""}
                    onChange={(e) =>
                      handleNameChange(formData.givenName || "", e.target.value)
                    }
                    placeholder="García López"
                    required
                    className="bg-white shadow-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="uid">ID de Usuario</Label>
                  <Input
                    id="uid"
                    value={formData.uid || ""}
                    onChange={(e) => handleInputChange("uid", e.target.value)}
                    placeholder="jgarcia"
                    required
                    disabled={!!user}
                    className="bg-white shadow-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mail">Correo Electrónico</Label>
                  <Input
                    id="mail"
                    type="email"
                    value={formData.mail || ""}
                    onChange={(e) => handleInputChange("mail", e.target.value)}
                    placeholder="jgarcia@larioja.org"
                    className="bg-white shadow-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password">
                    {user ? "Nueva contraseña" : "Contraseña"}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={user ? "(opcional)" : "(requerida)"}
                    required={!user}
                    className="bg-white shadow-sm"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="groups" className="mt-4 space-y-4">
            <div className="flex h-[500px] min-h-0 gap-4">
              {/* Left Column: Available Groups */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 rounded-lg border bg-muted/30 p-3 overflow-hidden">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold text-foreground">Disponibles</Label>
                  <span className="text-xs text-muted-foreground">
                    {filteredGroups.filter(g => !formData.memberOf?.includes(g.dn)).length} grupos
                  </span>
                </div>
                <Input
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="h-8 bg-white"
                />
                <ScrollArea className="min-h-0 flex-1 rounded-md border bg-white">
                  <div className="p-2 space-y-4">
                    {serviceOrder.map((svc) => {
                      const svcGroups = filteredGroupsByService[svc].filter(
                        (g) => !formData.memberOf?.includes(g.dn)
                      );
                      if (svcGroups.length === 0) return null;
                      
                      return (
                        <div key={svc}>
                          <div className="sticky top-0 z-10 bg-white pb-2 pt-1">
                            <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                              {serviceLabel[svc]}
                            </h4>
                          </div>
                          <div className="grid gap-2">
                            {svcGroups.map((group) => (
                              <div
                                key={group.dn}
                                className="flex cursor-pointer items-center justify-between rounded-md border p-2 hover:bg-accent hover:text-accent-foreground group"
                                onClick={() => handleGroupToggle(group.dn, true)}
                              >
                                <div className="overflow-hidden">
                                  <p className="truncate text-sm font-medium">{group.cn}</p>
                                  {group.description && (
                                    <p className="truncate text-xs text-muted-foreground">{group.description}</p>
                                  )}
                                </div>
                                <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                                  <span className="text-lg">+</span>
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* Right Column: Assigned Groups */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 rounded-lg border bg-muted/30 p-3 overflow-hidden">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold text-foreground">Asignados</Label>
                  <span className="text-xs text-muted-foreground">
                    {formData.memberOf?.length || 0} grupos
                  </span>
                </div>
                
                <ScrollArea className="min-h-0 flex-1 rounded-md border bg-white">
                  <div className="p-2 space-y-4">
                    {formData.memberOf && formData.memberOf.length > 0 ? (
                      serviceOrder.map((svc) => {
                        const dns = assignedDnsByService[svc];
                        if (dns.length === 0) return null;

                        return (
                          <div key={svc}>
                            <div className="sticky top-0 z-10 bg-white pb-2 pt-1">
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                                {serviceLabel[svc]}
                              </h4>
                            </div>
                            <div className="grid gap-2">
                              {dns.map((groupDn) => (
                                <div
                                  key={groupDn}
                                  className="flex items-center justify-between rounded-md border p-2 bg-secondary/20"
                                >
                                  <span className="truncate text-sm font-medium">
                                    {getGroupName(groupDn)}
                                  </span>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleRemoveGroup(groupDn)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center p-4 text-center text-sm text-muted-foreground opacity-50">
                        <p>No hay grupos seleccionados</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">
              {user ? "Guardar Cambios" : "Crear Usuario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

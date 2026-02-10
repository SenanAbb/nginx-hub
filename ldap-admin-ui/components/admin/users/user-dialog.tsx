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
  }, [user, open]);

  const groupByDn = useMemo(() => {
    const map = new Map<string, LDAPGroup>();
    for (const g of groups) map.set(g.dn, g);
    return map;
  }, [groups]);

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
              <div className="space-y-2">
                <Label>Grupos asignados</Label>
                <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-white p-3 min-h-[60px]">
                  {formData.memberOf && formData.memberOf.length > 0 ? (
                    formData.memberOf.map((groupDn) => (
                      <Badge
                        key={groupDn}
                        variant="outline"
                        className="gap-1 pr-1"
                      >
                        {getGroupName(groupDn)}
                        <button
                          type="button"
                          onClick={() => handleRemoveGroup(groupDn)}
                          className="ml-1 rounded-full p-0.5 hover:bg-muted"
                        >
                          <X className="h-3 w-3" />
                          <span className="sr-only">Eliminar grupo</span>
                        </button>
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No hay grupos asignados
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Grupos disponibles</Label>
                <ScrollArea className="h-[280px] rounded-lg border border-border bg-white">
                  <div className="p-3 space-y-2">
                    {groups.map((group) => {
                      const isSelected = formData.memberOf?.includes(group.dn);
                      return (
                        <div
                          key={group.dn}
                          className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted"
                        >
                          <Checkbox
                            id={group.dn}
                            checked={isSelected}
                            onCheckedChange={(checked: any) =>
                              handleGroupToggle(group.dn, checked as boolean)
                            }
                          />
                          <div className="flex-1">
                            <label
                              htmlFor={group.dn}
                              className="cursor-pointer font-medium text-foreground"
                            >
                              {group.cn}
                            </label>
                            {group.description && (
                              <p className="text-sm text-muted-foreground">
                                {group.description}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {group.members.length} miembro(s)
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
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

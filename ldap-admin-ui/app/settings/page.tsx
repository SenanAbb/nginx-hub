"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  RefreshCw,
  Server,
  Shield,
  TestTube,
} from "lucide-react";

import { Header } from "@/components/admin/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SettingsResponse = {
  connected: boolean;
  config: {
    url: string;
    host: string;
    protocol: string;
    baseDn: string;
    peopleDn: string;
    groupsDn: string;
  };
};

export default function SettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

  const initialConnected = data?.connected ?? false;
  const config = data?.config;

  const derivedTls = useMemo(() => {
    if (!config?.protocol) return "";
    return config.protocol === "ldaps" ? "LDAPS" : "LDAP";
  }, [config?.protocol]);

  const fetchSettings = async () => {
    const res = await fetch("/api/ldap/settings", { cache: "no-store" });
    if (!res.ok) {
      throw new Error("failed");
    }
    return (await res.json()) as SettingsResponse;
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchSettings()
      .then((json) => {
        if (!mounted) return;
        setData(json);
        setTestResult(json.connected ? "success" : "error");
      })
      .catch(() => {
        if (!mounted) return;
        setTestResult("error");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const json = await fetchSettings();
      setData(json);
      setTestResult(json.connected ? "success" : "error");
    } catch {
      setTestResult("error");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <>
      <Header
        title="Configuración LDAP"
        description="Consulta la configuración activa del servidor LDAP y verifica la conectividad"
      >
        <Button
          variant="outline"
          size="sm"
          className="gap-2 bg-transparent"
          onClick={handleTestConnection}
          disabled={isTesting}
        >
          {isTesting ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <TestTube className="h-4 w-4" />
          )}
          Probar conexión
        </Button>
      </Header>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Server className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Conexión del servidor</CardTitle>
                  <CardDescription>URL activa (solo lectura)</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ldap-url">LDAP URL</Label>
                <Input
                  id="ldap-url"
                  value={config?.url ?? (loading ? "Cargando..." : "")}
                  readOnly
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ldap-host">Host</Label>
                <Input
                  id="ldap-host"
                  value={config?.host ?? (loading ? "Cargando..." : "")}
                  readOnly
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ldap-protocol">Protocolo</Label>
                <Input
                  id="ldap-protocol"
                  value={derivedTls || (loading ? "Cargando..." : "")}
                  readOnly
                  disabled
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Credenciales</CardTitle>
                  <CardDescription>No se muestran por seguridad</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border p-4">
                <p className="font-medium text-foreground">Bind DN / contraseña</p>
                <p className="text-sm text-muted-foreground">
                  Esta aplicación obtiene las credenciales desde variables de entorno del servidor. No son editables desde la UI.
                </p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="font-medium text-foreground">TLS/SSL</p>
                <p className="text-sm text-muted-foreground">
                  El protocolo se determina por la URL (ldap:// o ldaps://). Parámetros como CA o modo inseguro se administran fuera de la UI.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Database className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Bases de búsqueda</CardTitle>
                  <CardDescription>OUs activas para usuarios y grupos (solo lectura)</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="base-dn">Base DN</Label>
                <Input
                  id="base-dn"
                  value={config?.baseDn ?? (loading ? "Cargando..." : "")}
                  readOnly
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="people-dn">Base de usuarios</Label>
                <Input
                  id="people-dn"
                  value={config?.peopleDn ?? (loading ? "Cargando..." : "")}
                  readOnly
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="groups-dn">Base de grupos</Label>
                <Input
                  id="groups-dn"
                  value={config?.groupsDn ?? (loading ? "Cargando..." : "")}
                  readOnly
                  disabled
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <RefreshCw className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Estado de conexión</CardTitle>
                  <CardDescription>Verificación de conectividad LDAP</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Estado</span>
                {testResult === "success" ? (
                  <Badge className="gap-1 bg-primary/10 text-primary hover:bg-primary/20">
                    <CheckCircle2 className="h-3 w-3" />
                    Conectado
                  </Badge>
                ) : testResult === "error" ? (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Error
                  </Badge>
                ) : (
                  <Badge variant="secondary">Sin verificar</Badge>
                )}
              </div>

              <div className="h-px w-full bg-border" />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Servidor</span>
                  <span className="text-sm font-medium text-foreground">
                    {config ? `${config.host}` : loading ? "Cargando..." : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Protocolo</span>
                  <span className="text-sm font-medium text-foreground">
                    {derivedTls || (loading ? "Cargando..." : "-")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Base DN</span>
                  <span className="text-sm font-mono text-foreground">
                    {config?.baseDn ?? (loading ? "Cargando..." : "-")}
                  </span>
                </div>
              </div>

              <div className="h-px w-full bg-border" />

              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs text-muted-foreground">
                  Estado inicial: {initialConnected ? "conectado" : "sin verificar o sin conexión"}. Usa “Probar conexión” para refrescar.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

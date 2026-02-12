"use client";

import { useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SyncTarget = "ambari" | "ranger" | "hue";

type SyncResponse = {
  success?: boolean;
  error?: string;
};

async function requestSync(body: unknown): Promise<SyncResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const json = (await res.json().catch(() => ({}))) as SyncResponse;
    if (!res.ok) {
      return { success: false, error: json?.error || `HTTP ${res.status}` };
    }
    return json;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { success: false, error: "Timeout: no se pudo conectar con Redis (¿firewall?)" };
    }
    return { success: false, error: err?.message || "Error de red" };
  } finally {
    clearTimeout(timer);
  }
}

export function SyncSidebarControls() {
  const [loading, setLoading] = useState<SyncTarget | "both" | null>(null);
  const [hueAdminLoading, setHueAdminLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const run = async (targets: SyncTarget[] | "both") => {
    setMessage(null);
    setIsError(false);
    setLoading(targets === "both" ? "both" : targets[0] ?? null);
    try {
      const body =
        targets === "both"
          ? { targets: ["ambari", "ranger", "hue"], force: true }
          : { targets, force: true };
      const result = await requestSync(body);
      if (!result.success) {
        setMessage(result.error || "No se pudo encolar la sincronización");
        setIsError(true);
        return;
      }
      setMessage("Sincronización encolada");
    } finally {
      setLoading(null);
    }
  };

  const runHueAdmin = async () => {
    setMessage(null);
    setIsError(false);
    setHueAdminLoading(true);
    try {
      const result = await requestSync({ groupCn: "hue_admin", force: true });
      if (!result.success) {
        setMessage(result.error || "No se pudo encolar Hue (hue_admin)");
        setIsError(true);
        return;
      }
      setMessage("Hue (hue_admin) encolado");
    } finally {
      setHueAdminLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" onClick={() => run(["ambari"])} disabled={loading !== null}>
        {loading === "ambari" ? "Encolando..." : "Sync Ambari"}
      </Button>
      <Button variant="outline" onClick={() => run(["ranger"])} disabled={loading !== null}>
        {loading === "ranger" ? "Encolando..." : "Sync Ranger"}
      </Button>
      <Button variant="outline" onClick={runHueAdmin} disabled={loading !== null || hueAdminLoading}>
        {hueAdminLoading ? "Encolando..." : "Sync Hue (hue_admin)"}
      </Button>
      <Button onClick={() => run("both")} disabled={loading !== null}>
        {loading === "both" ? "Encolando..." : "Sync Todo"}
      </Button>
      {message ? <p className={`text-xs ${isError ? "text-red-500 font-medium" : "text-green-600"}`}>{message}</p> : null}
    </div>
  );
}

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
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as SyncResponse;
  if (!res.ok) {
    return { success: false, error: json?.error || `HTTP ${res.status}` };
  }
  return json;
}

export function SyncSidebarControls() {
  const [loading, setLoading] = useState<SyncTarget | "both" | null>(null);
  const [hueAdminLoading, setHueAdminLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async (targets: SyncTarget[] | "both") => {
    setMessage(null);
    setLoading(targets === "both" ? "both" : targets[0] ?? null);
    try {
      const body =
        targets === "both"
          ? { targets: ["ambari", "ranger", "hue"], force: true }
          : { targets, force: true };
      const result = await requestSync(body);
      if (!result.success) {
        setMessage(result.error || "No se pudo encolar la sincronización");
        return;
      }
      setMessage("Sincronización encolada");
    } finally {
      setLoading(null);
    }
  };

  const runHueAdmin = async () => {
    setMessage(null);
    setHueAdminLoading(true);
    try {
      const result = await requestSync({ groupCn: "hue_admin", force: true });
      if (!result.success) {
        setMessage(result.error || "No se pudo encolar Hue (hue_admin)");
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
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}

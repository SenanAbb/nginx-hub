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

export function SyncControls() {
  const [loading, setLoading] = useState<SyncTarget | "both" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rangerUsername, setRangerUsername] = useState<string>("");

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

  const runRangerUserResync = async () => {
    const username = rangerUsername.trim();
    if (!username) {
      setMessage("Indica un usuario para resincronizar");
      return;
    }

    setMessage(null);
    setLoading("ranger");
    try {
      const result = await requestSync({ rangerUsername: username, force: true });
      if (!result.success) {
        setMessage(result.error || "No se pudo encolar la resincronización");
        return;
      }
      setMessage("Usuario encolado para borrado completo + sync Ranger");
      setRangerUsername("");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => run(["ambari"])}
          disabled={loading !== null}
        >
          {loading === "ambari" ? "Encolando..." : "Sync Ambari"}
        </Button>
        <Button
          variant="outline"
          onClick={() => run(["ranger"])}
          disabled={loading !== null}
        >
          {loading === "ranger" ? "Encolando..." : "Sync Ranger"}
        </Button>
        <Button
          variant="outline"
          onClick={() => run(["hue"])}
          disabled={loading !== null}
        >
          {loading === "hue" ? "Encolando..." : "Sync Hue"}
        </Button>
        <Button
          onClick={() => run("both")}
          disabled={loading !== null}
        >
          {loading === "both" ? "Encolando..." : "Sync Ambos"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          value={rangerUsername}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setRangerUsername(e.target.value)}
          placeholder="Usuario Ranger (preferred_username)"
          disabled={loading !== null}
          className="max-w-xs"
        />
        <Button
          variant="outline"
          onClick={runRangerUserResync}
          disabled={loading !== null}
        >
          {loading === "ranger" ? "Encolando..." : "Resync usuario Ranger"}
        </Button>
      </div>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}

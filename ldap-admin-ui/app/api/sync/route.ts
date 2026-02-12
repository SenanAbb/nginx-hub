import { NextResponse } from "next/server";

import { resolveAuthWithLdapFallback } from "@/lib/auth";
import {
  enqueueRangerUserResync,
  enqueueSync,
  enqueueSyncFromGroupCn,
  enqueueSyncFromGroupCnWithOptions,
} from "@/lib/sync-queue";

type SyncTarget = "ambari" | "ranger" | "hue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await resolveAuthWithLdapFallback(request.headers);
  console.log("/api/sync request", {
    authorized: auth.isAuthorized,
    user: auth.user,
    groupsCount: auth.groups?.length ?? 0,
  });
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({} as any));
    console.log("/api/sync body", body);
    const groupCn = typeof body?.groupCn === "string" ? body.groupCn : undefined;
    const rangerUsername = typeof body?.rangerUsername === "string" ? body.rangerUsername : undefined;
    const force = !!body?.force;

    if (rangerUsername) {
      const result = await enqueueRangerUserResync(rangerUsername, { force });
      console.log("/api/sync enqueue ranger user", { rangerUsername, force, result });
      return NextResponse.json({ success: true, ...result, targets: ["ranger"], rangerUsername, force });
    }

    if (groupCn) {
      const result = force
        ? await enqueueSyncFromGroupCnWithOptions(groupCn, { force: true })
        : await enqueueSyncFromGroupCn(groupCn);
      console.log("/api/sync enqueue from group", { groupCn, force, result });
      return NextResponse.json({ success: true, ...result, targets: "from_group", force });
    }

    const targetsRaw = Array.isArray(body?.targets) ? body.targets : [];
    const targets = targetsRaw.filter(
      (t: unknown): t is SyncTarget => t === "ambari" || t === "ranger" || t === "hue",
    );

    if (!targets.length) {
      return NextResponse.json(
        { error: "targets or groupCn is required" },
        { status: 400 },
      );
    }

    const result = await enqueueSync(targets, { force });
    console.log("/api/sync enqueue targets", { targets, force, result });
    return NextResponse.json({ success: true, ...result, targets });
  } catch (error: any) {
    console.error("/api/sync error", error);
    return NextResponse.json(
      { error: error?.message || "Failed to enqueue sync" },
      { status: 500 },
    );
  }
}

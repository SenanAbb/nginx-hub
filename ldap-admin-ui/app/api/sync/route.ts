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
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({} as any));
    const groupCn = typeof body?.groupCn === "string" ? body.groupCn : undefined;
    const rangerUsername = typeof body?.rangerUsername === "string" ? body.rangerUsername : undefined;
    const force = !!body?.force;

    if (rangerUsername) {
      const result = await enqueueRangerUserResync(rangerUsername, { force });
      return NextResponse.json({ success: true, ...result, targets: ["ranger"], rangerUsername, force });
    }

    if (groupCn) {
      const result = force
        ? await enqueueSyncFromGroupCnWithOptions(groupCn, { force: true })
        : await enqueueSyncFromGroupCn(groupCn);
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
    return NextResponse.json({ success: true, ...result, targets });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to enqueue sync" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";

import { resolveAuthWithLdapFallback } from "@/lib/auth";
import { addUserToGroup, removeUserFromGroup } from "@/lib/ldap";
import { enqueueSyncFromGroupCn, markRangerUserForForceDelete } from "@/lib/sync-queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const auth = await resolveAuthWithLdapFallback(request.headers);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const { uid } = await params;
    const { groupCn } = await request.json();
    await addUserToGroup(uid, groupCn);
    if (typeof groupCn === "string" && groupCn.toLowerCase().startsWith("ranger_")) {
      await markRangerUserForForceDelete(uid);
    }
    await enqueueSyncFromGroupCn(groupCn);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const debugRuntime =
      typeof process !== "undefined" && (process as any)?.versions?.node ? "nodejs" : "edge";
    return NextResponse.json(
      { error: error.message || "Failed to add user to group", debugRuntime },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const auth = await resolveAuthWithLdapFallback(request.headers);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const { uid } = await params;
    const { searchParams } = new URL(request.url);
    const groupCn = searchParams.get("groupCn");
    if (!groupCn) {
      return NextResponse.json({ error: "groupCn is required" }, { status: 400 });
    }
    await removeUserFromGroup(uid, groupCn);
    if (groupCn.toLowerCase().startsWith("ranger_")) {
      await markRangerUserForForceDelete(uid);
    }
    await enqueueSyncFromGroupCn(groupCn);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const debugRuntime =
      typeof process !== "undefined" && (process as any)?.versions?.node ? "nodejs" : "edge";
    return NextResponse.json(
      { error: error.message || "Failed to remove user from group", debugRuntime },
      { status: 500 },
    );
  }
}

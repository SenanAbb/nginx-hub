import { NextResponse } from "next/server";

import { resolveAuthWithLdapFallback } from "@/lib/auth";
import { deleteUser, getUserGroups, updateUser } from "@/lib/ldap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const auth = await resolveAuthWithLdapFallback(request.headers);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const { uid } = await params;
    const groups = await getUserGroups(uid);
    return NextResponse.json({ groups });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch user groups" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const auth = await resolveAuthWithLdapFallback(request.headers);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const { uid } = await params;
    const body = await request.json();
    await updateUser({ uid, ...body });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const debugRuntime =
      typeof process !== "undefined" && (process as any)?.versions?.node ? "nodejs" : "edge";
    return NextResponse.json(
      { error: error.message || "Failed to update user", debugRuntime },
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
    await deleteUser(uid);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const debugRuntime =
      typeof process !== "undefined" && (process as any)?.versions?.node ? "nodejs" : "edge";
    return NextResponse.json(
      { error: error.message || "Failed to delete user", debugRuntime },
      { status: 500 },
    );
  }
}

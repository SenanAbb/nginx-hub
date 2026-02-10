import { NextResponse } from "next/server";

import { resolveAuthWithLdapFallback } from "@/lib/auth";
import { deleteGroup, updateGroup } from "@/lib/ldap";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ cn: string }> }) {
  const auth = await resolveAuthWithLdapFallback(request.headers);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json(
    { error: "read_only" },
    { status: 405, headers: { Allow: "GET" } },
  );
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ cn: string }> }) {
  const auth = await resolveAuthWithLdapFallback(_request.headers);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json(
    { error: "read_only" },
    { status: 405, headers: { Allow: "GET" } },
  );
}

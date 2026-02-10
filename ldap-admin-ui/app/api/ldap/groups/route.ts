import { NextResponse } from "next/server";

import { fetchGroups } from "@/lib/ldap";
import { resolveAuthWithLdapFallback } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await resolveAuthWithLdapFallback(request.headers);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const groups = await fetchGroups();
  return NextResponse.json({ groups });
}

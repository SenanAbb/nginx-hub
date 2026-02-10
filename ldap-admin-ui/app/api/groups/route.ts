import { NextResponse } from "next/server";

import { resolveAuthWithLdapFallback } from "@/lib/auth";
import { createGroup } from "@/lib/ldap";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await resolveAuthWithLdapFallback(request.headers);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json(
    { error: "read_only" },
    { status: 405, headers: { Allow: "GET" } },
  );
}

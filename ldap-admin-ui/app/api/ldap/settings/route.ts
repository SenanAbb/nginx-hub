import { NextResponse } from "next/server";

import { resolveAuthWithLdapFallback } from "@/lib/auth";
import { checkLdapConnection, ldapConfig } from "@/lib/ldap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await resolveAuthWithLdapFallback(request.headers);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const connected = await checkLdapConnection();

  const url = ldapConfig.url;
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "ldap";
    }
  })();

  const protocol = (() => {
    try {
      return new URL(url).protocol.replace(":", "");
    } catch {
      return "ldap";
    }
  })();

  return NextResponse.json({
    connected,
    config: {
      url,
      host,
      protocol,
      baseDn: ldapConfig.baseDn,
      peopleDn: ldapConfig.peopleDn,
      groupsDn: ldapConfig.groupsDn,
    },
  });
}

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const headers = request.headers;

  const xAuthRequestUser = headers.get("x-auth-request-user");
  const xAuthRequestEmail = headers.get("x-auth-request-email");
  const xAuthRequestGroups = headers.get("x-auth-request-groups");

  return NextResponse.json({
    ok: true,
    headers: {
      "x-auth-request-user": xAuthRequestUser,
      "x-auth-request-email": xAuthRequestEmail,
      "x-auth-request-groups": xAuthRequestGroups,
    },
  });
}

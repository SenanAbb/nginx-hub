export const REQUIRED_GROUP = "sp_admin";

export type AuthResult = {
  user?: string;
  email?: string;
  groups: string[];
  isAuthorized: boolean;
};

export const parseGroups = (groupsHeader: string | null): string[] => {
  return (groupsHeader ?? "")
    .split(",")
    .map((group) => group.trim())
    .filter(Boolean);
};

const isLikelyUid = (value: string | undefined): boolean => {
  if (!value) return false;
  // Avoid treating Keycloak UUID subject as LDAP uid.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return false;
  }
  return true;
};

export const resolveAuth = (headers: Headers): AuthResult => {
  const emailHeader = headers.get("x-auth-request-email");
  const userHeader = headers.get("x-auth-request-user");
  
  const user = emailHeader || userHeader || undefined;
  const email = emailHeader ?? undefined;
  const groups = parseGroups(headers.get("x-auth-request-groups"));
  
  const isAuthorized = !!user && (REQUIRED_GROUP ? groups.includes(REQUIRED_GROUP) : true);

  return { user, email, groups, isAuthorized };
};

export const resolveAuthWithLdapFallback = async (headers: Headers): Promise<AuthResult> => {
  const base = resolveAuth(headers);
  if (base.isAuthorized) return base;

  const groupsHeader = headers.get("x-auth-request-groups");
  if (groupsHeader && parseGroups(groupsHeader).length) {
    return base;
  }

  const emailHeader = headers.get("x-auth-request-email") ?? undefined;
  const userHeader = headers.get("x-auth-request-user") ?? undefined;
  const uidCandidate = isLikelyUid(emailHeader) ? emailHeader : isLikelyUid(userHeader) ? userHeader : undefined;
  if (!uidCandidate) return base;

  const { isUserInGroup } = await import("@/lib/ldap");
  const inGroup = await isUserInGroup(uidCandidate, REQUIRED_GROUP);
  return { ...base, user: base.user ?? uidCandidate, isAuthorized: inGroup };
};

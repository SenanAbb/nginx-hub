import fs from "fs";
import { revalidateTag, unstable_cache } from "next/cache";
import { Attribute, Change, Client } from "ldapts";

const LDAP_URL = process.env.LDAP_URL ?? "ldaps://localhost:636";
const LDAP_BIND_DN = process.env.LDAP_BIND_DN ?? "cn=admin,dc=larioja,dc=org";
const LDAP_BIND_PASSWORD = process.env.LDAP_BIND_PASSWORD ?? "admin";
const LDAP_BASE_DN = process.env.LDAP_BASE_DN ?? "dc=larioja,dc=org";
const LDAP_PEOPLE_DN_BASE = process.env.LDAP_PEOPLE_DN_BASE ?? "ou=people,dc=larioja,dc=org";
const LDAP_GROUPS_DN_BASE = process.env.LDAP_GROUPS_DN_BASE ?? "ou=groups,dc=larioja,dc=org";

const LDAP_TLS_CA_FILE = process.env.LDAP_TLS_CA_FILE;
const LDAP_TLS_INSECURE = process.env.LDAP_TLS_INSECURE === "true";

const TAG_LDAP_USERS = "ldap-users";
const TAG_LDAP_GROUPS = "ldap-groups";
const TAG_LDAP_KPIS = "ldap-kpis";

function getClient() {
  const tlsOptions = LDAP_TLS_INSECURE
    ? { rejectUnauthorized: false }
    : LDAP_TLS_CA_FILE
      ? { ca: [fs.readFileSync(LDAP_TLS_CA_FILE)] }
      : undefined;

  return new Client({ url: LDAP_URL, tlsOptions });
}

async function withClient<T>(handler: (client: Client) => Promise<T>): Promise<T> {
  const client = getClient();
  try {
    await client.bind(LDAP_BIND_DN, LDAP_BIND_PASSWORD);
    return await handler(client);
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

type LdapEntry = Record<string, unknown>;

const toStringValue = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    return value.length ? String(value[0]) : undefined;
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [String(value)];
};

const isDniNie = (uid: string): boolean => {
  const v = (uid ?? "").trim();
  if (!v) return false;
  if (/^[0-9]{8}[A-Za-z]$/.test(v)) return true;
  if (/^[XYZxyz][0-9]{7}[A-Za-z]$/.test(v)) return true;
  return false;
};

export type LdapUser = {
  dn: string;
  uid: string;
  cn?: string;
  givenName?: string;
  sn?: string;
  mail?: string;
  dni?: string;
};

export type LdapGroup = {
  dn: string;
  cn: string;
  description?: string;
  members: string[];
};

const cacheTtl = Number(process.env.LDAP_CACHE_TTL ?? "60");

async function fetchUsersRaw(): Promise<LdapUser[]> {
  return withClient(async (client) => {
    const { searchEntries } = await client.search(LDAP_PEOPLE_DN_BASE, {
      scope: "sub",
      filter: "(objectClass=inetOrgPerson)",
      attributes: ["uid", "cn", "givenName", "sn", "mail"],
    });

    const entries = searchEntries as LdapEntry[];

    return entries
      .map((entry) => ({
        dn: String((entry as any).dn ?? ""),
        uid: toStringValue(entry.uid) ?? "",
        cn: toStringValue(entry.cn),
        givenName: toStringValue(entry.givenName),
        sn: toStringValue(entry.sn),
        mail: toStringValue(entry.mail),
        dni: (() => {
          const uid = toStringValue(entry.uid) ?? "";
          return isDniNie(uid) ? uid : undefined;
        })(),
      }))
      .filter((user) => user.uid);
  });
}

async function fetchGroupsRaw(): Promise<LdapGroup[]> {
  return withClient(async (client) => {
    const { searchEntries } = await client.search(LDAP_GROUPS_DN_BASE, {
      scope: "sub",
      filter: "(|(objectClass=groupOfNames)(objectClass=posixGroup))",
      attributes: ["cn", "description", "member", "memberUid"],
    });

    const entries = searchEntries as LdapEntry[];

    return entries
      .map((entry) => ({
        dn: String((entry as any).dn ?? ""),
        cn: toStringValue(entry.cn) ?? "",
        description: toStringValue((entry as any).description),
        members: (() => {
          const memberDns = toStringArray((entry as any).member)
            .map((v) => String(v))
            .filter((dn) => {
              const s = dn.toLowerCase();
              return s.startsWith("uid=") && s.includes(`,${LDAP_PEOPLE_DN_BASE.toLowerCase()}`);
            });
          const memberUidDns = toStringArray((entry as any).memberUid)
            .map((v) => `uid=${String(v)},${LDAP_PEOPLE_DN_BASE}`)
            .filter((dn) => {
              const s = dn.toLowerCase();
              return s.startsWith("uid=") && s.includes(`,${LDAP_PEOPLE_DN_BASE.toLowerCase()}`);
            });
          return Array.from(new Set([...memberDns, ...memberUidDns]));
        })(),
      }))
      .filter((group) => group.cn);
  });
}

export const fetchUsers = unstable_cache(fetchUsersRaw, ["ldap-users-v2"], {
  revalidate: cacheTtl,
  tags: [TAG_LDAP_USERS],
});

export const fetchGroups = unstable_cache(fetchGroupsRaw, ["ldap-groups"], {
  revalidate: cacheTtl,
  tags: [TAG_LDAP_GROUPS],
});

export async function checkLdapConnection(): Promise<boolean> {
  try {
    await withClient(async () => true);
    return true;
  } catch {
    return false;
  }
}

export const checkLdapConnectionCached = unstable_cache(
  checkLdapConnection,
  ["ldap-connection"],
  {
    revalidate: Math.min(cacheTtl, 30),
  },
);

export type LdapKpis = {
  totalUsers: number;
  totalGroups: number;
  usersWithGroups: number;
  usersWithoutGroups: number;
  emptyGroups: number;
  avgGroupsPerUser: number;
  uniqueMembers: number;
  coverage: number;
};

async function fetchKpisRaw(): Promise<LdapKpis> {
  const [users, groups] = await Promise.all([fetchUsers(), fetchGroups()]);
  const membershipCounts = new Map<string, number>();
  const uniqueMembers = new Set<string>();

  groups.forEach((group) => {
    group.members.forEach((member) => {
      const uid = String(member).split(",")[0]?.replace(/^uid=/, "").trim();
      if (!uid) return;
      uniqueMembers.add(uid);
      membershipCounts.set(uid, (membershipCounts.get(uid) ?? 0) + 1);
    });
  });

  const totalUsers = users.length;
  const totalGroups = groups.length;
  const usersWithoutGroups = users.filter((user) => !membershipCounts.get(user.uid)).length;
  const usersWithGroups = totalUsers - usersWithoutGroups;
  const emptyGroups = groups.filter((group) => group.members.length === 0).length;
  const avgGroupsPerUser = totalUsers
    ? Number(
        (
          Array.from(membershipCounts.values()).reduce((acc, value) => acc + value, 0) / totalUsers
        ).toFixed(1),
      )
    : 0;
  const coverage = totalUsers ? Math.round((usersWithGroups / totalUsers) * 100) : 0;

  return {
    totalUsers,
    totalGroups,
    usersWithGroups,
    usersWithoutGroups,
    emptyGroups,
    avgGroupsPerUser,
    uniqueMembers: uniqueMembers.size,
    coverage,
  };
}

export const fetchKpis = unstable_cache(fetchKpisRaw, ["ldap-kpis"], {
  revalidate: cacheTtl,
  tags: [TAG_LDAP_KPIS],
});

export const ldapConfig = {
  url: LDAP_URL,
  baseDn: LDAP_BASE_DN,
  peopleDn: LDAP_PEOPLE_DN_BASE,
  groupsDn: LDAP_GROUPS_DN_BASE,
};

export type CreateUserInput = {
  uid: string;
  givenName: string;
  sn: string;
  cn?: string;
  mail?: string;
  password: string;
  uidNumber?: number;
  gidNumber?: number;
};

export type UpdateUserInput = {
  uid: string;
  givenName?: string;
  sn?: string;
  cn?: string;
  mail?: string;
  password?: string;
};

export async function createUser(input: CreateUserInput): Promise<void> {
  return withClient(async (client) => {
    const dn = `uid=${input.uid},${LDAP_PEOPLE_DN_BASE}`;
    const uidNumber = input.uidNumber ?? 10000 + Math.floor(Math.random() * 50000);
    const gidNumber = input.gidNumber ?? 10000;
    const cn = input.cn ?? `${input.givenName} ${input.sn}`;

    const entry: Record<string, unknown> = {
      objectClass: ["inetOrgPerson", "posixAccount", "shadowAccount"],
      uid: input.uid,
      cn,
      sn: input.sn,
      givenName: input.givenName,
      userPassword: input.password,
      uidNumber: uidNumber.toString(),
      gidNumber: gidNumber.toString(),
      homeDirectory: `/home/${input.uid}`,
      loginShell: "/bin/bash",
    };
    if (input.mail) {
      entry.mail = input.mail;
    }

    await client.add(dn, entry as any);
    revalidateTag(TAG_LDAP_USERS, "max");
    revalidateTag(TAG_LDAP_KPIS, "max");
  });
}

export async function updateUser(input: UpdateUserInput): Promise<void> {
  return withClient(async (client) => {
    const dn = `uid=${input.uid},${LDAP_PEOPLE_DN_BASE}`;
    const changes: Change[] = [];

    if (input.givenName) {
      changes.push(
        new Change({
          operation: "replace",
          modification: new Attribute({ type: "givenName", values: [input.givenName] }),
        }),
      );
    }
    if (input.sn) {
      changes.push(
        new Change({
          operation: "replace",
          modification: new Attribute({ type: "sn", values: [input.sn] }),
        }),
      );
    }
    if (input.cn) {
      changes.push(
        new Change({
          operation: "replace",
          modification: new Attribute({ type: "cn", values: [input.cn] }),
        }),
      );
    }
    if (input.mail) {
      changes.push(
        new Change({
          operation: "replace",
          modification: new Attribute({ type: "mail", values: [input.mail] }),
        }),
      );
    }
    if (input.password) {
      changes.push(
        new Change({
          operation: "replace",
          modification: new Attribute({ type: "userPassword", values: [input.password] }),
        }),
      );
    }

    if (changes.length > 0) {
      await client.modify(dn, changes);
      revalidateTag(TAG_LDAP_USERS, "max");
      revalidateTag(TAG_LDAP_KPIS, "max");
    }
  });
}

export async function deleteUser(uid: string): Promise<void> {
  return withClient(async (client) => {
    const dn = `uid=${uid},${LDAP_PEOPLE_DN_BASE}`;
    await client.del(dn);
    revalidateTag(TAG_LDAP_USERS, "max");
    revalidateTag(TAG_LDAP_GROUPS, "max");
    revalidateTag(TAG_LDAP_KPIS, "max");
  });
}

export async function addUserToGroup(uid: string, groupCn: string): Promise<void> {
  return withClient(async (client) => {
    const groupDn = `cn=${groupCn},${LDAP_GROUPS_DN_BASE}`;
    const userDn = `uid=${uid},${LDAP_PEOPLE_DN_BASE}`;

    const addMember = async () => {
      await client.modify(
        groupDn,
        [
          new Change({
            operation: "add",
            modification: new Attribute({ type: "member", values: [userDn] }),
          }),
        ],
      );
    };

    const addMemberUid = async () => {
      await client.modify(
        groupDn,
        [
          new Change({
            operation: "add",
            modification: new Attribute({ type: "memberUid", values: [uid] }),
          }),
        ],
      );
    };

    try {
      await addMember();
    } catch (error: any) {
      const message = String(error?.message ?? error);
      if (
        message.toLowerCase().includes("type or value exists") ||
        message.toLowerCase().includes("entry already exists") ||
        message.includes(" 20") ||
        message.includes(" 68")
      ) {
        return;
      }
      if (
        message.toLowerCase().includes("object class violation") ||
        message.toLowerCase().includes("undefined attribute") ||
        message.includes(" 17") ||
        message.includes(" 65")
      ) {
        await addMemberUid();
        return;
      }
      throw error;
    }

    try {
      await addMemberUid();
    } catch (error: any) {
      const message = String(error?.message ?? error);
      if (
        message.toLowerCase().includes("type or value exists") ||
        message.toLowerCase().includes("entry already exists") ||
        message.toLowerCase().includes("object class violation") ||
        message.toLowerCase().includes("undefined attribute") ||
        message.includes(" 17") ||
        message.includes(" 20") ||
        message.includes(" 65") ||
        message.includes(" 68")
      ) {
        return;
      }
      throw error;
    }

    revalidateTag(TAG_LDAP_GROUPS, "max");
    revalidateTag(TAG_LDAP_KPIS, "max");
  });
}

export type CreateGroupInput = {
  cn: string;
  description?: string;
  members?: string[];
};

export type UpdateGroupInput = {
  cn: string;
  description?: string;
  members?: string[];
};

export async function createGroup(input: CreateGroupInput): Promise<void> {
  return withClient(async (client) => {
    const dn = `cn=${input.cn},${LDAP_GROUPS_DN_BASE}`;

    // groupOfNames requiere al menos un "member".
    const members = (input.members ?? []).length ? (input.members ?? []) : [LDAP_BIND_DN];

    const entry: Record<string, unknown> = {
      objectClass: ["groupOfNames"],
      cn: input.cn,
      member: members,
    };
    if (input.description) {
      entry.description = input.description;
    }

    await client.add(dn, entry as any);
    revalidateTag(TAG_LDAP_GROUPS, "max");
    revalidateTag(TAG_LDAP_KPIS, "max");
  });
}

export async function updateGroup(input: UpdateGroupInput): Promise<void> {
  return withClient(async (client) => {
    const dn = `cn=${input.cn},${LDAP_GROUPS_DN_BASE}`;
    const changes: Change[] = [];

    const isGroupOfNames = await (async () => {
      try {
        const { searchEntries } = await client.search(dn, {
          scope: "base",
          filter: "(objectClass=*)",
          attributes: ["objectClass"],
        });
        const entry = (searchEntries as any[])?.[0];
        const ocs = toStringArray(entry?.objectClass).map((v) => String(v).toLowerCase());
        return ocs.includes("groupofnames");
      } catch {
        return false;
      }
    })();

    if (input.description !== undefined) {
      if (input.description) {
        changes.push(
          new Change({
            operation: "replace",
            modification: new Attribute({ type: "description", values: [input.description] }),
          }),
        );
      } else {
        changes.push(
          new Change({
            operation: "delete",
            modification: new Attribute({ type: "description", values: [] }),
          }),
        );
      }
    }

    if (input.members !== undefined) {
      const members = input.members.length ? input.members : isGroupOfNames ? [LDAP_BIND_DN] : [];
      changes.push(
        new Change({
          operation: "replace",
          modification: new Attribute({ type: "member", values: members }),
        }),
      );
    }

    if (changes.length > 0) {
      await client.modify(dn, changes);
      revalidateTag(TAG_LDAP_GROUPS, "max");
      revalidateTag(TAG_LDAP_KPIS, "max");
    }

    if (input.members !== undefined) {
      const memberUidValues = input.members
        .map((m) => String(m).split(",")[0] ?? "")
        .map((rdn) => rdn.replace(/^uid=/i, "").trim())
        .filter(Boolean);

      const memberUidChange =
        memberUidValues.length > 0
          ? new Change({
              operation: "replace",
              modification: new Attribute({ type: "memberUid", values: memberUidValues }),
            })
          : new Change({
              operation: "delete",
              modification: new Attribute({ type: "memberUid", values: [] }),
            });

      try {
        await client.modify(dn, [memberUidChange]);
      } catch (error: any) {
        const message = String(error?.message ?? error).toLowerCase();
        if (
          message.includes("undefined attribute") ||
          message.includes("object class violation") ||
          message.includes("no such attribute") ||
          message.includes(" 17") ||
          message.includes(" 65") ||
          message.includes(" 16")
        ) {
          return;
        }
        throw error;
      }

      revalidateTag(TAG_LDAP_GROUPS, "max");
      revalidateTag(TAG_LDAP_KPIS, "max");
    }
  });
}

export async function deleteGroup(cn: string): Promise<void> {
  return withClient(async (client) => {
    const dn = `cn=${cn},${LDAP_GROUPS_DN_BASE}`;
    await client.del(dn);
    revalidateTag(TAG_LDAP_GROUPS, "max");
    revalidateTag(TAG_LDAP_KPIS, "max");
  });
}

export async function removeUserFromGroup(uid: string, groupCn: string): Promise<void> {
  return withClient(async (client) => {
    const groupDn = `cn=${groupCn},${LDAP_GROUPS_DN_BASE}`;
    const userDn = `uid=${uid},${LDAP_PEOPLE_DN_BASE}`;

    try {
      await client.modify(
        groupDn,
        [
          new Change({
            operation: "delete",
            modification: new Attribute({ type: "member", values: [userDn] }),
          }),
        ],
      );
    } catch (error: any) {
      const message = String(error?.message ?? error);
      // Idempotencia: si el usuario no está en el grupo, LDAP suele responder
      // "No such attribute" (code 16) o similar.
      if (message.toLowerCase().includes("no such attribute") || message.includes(" 16")) {
        // continue
      } else if (
        message.toLowerCase().includes("undefined attribute") ||
        message.toLowerCase().includes("object class violation") ||
        message.includes(" 17") ||
        message.includes(" 65")
      ) {
        // continue
      } else {
        throw error;
      }
    }

    try {
      await client.modify(
        groupDn,
        [
          new Change({
            operation: "delete",
            modification: new Attribute({ type: "memberUid", values: [uid] }),
          }),
        ],
      );
    } catch (error: any) {
      const message = String(error?.message ?? error);
      if (
        message.toLowerCase().includes("no such attribute") ||
        message.toLowerCase().includes("undefined attribute") ||
        message.toLowerCase().includes("object class violation") ||
        message.includes(" 16") ||
        message.includes(" 17") ||
        message.includes(" 65")
      ) {
        return;
      }
      throw error;
    }

    revalidateTag(TAG_LDAP_GROUPS, "max");
    revalidateTag(TAG_LDAP_KPIS, "max");
  });
}

export async function getUserGroups(uid: string): Promise<string[]> {
  return withClient(async (client) => {
    const userDn = `uid=${uid},${LDAP_PEOPLE_DN_BASE}`;
    const { searchEntries } = await client.search(LDAP_GROUPS_DN_BASE, {
      scope: "sub",
      filter: `(&(|(objectClass=groupOfNames)(objectClass=posixGroup))(|(member=${userDn})(memberUid=${uid})))`,
      attributes: ["cn", "member", "memberUid"],
    });

    return (searchEntries as any[])
      .map((entry) => String(entry.dn ?? ""))
      .filter(Boolean);
  });
}

export async function isUserInGroup(uid: string, groupCn: string): Promise<boolean> {
  return withClient(async (client) => {
    const userDn = `uid=${uid},${LDAP_PEOPLE_DN_BASE}`;
    const { searchEntries } = await client.search(LDAP_GROUPS_DN_BASE, {
      scope: "sub",
      filter: `(&(cn=${groupCn})(|(member=${userDn})(memberUid=${uid})))`,
      attributes: ["cn"],
    });

    return (searchEntries as any[]).length > 0;
  });
}

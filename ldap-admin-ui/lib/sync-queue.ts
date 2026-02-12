import { createClient, type RedisClientType } from "redis";

type SyncTarget = "ambari" | "ranger" | "hue";

export type { SyncTarget };

type RedisConfig = {
  url: string;
};

const REDIS_URL = process.env.SYNC_REDIS_URL ?? process.env.REDIS_URL ?? "redis://redis:6379";
const SYNC_DEBOUNCE_SECONDS = Number(process.env.SYNC_DEBOUNCE_SECONDS ?? "60");

export const KEY_DIRTY_AMBARI = "sync:dirty:ambari";
export const KEY_DIRTY_RANGER = "sync:dirty:ranger";
export const KEY_DIRTY_HUE = "sync:dirty:hue";
export const KEY_DEBOUNCE_UNTIL = "sync:debounce:until";
export const KEY_RANGER_FORCE_DELETE_USERS = "sync:ranger:force_delete_users";
export const KEY_HUE_DIRTY_GROUPS = "sync:hue:groups";

const REDIS_CONNECT_TIMEOUT_MS = 5_000;

let clientPromise: Promise<RedisClientType> | undefined;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function getRedisClient(config: RedisConfig): Promise<RedisClientType> {
  if (!clientPromise) {
    const client: RedisClientType = createClient({ url: config.url });
    clientPromise = (async () => {
      await withTimeout(client.connect(), REDIS_CONNECT_TIMEOUT_MS, "Redis connect");
      return client;
    })();
    clientPromise.catch(() => {
      clientPromise = undefined;
    });
  }
  return clientPromise;
}

export function getSyncRedisUrl(): string {
  return REDIS_URL;
}

export function getSyncDebounceSeconds(): number {
  return SYNC_DEBOUNCE_SECONDS;
}

export function inferTargetsFromGroupCn(groupCn: string): SyncTarget[] {
  const cn = (groupCn ?? "").trim();
  const targets = new Set<SyncTarget>();

  if (!cn) return [];

  if (cn.startsWith("ambari_")) targets.add("ambari");
  if (cn.startsWith("ranger_")) targets.add("ranger");
  if (cn.startsWith("hue_")) targets.add("hue");

  return Array.from(targets);
}

export async function enqueueSync(
  targets: SyncTarget[],
  options?: { force?: boolean },
): Promise<{ enqueued: boolean }> {
  const uniqueTargets = Array.from(new Set(targets));
  if (!uniqueTargets.length) {
    return { enqueued: false };
  }

  const client = await getRedisClient({ url: REDIS_URL });

  const now = Date.now();
  const force = !!options?.force;
  const untilStr = await client.get(KEY_DEBOUNCE_UNTIL);
  const until = untilStr ? Number(untilStr) : 0;

  if (uniqueTargets.includes("ambari")) {
    await client.set(KEY_DIRTY_AMBARI, "1");
  }
  if (uniqueTargets.includes("ranger")) {
    await client.set(KEY_DIRTY_RANGER, "1");
  }
  if (uniqueTargets.includes("hue")) {
    await client.set(KEY_DIRTY_HUE, "1");
  }

  if (force) {
    await client.set(KEY_DEBOUNCE_UNTIL, String(now));
  } else if (!until || Number.isNaN(until) || until <= now) {
    await client.set(KEY_DEBOUNCE_UNTIL, String(now + SYNC_DEBOUNCE_SECONDS * 1000));
  }

  return { enqueued: true };
}

export async function enqueueRangerUserResync(
  username: string,
  options?: { force?: boolean },
): Promise<{ enqueued: boolean }> {
  const u = (username ?? "").trim();
  if (!u) {
    return { enqueued: false };
  }

  await markRangerUserForForceDelete(u);
  return enqueueSync(["ranger"], options);
}

export async function markRangerUserForForceDelete(username: string): Promise<{ marked: boolean }> {
  const u = (username ?? "").trim();
  if (!u) {
    return { marked: false };
  }

  const client = await getRedisClient({ url: REDIS_URL });
  await client.sAdd(KEY_RANGER_FORCE_DELETE_USERS, u);
  return { marked: true };
}

export async function markHueGroupForSync(groupCn: string): Promise<{ marked: boolean }> {
  const cn = (groupCn ?? "").trim();
  if (!cn) {
    return { marked: false };
  }

  const client = await getRedisClient({ url: REDIS_URL });
  await client.sAdd(KEY_HUE_DIRTY_GROUPS, cn);
  return { marked: true };
}

export async function enqueueSyncFromGroupCn(groupCn: string): Promise<{ enqueued: boolean }> {
  const cn = (groupCn ?? "").trim();
  if (cn.startsWith("hue_")) {
    await markHueGroupForSync(cn);
  }
  return enqueueSync(inferTargetsFromGroupCn(cn));
}

export async function enqueueSyncFromGroupCnWithOptions(
  groupCn: string,
  options?: { force?: boolean },
): Promise<{ enqueued: boolean }> {
  const cn = (groupCn ?? "").trim();
  if (cn.startsWith("hue_")) {
    await markHueGroupForSync(cn);
  }
  return enqueueSync(inferTargetsFromGroupCn(cn), options);
}

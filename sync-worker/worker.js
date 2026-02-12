import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createClient } from "redis";

const execFileAsync = promisify(execFile);

let cycleId = 0;

function ts() {
  return new Date().toISOString();
}

function fmtMeta(meta) {
  if (!meta) return "";
  try {
    return ` | ${JSON.stringify(meta)}`;
  } catch {
    return "";
  }
}

function logLine(level, scope, message, meta) {
  const lvl = String(level).toUpperCase().padEnd(5);
  const scp = String(scope).toUpperCase().padEnd(6);
  // eslint-disable-next-line no-console
  console.log(`${ts()} | ${lvl} | ${scp} | ${message}${fmtMeta(meta)}`);
}

function logInfo(scope, message, meta) {
  logLine("INFO", scope, message, meta);
}

function logDebug(scope, message, meta) {
  logLine("DEBUG", scope, message, meta);
}

function logOk(scope, message, meta) {
  logLine("OK", scope, message, meta);
}

function errToMeta(err) {
  if (!err || typeof err !== "object") return { err };

  const anyErr = /** @type {any} */ (err);

  const stdoutStr = typeof anyErr.stdout === "string" ? anyErr.stdout : undefined;
  const stderrStr = typeof anyErr.stderr === "string" ? anyErr.stderr : undefined;

  return {
    message: anyErr.message,
    code: anyErr.code,
    signal: anyErr.signal,
    cmd: anyErr.cmd,
    stdout: stdoutStr ? stdoutStr.slice(0, 500) : undefined,
    stdoutTail: stdoutStr ? stdoutStr.slice(-500) : undefined,
    stderr: stderrStr ? stderrStr.slice(0, 500) : undefined,
    stderrTail: stderrStr ? stderrStr.slice(-500) : undefined,
  };
}

function logError(scope, message, err, meta) {
  // eslint-disable-next-line no-console
  console.error(
    `${ts()} | ERROR | ${String(scope).toUpperCase().padEnd(6)} | ${message}${fmtMeta({
      ...meta,
      ...errToMeta(err),
    })}`,
  );
}

function shouldTreatAmbariExpectAsFailure(stdout, stderr) {
  const outRaw = typeof stdout === "string" ? stdout : "";
  const errRaw = typeof stderr === "string" ? stderr : "";
  const out = outRaw.replaceAll("\r", "");
  const err = errRaw.replaceAll("\r", "");

  const hasSuccessMarker =
    /Ambari Server 'sync-ldap' completed successfully\./i.test(out) ||
    /Completed LDAP Sync\./i.test(out) ||
    /LDAP Sync\.[\s\S]*Summary:/i.test(out) ||
    /completed successfully/i.test(out);

  // Expect runtime errors we already saw in the environment.
  if (err.includes("stty:") || err.includes("while executing") || err.includes("invoked from within")) {
    return true;
  }

  if (hasSuccessMarker) {
    return false;
  }

  // If we got to the password prompt but never moved forward, it didn't complete.
  if (
    out.includes("Enter Ambari Admin password:") &&
    !/Ambari Server 'sync-ldap' completed successfully\./i.test(out) &&
    !/Completed LDAP Sync\./i.test(out)
  ) {
    return true;
  }

  return false;
}

const REDIS_URL = process.env.SYNC_REDIS_URL ?? "redis://redis:6379";

const KEY_DIRTY_AMBARI = process.env.SYNC_KEY_DIRTY_AMBARI ?? "sync:dirty:ambari";
const KEY_DIRTY_RANGER = process.env.SYNC_KEY_DIRTY_RANGER ?? "sync:dirty:ranger";
const KEY_DIRTY_HUE = process.env.SYNC_KEY_DIRTY_HUE ?? "sync:dirty:hue";
const KEY_DEBOUNCE_UNTIL = process.env.SYNC_KEY_DEBOUNCE_UNTIL ?? "sync:debounce:until";
const KEY_HUE_DIRTY_GROUPS = process.env.SYNC_KEY_HUE_DIRTY_GROUPS ?? "sync:hue:groups";

const POLL_SECONDS = Number(process.env.SYNC_WORKER_POLL_SECONDS ?? "5");
const RETRY_SECONDS = Number(process.env.SYNC_WORKER_RETRY_SECONDS ?? "60");

const SSH_USER = process.env.SYNC_SSH_USER ?? "ldap-sync";
const SSH_KEY_PATH = process.env.SYNC_SSH_KEY_PATH ?? "/ssh/id_ed25519";

const AMBARI_HOST = process.env.SYNC_AMBARI_HOST ?? "srv-enodl-des-01";
const RANGER_HOST = process.env.SYNC_RANGER_HOST ?? "srv-enodl-des-02";
const HUE_HOST = process.env.SYNC_HUE_HOST ?? "srv-enodl-des-03";

const AMBARI_ADMIN_USER = process.env.SYNC_AMBARI_ADMIN_USER;
const AMBARI_ADMIN_PASSWORD = process.env.SYNC_AMBARI_ADMIN_PASSWORD;

const AMBARI_COMMAND =
  process.env.SYNC_AMBARI_COMMAND ?? "sudo -n ambari-server sync-ldap --all";

const RANGER_STOP_COMMAND =
  process.env.SYNC_RANGER_STOP_COMMAND ??
  "sudo -n /usr/odp/current/ranger-usersync/ranger-usersync-services.sh stop";

const RANGER_START_COMMAND =
  process.env.SYNC_RANGER_START_COMMAND ??
  "sudo -n /usr/odp/current/ranger-usersync/ranger-usersync-services.sh start";

const RANGER_RESTART_COMMAND = process.env.SYNC_RANGER_RESTART_COMMAND;

const RANGER_STATUS_COMMAND = process.env.SYNC_RANGER_STATUS_COMMAND;

const RANGER_PGREP_COMMAND =
  process.env.SYNC_RANGER_PGREP_COMMAND ??
  "sh -lc 'pgrep -fa -f " +
  "\"ranger-usersync|RangerUserSync|usersync\"" +
  " || pgrep -fa -f \"ranger\" || true'";

const RANGER_LOG_TAIL_COMMAND = process.env.SYNC_RANGER_LOG_TAIL_COMMAND;

const HUE_COMMAND_PREFIX =
  process.env.SYNC_HUE_COMMAND_PREFIX ??
  "sudo -n -u hue /usr/odp/current/hue-server/build/env/bin/hue import_ldap_group --import-members";

const HUE_SUPERUSER_RECONCILE_ENABLED = (process.env.SYNC_HUE_SUPERUSER_RECONCILE_ENABLED ?? "1") === "1";
const HUE_SUPERUSER_GROUP = (process.env.SYNC_HUE_SUPERUSER_GROUP ?? "hue_admin").trim();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasCommand(cmd) {
  return typeof cmd === "string" && cmd.trim().length > 0;
}

function shQuote(arg) {
  return `'${String(arg ?? "").replaceAll("'", `'\\''`)}'`;
}

async function runSsh(host, command) {
  const args = [
    "-i",
    SSH_KEY_PATH,
    "-o",
    "BatchMode=yes",
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
    `${SSH_USER}@${host}`,
    command,
  ];

  const { stdout, stderr } = await execFileAsync("ssh", args, {
    timeout: 15 * 60 * 1000,
    maxBuffer: 10 * 1024 * 1024,
  });

  return { stdout, stderr };
}

async function runHueGroupSync(groupCn) {
  const cn = String(groupCn ?? "").trim();
  if (!cn) {
    return { stdout: "", stderr: "" };
  }

  const cmd = `sh -lc ${shQuote(`${HUE_COMMAND_PREFIX} ${shQuote(cn)}`)}`;
  logInfo("hue", "sync group", { cycleId, host: HUE_HOST, groupCn: cn, commandPrefix: HUE_COMMAND_PREFIX });
  return runSsh(HUE_HOST, cmd);
}

async function runHueSuperuserReconcile() {
  if (!HUE_SUPERUSER_RECONCILE_ENABLED) {
    logDebug("hue", "superuser reconcile disabled", { cycleId, enabled: HUE_SUPERUSER_RECONCILE_ENABLED });
    return { stdout: "", stderr: "" };
  }

  const groupName = String(HUE_SUPERUSER_GROUP ?? "").trim();
  if (!groupName) {
    logDebug("hue", "superuser reconcile skipped (empty group)", { cycleId });
    return { stdout: "", stderr: "" };
  }

  // Reconcile Hue superuser flag based on membership of a Hue group.
  // Only affects EXTERNAL users, so local/manual superusers are not touched.
  const py = `
from django.contrib.auth.models import User, Group
from useradmin.models import UserProfile

GROUP = ${JSON.stringify(groupName)}

g = Group.objects.get(name=GROUP)
desired = set(g.user_set.values_list('username', flat=True))

promoted = 0
for u in User.objects.filter(username__in=desired):
    if not u.is_superuser or not u.is_staff:
        u.is_superuser = True
        u.is_staff = True
        u.save(update_fields=['is_superuser', 'is_staff'])
        promoted += 1

demoted = 0
qs = User.objects.filter(
    is_superuser=True,
    userprofile__creation_method=UserProfile.CreationMethod.EXTERNAL.name,
).exclude(username__in=desired)

for u in qs:
    u.is_superuser = False
    u.is_staff = False
    u.save(update_fields=['is_superuser', 'is_staff'])
    demoted += 1

print(f"hue_superuser_reconcile group={GROUP} desired={len(desired)} promoted={promoted} demoted={demoted}")
`;

  const cmd = `sh -lc ${shQuote(
    `sudo -n -u hue /usr/odp/current/hue-server/build/env/bin/hue shell <<'PY'\n${py}\nPY`
  )}`;
  logInfo("hue", "reconcile superusers", { cycleId, host: HUE_HOST, groupName });
  return runSsh(HUE_HOST, cmd);
}

async function runAmbariSync() {
  if (!AMBARI_ADMIN_USER || !AMBARI_ADMIN_PASSWORD) {
    logInfo("ambari", "running via plain ssh (no admin creds set)", { cycleId });
    return runSsh(AMBARI_HOST, AMBARI_COMMAND);
  }

  logInfo("ambari", "running via expect", {
    cycleId,
    host: AMBARI_HOST,
    command: AMBARI_COMMAND,
    adminUser: AMBARI_ADMIN_USER,
  });

  const sshArgs = [
    "-tt",
    "-i",
    SSH_KEY_PATH,
    "-o",
    "BatchMode=yes",
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
    `${SSH_USER}@${AMBARI_HOST}`,
    AMBARI_COMMAND,
  ];

  const script = `
    set timeout 900
    log_user 1
    spawn -noecho ssh ${sshArgs.map((a) => JSON.stringify(a)).join(" ")}
    expect {
      -re {Enter Ambari Admin login:} {
        send -- "${AMBARI_ADMIN_USER}\\r"
        exp_continue
      }
      -re {Enter Ambari Admin password:} {
        send -- "${AMBARI_ADMIN_PASSWORD}\\r"
        exp_continue
      }
      eof
    }
    catch wait result
    exit [lindex $result 3]
  `;

  const { stdout, stderr } = await execFileAsync("expect", ["-c", script], {
    timeout: 15 * 60 * 1000,
    maxBuffer: 10 * 1024 * 1024,
  });

  logDebug("ambari", "expect finished", {
    cycleId,
    stdout: stdout?.slice(0, 2000),
    stderr: stderr?.slice(0, 2000),
  });

  if (shouldTreatAmbariExpectAsFailure(stdout, stderr)) {
    const e = new Error("Ambari expect did not complete successfully");
    // @ts-ignore
    e.stdout = stdout;
    // @ts-ignore
    e.stderr = stderr;
    throw e;
  }

  return { stdout, stderr };
}

async function runOnce(client) {
  const now = Date.now();
  const untilStr = await client.get(KEY_DEBOUNCE_UNTIL);
  const until = untilStr ? Number(untilStr) : 0;

  if (until && !Number.isNaN(until) && now < until) {
    logDebug("worker", "debounce active", { cycleId, until, now, waitMs: until - now });
    return;
  }

  const [dirtyAmbari, dirtyRanger, dirtyHue] = await Promise.all([
    client.get(KEY_DIRTY_AMBARI),
    client.get(KEY_DIRTY_RANGER),
    client.get(KEY_DIRTY_HUE),
  ]);

  logDebug("worker", "dirty flags read", {
    cycleId,
    keyAmbari: KEY_DIRTY_AMBARI,
    keyRanger: KEY_DIRTY_RANGER,
    keyHue: KEY_DIRTY_HUE,
    dirtyAmbari,
    dirtyRanger,
    dirtyHue,
  });

  const shouldAmbari = dirtyAmbari === "1";
  const shouldRanger = dirtyRanger === "1";
  const shouldHue = dirtyHue === "1";

  if (shouldAmbari || shouldRanger || shouldHue) {
    cycleId += 1;
    logInfo("worker", "processing dirty flags", {
      cycleId,
      shouldAmbari,
      shouldRanger,
      shouldHue,
    });
  }

  if (!shouldAmbari && !shouldRanger && !shouldHue) {
    logDebug("worker", "no dirty flags; idle", { cycleId });
    return;
  }

  let ambariOk = !shouldAmbari;
  let rangerOk = !shouldRanger;
  let hueOk = !shouldHue;

  if (shouldAmbari) {
    try {
      await runAmbariSync();
      ambariOk = true;
      await client.del(KEY_DIRTY_AMBARI);
      logOk("ambari", "SYNC OK", { cycleId });
    } catch (e) {
      ambariOk = false;
      logError("ambari", "SYNC FAILED", e, { cycleId });
    }
  }

  if (shouldRanger) {
    try {
      if (hasCommand(RANGER_RESTART_COMMAND)) {
        logInfo("ranger", "restart usersync", { cycleId });
        await runSsh(RANGER_HOST, RANGER_RESTART_COMMAND);
      } else {
        if (hasCommand(RANGER_STOP_COMMAND)) {
          logInfo("ranger", "stop usersync", { cycleId });
          await runSsh(RANGER_HOST, RANGER_STOP_COMMAND);
        } else {
          logDebug("ranger", "stop usersync skipped (no command)", { cycleId });
        }

        if (hasCommand(RANGER_START_COMMAND)) {
          logInfo("ranger", "start usersync", { cycleId });
          await runSsh(RANGER_HOST, RANGER_START_COMMAND);
        } else {
          logDebug("ranger", "start usersync skipped (no command)", { cycleId });
        }
      }

      // Give the daemon a moment to initialize before checking status/logs.
      await sleep(3000);

      let statusRes = { stdout: "", stderr: "" };
      let statusOut = "";
      let statusUnsupported = true;

      if (RANGER_STATUS_COMMAND) {
        try {
          statusRes = await runSsh(RANGER_HOST, RANGER_STATUS_COMMAND);
        } catch (err) {
          // If the command exits non-zero (common when vendor scripts don't implement 'status'),
          // don't fail the whole sync cycle. We'll fall back to pgrep-based detection.
          const stdout = err?.stdout ?? "";
          const stderr = err?.stderr ?? "";
          statusRes = { stdout, stderr };
        }

        logDebug("ranger", "usersync status", {
          cycleId,
          stdout: statusRes.stdout?.slice(0, 2000),
          stderr: statusRes.stderr?.slice(0, 2000),
        });

        statusOut = `${statusRes.stdout ?? ""}\n${statusRes.stderr ?? ""}`.toLowerCase();

        // Some vendor scripts don't implement 'status' (only start/stop/restart/version).
        // In that case we fall back to a pgrep-based check.
        statusUnsupported =
          statusOut.includes("invalid argument [status]") ||
          statusOut.includes("only start") ||
          (statusOut.includes("usage:") && statusOut.includes("start") && statusOut.includes("stop"));
      }

      let pgrepOut = "";
      if (statusUnsupported) {
        const pgrepRes = await runSsh(RANGER_HOST, RANGER_PGREP_COMMAND);
        pgrepOut = `${pgrepRes.stdout ?? ""}\n${pgrepRes.stderr ?? ""}`;
        logDebug("ranger", "usersync pgrep", {
          cycleId,
          stdout: pgrepRes.stdout?.slice(0, 2000),
          stderr: pgrepRes.stderr?.slice(0, 2000),
        });
      }

      const pgrepLooksRunning = pgrepOut.trim().length > 0;

      const looksRunning =
        statusOut.includes("running") ||
        statusOut.includes("started") ||
        statusOut.includes("is running") ||
        statusOut.includes("active (running)") ||
        (statusUnsupported && pgrepLooksRunning);

      if (!looksRunning) {
        let logTailRes = { stdout: "", stderr: "" };
        if (RANGER_LOG_TAIL_COMMAND) {
          try {
            logTailRes = await runSsh(RANGER_HOST, RANGER_LOG_TAIL_COMMAND);
          } catch (tailErr) {
            logDebug("ranger", "log tail command failed (ignored)", { cycleId, ...errToMeta(tailErr) });
          }
        }
        const e = new Error("Ranger usersync did not report running after start");
        // @ts-ignore
        e.stdout = `status:\n${statusRes.stdout ?? ""}\n\npgrep:\n${pgrepOut}\n\nlogTail:\n${logTailRes.stdout ?? ""}`;
        // @ts-ignore
        e.stderr = `statusErr:\n${statusRes.stderr ?? ""}\n\nlogTailErr:\n${logTailRes.stderr ?? ""}`;
        throw e;
      }

      rangerOk = true;
      await client.del(KEY_DIRTY_RANGER);
      logOk("ranger", "SYNC OK", { cycleId });
    } catch (e) {
      rangerOk = false;
      logError("ranger", "SYNC FAILED", e, { cycleId });
    }
  }

  if (shouldHue) {
    try {
      const groups = await client.sMembers(KEY_HUE_DIRTY_GROUPS);
      const uniqueGroups = Array.from(new Set((groups ?? []).map((g) => String(g ?? "").trim()).filter(Boolean)));

      if (!uniqueGroups.length) {
        logInfo("hue", "no groups queued for selective sync; clearing dirty flag", {
          cycleId,
          keyDirty: KEY_DIRTY_HUE,
          keyGroups: KEY_HUE_DIRTY_GROUPS,
        });
        await client.del(KEY_DIRTY_HUE);
        hueOk = true;
      } else {
        logInfo("hue", "starting selective sync", {
          cycleId,
          host: HUE_HOST,
          groupCount: uniqueGroups.length,
          groups: uniqueGroups,
        });

        for (const cn of uniqueGroups) {
          await runHueGroupSync(cn);
        }

        if (uniqueGroups.includes(HUE_SUPERUSER_GROUP)) {
          await runHueSuperuserReconcile();
        }

        await client.del(KEY_DIRTY_HUE);
        await client.del(KEY_HUE_DIRTY_GROUPS);
        hueOk = true;
        logOk("hue", "SYNC OK", { cycleId, groupCount: uniqueGroups.length });
      }
    } catch (e) {
      hueOk = false;
      logError("hue", "SYNC FAILED", e, { cycleId });
    }
  }

  if (ambariOk && rangerOk && hueOk) {
    await client.del(KEY_DEBOUNCE_UNTIL);
    logOk("worker", "cycle completed", { cycleId, ambariOk, rangerOk, hueOk });
  } else {
    await client.set(KEY_DEBOUNCE_UNTIL, String(Date.now() + RETRY_SECONDS * 1000));
    logInfo("worker", "set retry debounce", {
      cycleId,
      retrySeconds: RETRY_SECONDS,
      ambariOk,
      rangerOk,
      hueOk,
    });
  }
}

async function main() {
  const client = createClient({ url: REDIS_URL });
  client.on("error", (err) => {
    logError("redis", "client error", err, { cycleId });
  });

  await client.connect();

  logInfo("worker", "started", {
    REDIS_URL,
    AMBARI_HOST,
    RANGER_HOST,
    HUE_HOST,
    POLL_SECONDS,
    RETRY_SECONDS,
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runOnce(client);
    } catch (err) {
      logError("worker", "loop error", err, { cycleId });
      await sleep(5000);
    }

    await sleep(POLL_SECONDS * 1000);
  }
}

main().catch((err) => {
  logError("worker", "fatal", err, { cycleId });
  process.exit(1);
});

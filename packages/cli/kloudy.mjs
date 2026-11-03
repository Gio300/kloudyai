#!/usr/bin/env node
// Adapted from the Apache-2.0 Kloudy scaffold for public integration use, 2026-09-27.
import { parseArgs, splitList } from "./lib/args.mjs";
import { resolveApi } from "./lib/config.mjs";
import { loadCard, readCard, saveCard } from "./lib/card.mjs";
import { applyPolicy, readPolicy } from "./lib/policy.mjs";
import { appendLocalCard, pushQueued, readDirectory } from "./lib/directory.mjs";
import { apiGet, apiPost, fetchResource, isUnreachableError, postJson } from "./lib/client.mjs";
import { appendSession, findConfirmedCard, isOpenedSession, openLocalSession } from "./lib/session.mjs";
import { localStatus } from "./lib/status.mjs";

function help() {
  console.log(`kloudy — destination integration CLI (experimental)

Offline-first. With no API configured, commands stay on this machine and do not throw.
API resolution: --api <url>, then KLOUDY_API, then ~/.kloudy/config.json {"api":"..."}.

  kloudy init
  kloudy allow read,act
  kloudy deny checkout
  kloudy allow --user --add read
  kloudy allow --user --remove read
  kloudy deny --user --add checkout
  kloudy deny --user --remove checkout
  kloudy confirm
  kloudy confirm --push
  kloudy run <url> [--mode read] [--fetch]
  kloudy status
  kloudy status --remote

Site allow and deny write ./.well-known/kloudy.json.
--user merges ~/.kloudy/policy.json and checks names against the card schema.

Local confirm appends the site card to ~/.kloudy/directory.json with verified "local".
confirm --push POSTs those queued entries to /v0/directory/confirm when an API is set.

Local run appends opened sessions to ~/.kloudy/sessions.jsonl.
--fetch opts in to a GET of the URL. Checkout is blocked unless a confirmed card allows it and it is verified.
When KLOUDY_BOTBOOZLE_URL is set in local mode, run POSTs there first and falls back locally if that service is unreachable.

status prints mode, the site card, user policy, and directory and session counts.
status --remote calls GET /v0/status.

When an API is configured, confirm and run keep the existing development contract:
POST /v0/directory/confirm with the site card, and POST /v0/sessions with {url, mode:"read", vis:"none"}.
`);
}

async function maybeFetch(url, flags, session) {
  if (!flags.fetch || !isOpenedSession(session)) return;
  await fetchResource(url);
}

async function openOffline(url, flags) {
  const body = { url, mode: flags.mode || "read", vis: flags.vis || "none" };
  const bot = process.env.KLOUDY_BOTBOOZLE_URL;
  if (typeof bot === "string" && bot.length > 0) {
    let remote;
    let usedRemote = false;
    try {
      remote = await postJson(bot, body, { timeout: 8000 });
      usedRemote = true;
    } catch (err) {
      if (!isUnreachableError(err)) throw err;
    }
    if (usedRemote) {
      await maybeFetch(url, flags, remote);
      if (isOpenedSession(remote)) appendSession(remote);
      return remote;
    }
  }

  const origin = new URL(url).origin;
  const session = openLocalSession(body, {
    card: findConfirmedCard(readDirectory(), origin),
    siteCard: readCard(),
    policy: readPolicy(),
  });
  await maybeFetch(url, flags, session);
  if (isOpenedSession(session)) appendSession(session);
  return session;
}

async function main() {
  const { cmd, positionals, flags } = parseArgs(process.argv.slice(2));
  const rest = positionals.slice(1);
  const api = resolveApi(flags.api);

  if (cmd === "help" || cmd === "--help") {
    help();
    return;
  }

  if (cmd === "init") {
    console.log("wrote", saveCard(loadCard()));
    return;
  }

  if (cmd === "allow" || cmd === "deny") {
    if (flags.user || flags.add.length || flags.remove.length) {
      if (!flags.user || (!flags.add.length && !flags.remove.length)) {
        throw new Error("Usage: kloudy " + cmd + " --user --add <name> | --remove <name>");
      }
      const path = applyPolicy(cmd === "allow" ? "allow" : "deny", {
        add: splitList(flags.add),
        remove: splitList(flags.remove),
      });
      console.log("wrote", path);
      return;
    }
    const card = loadCard();
    if (cmd === "allow") card.allow = (rest[0] || "read").split(",");
    else card.deny = (rest[0] || "").split(",");
    console.log("wrote", saveCard(card));
    return;
  }

  if (cmd === "confirm") {
    if (flags.push) {
      console.log(JSON.stringify(await pushQueued(api), null, 2));
      return;
    }
    if (api) {
      console.log(JSON.stringify(await apiPost(api, "/v0/directory/confirm", loadCard()), null, 2));
      return;
    }
    const card = appendLocalCard(loadCard());
    console.log(JSON.stringify({ status: "confirmed", card }, null, 2));
    return;
  }

  if (cmd === "run") {
    const url = rest[0];
    if (!url) throw new Error("Usage: kloudy run <url>");
    if (api) {
      const session = await apiPost(api, "/v0/sessions", { url, mode: "read", vis: "none" });
      console.log(JSON.stringify(session, null, 2));
      return;
    }
    console.log(JSON.stringify(await openOffline(url, flags), null, 2));
    return;
  }

  if (cmd === "status") {
    if (flags.remote) {
      console.log(JSON.stringify(await apiGet(api, "/v0/status"), null, 2));
      return;
    }
    console.log(JSON.stringify(localStatus(api), null, 2));
    return;
  }

  help();
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message || String(err));
  process.exitCode = 1;
});

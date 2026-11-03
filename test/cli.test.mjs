import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../packages/cli/lib/args.mjs";
import { isUnreachableError } from "../packages/cli/lib/client.mjs";
import { findConfirmedCard, openLocalSession } from "../packages/cli/lib/session.mjs";
import { loadSchema, schemaPath, validateCard, validatePolicy } from "../packages/cli/lib/validate.mjs";

const root = dirname(fileURLToPath(new URL(".", import.meta.url)));
const cli = join(root, "packages", "cli", "kloudy.mjs");
const sessionKeys = ["id", "url", "mode", "vis", "bot", "verified", "status", "opened"];

function envWith(home, extra = {}) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, ...extra };
  if (!Object.prototype.hasOwnProperty.call(extra, "KLOUDY_API")) delete env.KLOUDY_API;
  if (!Object.prototype.hasOwnProperty.call(extra, "KLOUDY_BOTBOOZLE_URL")) delete env.KLOUDY_BOTBOOZLE_URL;
  return env;
}

function runCli(args, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function withFixture(fn) {
  const dir = await mkdtemp(join(tmpdir(), "kloudy-cli-"));
  const home = join(dir, "home");
  const cwd = join(dir, "work");
  await mkdir(home, { recursive: true });
  await mkdir(cwd, { recursive: true });
  try {
    await fn({ home, cwd, env: envWith(home) });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function startServer(handler) {
  const hits = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const hit = { method: req.method, url: req.url, body: raw ? JSON.parse(raw) : null };
    hits.push(hit);
    const result = await handler(hit);
    res.writeHead(result.status || 200, { "content-type": "application/json" });
    res.end(JSON.stringify(result.body ?? {}));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        hits,
        url: "http://127.0.0.1:" + server.address().port,
        close: () => new Promise((done, reject) => server.close((err) => (err ? reject(err) : done()))),
      });
    });
  });
}

async function closedPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  return port;
}

function apiHandler(hit) {
  if (hit.method === "GET" && hit.url === "/v0/status") {
    return { body: { ok: true, sessions: [], pets: [], directory: [] } };
  }
  if (hit.method === "POST" && hit.url === "/v0/sessions") {
    return {
      body: {
        id: "ses_mock123",
        url: hit.body.url,
        mode: hit.body.mode,
        vis: hit.body.vis,
        bot: { id: "anon", kind: "agent" },
        verified: false,
        status: "unverified",
        opened: "2026-01-01T00:00:00.000Z",
      },
    };
  }
  if (hit.method === "POST" && hit.url === "/v0/directory/confirm") {
    return { body: { status: "confirmed", card: { ...hit.body, verified: true } } };
  }
  return { status: 404, body: { error: "not_found" } };
}

function assertSessionShape(session) {
  assert.deepEqual(Object.keys(session), sessionKeys);
  assert.match(session.id, /^ses_[a-z0-9]+$/);
  assert.equal(typeof session.verified, "boolean");
  assert.equal(Number.isNaN(Date.parse(session.opened)), false);
  assert.deepEqual(Object.keys(session.bot), ["id", "kind"]);
}

describe("validator and session rules", () => {
  test("validates cards and policy lists from the schema file", () => {
    const schema = loadSchema();
    assert.equal(schemaPath().endsWith(join("schemas", "kloudy.card.schema.json")), true);
    const example = JSON.parse(readFileSync(join(root, "schemas", "well-known.example.json"), "utf8"));
    assert.deepEqual(validateCard(example), []);
    for (const name of schema.properties.allow.items.enum) {
      assert.deepEqual(validatePolicy({ allow: [name], deny: ["custom"] }), []);
    }
    assert.ok(validatePolicy({ allow: ["not-a-capability"], deny: [] }).length > 0);
    assert.ok(validateCard({ ...example, origin: undefined, rate: { rpm: 1.5 } }).length > 0);
    assert.deepEqual(validateCard({ ...example, verified: "local", rate: { rpm: 30 } }), []);
  });

  test("parses flags without treating them as positionals", () => {
    const parsed = parseArgs(["--api=http://127.0.0.1:9", "run", "https://example.com/a", "--mode", "checkout", "--fetch"]);
    assert.equal(parsed.cmd, "run");
    assert.equal(parsed.flags.api, "http://127.0.0.1:9");
    assert.equal(parsed.flags.mode, "checkout");
    assert.equal(parsed.flags.fetch, true);
    assert.deepEqual(parsed.positionals, ["run", "https://example.com/a"]);
    const user = parseArgs(["allow", "--user", "--remove", "read", "--add", "act"]);
    assert.equal(user.flags.user, true);
    assert.deepEqual(user.flags.add, ["act"]);
    assert.deepEqual(user.flags.remove, ["read"]);
  });

  test("classifies connection failures as unreachable and HTTP errors as reached", () => {
    const refused = new TypeError("fetch failed");
    refused.cause = Object.assign(new Error("connect"), { code: "ECONNREFUSED" });
    assert.equal(isUnreachableError(refused), true);
    assert.equal(isUnreachableError(Object.assign(new Error("agg"), { errors: [Object.assign(new Error("dns"), { code: "ENOTFOUND" })] })), true);
    assert.equal(isUnreachableError(new Error("Service request failed: HTTP 500")), false);
  });

  test("ports session decisions for allow, deny, and checkout", () => {
    const url = "https://example.com/item";
    const read = openLocalSession({ url, mode: "read", vis: "none" }, {});
    assertSessionShape(read);
    assert.equal(read.mode, "read");
    assert.equal(read.vis, "none");
    assert.equal(read.verified, false);
    assert.equal(read.status, "unverified");
    assert.deepEqual(read.bot, { id: "anon", kind: "agent" });

    const wrap = openLocalSession({ url, mode: "wrap" }, {});
    assert.equal(wrap.status, "ok");
    assert.equal(wrap.verified, false);

    assert.deepEqual(openLocalSession({ url, mode: "checkout" }, {}), {
      status: "blocked",
      reason: "unverified-checkout",
      url,
    });

    const confirmed = { origin: "https://example.com", allow: ["read", "checkout"], deny: [], verified: "local" };
    const opened = openLocalSession({ url, mode: "checkout" }, { card: confirmed });
    assert.equal(opened.verified, true);
    assert.equal(opened.status, "ok");
    assert.equal(opened.mode, "checkout");

    assert.equal(openLocalSession({ url, mode: "checkout" }, {
      card: { origin: "https://example.com", allow: ["read"], verified: true },
    }).reason, "unverified-checkout");

    assert.equal(openLocalSession({ url, mode: "act" }, {
      card: { origin: "https://example.com", allow: ["read", "act"], deny: ["act"], verified: "local" },
    }).reason, "denied");

    assert.equal(openLocalSession({ url, mode: "read" }, { policy: { allow: ["act"], deny: [] } }).reason, "denied");
    assert.equal(openLocalSession({ url, mode: "read" }, { policy: { allow: [], deny: ["read"] } }).reason, "denied");
    assert.equal(openLocalSession({ url, mode: "checkout" }, {
      siteCard: { origin: "https://example.com", deny: ["checkout"] },
    }).reason, "denied");
    assert.equal(openLocalSession({ url, mode: "checkout" }, {
      siteCard: { origin: "https://other.example", deny: ["checkout"] },
    }).reason, "unverified-checkout");

    const entries = [
      { origin: "https://example.com", allow: ["read"], verified: "local" },
      { origin: "https://example.com", allow: ["checkout"], verified: "local" },
    ];
    assert.equal(findConfirmedCard(entries, "https://example.com").allow[0], "checkout");
    assert.equal(findConfirmedCard(entries, "https://other.example"), null);
  });
});

describe("offline CLI", () => {
  test("status, confirm, and run stay local when no API is configured", async () => {
    await withFixture(async ({ cwd, env }) => {
      const status = await runCli(["status"], { cwd, env });
      assert.equal(status.code, 0, status.stderr);
      assert.equal(status.stderr, "");
      assert.deepEqual(JSON.parse(status.stdout), {
        mode: "local",
        card: null,
        policy: null,
        directory: 0,
        sessions: 0,
      });

      const confirmed = await runCli(["confirm"], { cwd, env });
      assert.equal(confirmed.code, 0, confirmed.stderr);
      const body = JSON.parse(confirmed.stdout);
      assert.equal(body.status, "confirmed");
      assert.equal(body.card.verified, "local");
      assert.equal(body.card.origin, "https://example.com");
      const directory = JSON.parse(await readFile(join(env.HOME, ".kloudy", "directory.json"), "utf8"));
      assert.equal(directory.length, 1);
      assert.equal(directory[0].verified, "local");

      const again = await runCli(["confirm"], { cwd, env });
      assert.equal(JSON.parse(again.stdout).card.verified, "local");
      const appended = JSON.parse(await readFile(join(env.HOME, ".kloudy", "directory.json"), "utf8"));
      assert.equal(appended.length, 2);

      const run = await runCli(["run", "https://example.com/item"], { cwd, env });
      assert.equal(run.code, 0, run.stderr);
      const session = JSON.parse(run.stdout);
      assertSessionShape(session);
      assert.equal(session.url, "https://example.com/item");
      assert.equal(session.mode, "read");
      assert.equal(session.vis, "none");
      assert.equal(session.status, "ok");
      assert.equal(session.verified, true);

      const lines = (await readFile(join(env.HOME, ".kloudy", "sessions.jsonl"), "utf8")).trim().split("\n");
      assert.equal(lines.length, 1);
      assert.deepEqual(JSON.parse(lines[0]), session);

      const after = JSON.parse((await runCli(["status"], { cwd, env })).stdout);
      assert.equal(after.mode, "local");
      assert.equal(after.directory, 2);
      assert.equal(after.sessions, 1);
      assert.equal(after.card, null);
    });
  });

  test("site allow and deny rewrite the well-known card and reject unknown allow names", async () => {
    await withFixture(async ({ cwd, env }) => {
      const init = await runCli(["init"], { cwd, env });
      assert.equal(init.code, 0, init.stderr);
      assert.match(init.stdout, /wrote /);
      const cardPath = join(cwd, ".well-known", "kloudy.json");
      let card = JSON.parse(await readFile(cardPath, "utf8"));
      assert.deepEqual(card.allow, ["read"]);
      assert.deepEqual(card.deny, []);
      assert.equal(card.origin, "https://example.com");

      assert.equal((await runCli(["allow", "read,act"], { cwd, env })).code, 0);
      assert.equal((await runCli(["deny", "checkout"], { cwd, env })).code, 0);
      card = JSON.parse(await readFile(cardPath, "utf8"));
      assert.deepEqual(card.allow, ["read", "act"]);
      assert.deepEqual(card.deny, ["checkout"]);
      assert.equal(card.kloudy, "0.1");

      const bareDeny = await runCli(["deny"], { cwd, env });
      assert.equal(bareDeny.code, 0, bareDeny.stderr);
      assert.deepEqual(JSON.parse(await readFile(cardPath, "utf8")).deny, [""]);

      const bad = await runCli(["allow", "read,nope"], { cwd, env });
      assert.equal(bad.code, 1);
      assert.match(bad.stderr, /schema validation/);
      assert.deepEqual(JSON.parse(await readFile(cardPath, "utf8")).allow, ["read", "act"]);
    });
  });

  test("user policy add and remove merge and keep the previous file when validation fails", async () => {
    await withFixture(async ({ cwd, env }) => {
      const schema = loadSchema();
      for (const name of schema.properties.allow.items.enum) {
        const added = await runCli(["allow", "--user", "--add", name], { cwd, env });
        assert.equal(added.code, 0, added.stderr);
      }
      const policyPath = join(env.HOME, ".kloudy", "policy.json");
      let policy = JSON.parse(await readFile(policyPath, "utf8"));
      assert.deepEqual(policy.allow, schema.properties.allow.items.enum);
      assert.deepEqual(policy.deny, []);

      const removed = await runCli(["allow", "--user", "--remove", "act", "--add", "act"], { cwd, env });
      assert.equal(removed.code, 0, removed.stderr);
      policy = JSON.parse(await readFile(policyPath, "utf8"));
      assert.ok(policy.allow.includes("act"));
      assert.equal(policy.allow.indexOf("read") < policy.allow.indexOf("form"), true);

      assert.equal((await runCli(["deny", "--user", "--add", "checkout,custom"], { cwd, env })).code, 0);
      assert.equal((await runCli(["deny", "--user", "--remove", "custom"], { cwd, env })).code, 0);
      policy = JSON.parse(await readFile(policyPath, "utf8"));
      assert.deepEqual(policy.deny, ["checkout"]);

      const before = await readFile(policyPath, "utf8");
      const bad = await runCli(["allow", "--user", "--add", "not-a-capability"], { cwd, env });
      assert.equal(bad.code, 1);
      assert.match(bad.stderr, /schema validation/);
      assert.equal(await readFile(policyPath, "utf8"), before);

      const status = JSON.parse((await runCli(["status"], { cwd, env })).stdout);
      assert.deepEqual(status.policy.deny, ["checkout"]);
      assert.ok(Array.isArray(status.policy.allow));
    });
  });

  test("local run blocks checkout and deny rules without appending a session", async () => {
    await withFixture(async ({ cwd, env }) => {
      const blocked = await runCli(["run", "https://example.com/pay", "--mode", "checkout"], { cwd, env });
      assert.equal(blocked.code, 0, blocked.stderr);
      assert.deepEqual(JSON.parse(blocked.stdout), {
        status: "blocked",
        reason: "unverified-checkout",
        url: "https://example.com/pay",
      });
      assert.equal(existsSync(join(env.HOME, ".kloudy", "sessions.jsonl")), false);

      assert.equal((await runCli(["init"], { cwd, env })).code, 0);
      assert.equal((await runCli(["allow", "read,checkout"], { cwd, env })).code, 0);
      assert.equal((await runCli(["deny", "act"], { cwd, env })).code, 0);
      const denied = JSON.parse((await runCli(["run", "https://example.com/do", "--mode", "act"], { cwd, env })).stdout);
      assert.equal(denied.reason, "denied");
      const other = JSON.parse((await runCli(["run", "https://other.example/do", "--mode", "act"], { cwd, env })).stdout);
      assert.equal(other.status, "unverified");

      const unconfirmed = JSON.parse((await runCli(["run", "https://example.com/pay", "--mode", "checkout"], { cwd, env })).stdout);
      assert.equal(unconfirmed.reason, "unverified-checkout");

      assert.equal((await runCli(["confirm"], { cwd, env })).code, 0);
      const opened = JSON.parse((await runCli(["run", "https://example.com/pay", "--mode", "checkout"], { cwd, env })).stdout);
      assertSessionShape(opened);
      assert.equal(opened.mode, "checkout");
      assert.equal(opened.verified, true);
      assert.equal(opened.status, "ok");

      assert.equal((await runCli(["allow", "--user", "--add", "read"], { cwd, env })).code, 0);
      const policyBlocked = JSON.parse((await runCli(["run", "https://example.com/pay", "--mode", "checkout"], { cwd, env })).stdout);
      assert.equal(policyBlocked.reason, "denied");

      const sessions = (await readFile(join(env.HOME, ".kloudy", "sessions.jsonl"), "utf8")).trim().split("\n");
      assert.equal(sessions.length, 2);
    });
  });

  test("status reports online mode without calling a configured API", async () => {
    await withFixture(async ({ cwd, env, home }) => {
      const port = await closedPort();
      const local = await runCli(["status"], {
        cwd,
        env: envWith(home, { KLOUDY_API: "http://127.0.0.1:" + port }),
      });
      assert.equal(local.code, 0, local.stderr);
      assert.equal(JSON.parse(local.stdout).mode, "online");
      const remote = await runCli(["status", "--remote"], {
        cwd,
        env: envWith(home, { KLOUDY_API: "http://127.0.0.1:" + port }),
      });
      assert.equal(remote.code, 1);
      assert.match(remote.stderr, /ECONNREFUSED|fetch failed|Service request failed/);
    });
  });
});

describe("online API and botboozle", () => {
  test("uses --api, then KLOUDY_API, then config.json", async () => {
    await withFixture(async ({ cwd, home }) => {
      const mock = await startServer(apiHandler);
      const port = await closedPort();
      const closed = "http://127.0.0.1:" + port;
      try {
        await mkdir(join(home, ".kloudy"), { recursive: true });
        await writeFile(join(home, ".kloudy", "config.json"), JSON.stringify({ api: mock.url }) + "\n");
        const fromConfig = await runCli(["status", "--remote"], { cwd, env: envWith(home) });
        assert.equal(fromConfig.code, 0, fromConfig.stderr);
        assert.equal(mock.hits.at(-1).url, "/v0/status");
        assert.equal(mock.hits.at(-1).method, "GET");

        const fromEnv = await runCli(["status", "--remote"], { cwd, env: envWith(home, { KLOUDY_API: mock.url }) });
        assert.equal(fromEnv.code, 0, fromEnv.stderr);
        await writeFile(join(home, ".kloudy", "config.json"), JSON.stringify({ api: closed }) + "\n");
        const envBeatsFile = await runCli(["status", "--remote"], { cwd, env: envWith(home, { KLOUDY_API: mock.url }) });
        assert.equal(envBeatsFile.code, 0, envBeatsFile.stderr);

        const flagBeatsEnv = await runCli(["--api", mock.url, "status", "--remote"], {
          cwd,
          env: envWith(home, { KLOUDY_API: closed }),
        });
        assert.equal(flagBeatsEnv.code, 0, flagBeatsEnv.stderr);
        assert.equal(flagBeatsEnv.stdout, JSON.stringify({ ok: true, sessions: [], pets: [], directory: [] }, null, 2) + "\n");
      } finally {
        await mock.close();
      }
    });
  });

  test("confirm and run match the development service contract when an API is set", async () => {
    await withFixture(async ({ cwd, env, home }) => {
      const mock = await startServer(apiHandler);
      try {
        assert.equal((await runCli(["init"], { cwd, env })).code, 0);
        assert.equal((await runCli(["allow", "read,act"], { cwd, env })).code, 0);
        const cardPath = join(cwd, ".well-known", "kloudy.json");
        const before = await readFile(cardPath, "utf8");
        const card = JSON.parse(before);
        const onlineEnv = envWith(home, { KLOUDY_API: mock.url });
        const confirmed = await runCli(["confirm"], { cwd, env: onlineEnv });
        assert.equal(confirmed.code, 0, confirmed.stderr);
        assert.equal(mock.hits[0].method, "POST");
        assert.equal(mock.hits[0].url, "/v0/directory/confirm");
        assert.deepEqual(mock.hits[0].body, card);
        assert.equal(confirmed.stdout, JSON.stringify({ status: "confirmed", card: { ...card, verified: true } }, null, 2) + "\n");
        assert.equal(await readFile(cardPath, "utf8"), before);
        assert.equal(existsSync(join(home, ".kloudy", "directory.json")), false);

        const run = await runCli(["run", mock.url + "/page", "--mode", "checkout", "--fetch"], { cwd, env: onlineEnv });
        assert.equal(run.code, 0, run.stderr);
        assert.equal(mock.hits.length, 2);
        assert.equal(mock.hits[1].method, "POST");
        assert.equal(mock.hits[1].url, "/v0/sessions");
        assert.deepEqual(mock.hits[1].body, { url: mock.url + "/page", mode: "read", vis: "none" });
        assert.equal(run.stdout, JSON.stringify({
          id: "ses_mock123",
          url: mock.url + "/page",
          mode: "read",
          vis: "none",
          bot: { id: "anon", kind: "agent" },
          verified: false,
          status: "unverified",
          opened: "2026-01-01T00:00:00.000Z",
        }, null, 2) + "\n");

        const failing = await startServer(async () => ({ status: 500, body: { error: "nope" } }));
        try {
          const broke = await runCli(["run", "https://example.com"], { cwd, env: envWith(home, { KLOUDY_API: failing.url }) });
          assert.equal(broke.code, 1);
          assert.match(broke.stderr, /Service request failed: HTTP 500/);
        } finally {
          await failing.close();
        }
      } finally {
        await mock.close();
      }
    });
  });

  test("confirm --push posts only queued local entries", async () => {
    await withFixture(async ({ cwd, env, home }) => {
      const mock = await startServer(apiHandler);
      try {
        assert.equal((await runCli(["init"], { cwd, env })).code, 0);
        assert.equal((await runCli(["allow", "read"], { cwd, env })).code, 0);
        assert.equal((await runCli(["confirm"], { cwd, env })).code, 0);
        assert.equal((await runCli(["allow", "read,act"], { cwd, env })).code, 0);
        assert.equal((await runCli(["confirm"], { cwd, env })).code, 0);

        const missing = await runCli(["confirm", "--push"], { cwd, env });
        assert.equal(missing.code, 1);
        assert.match(missing.stderr, /Set KLOUDY_API/);
        let directory = JSON.parse(await readFile(join(home, ".kloudy", "directory.json"), "utf8"));
        assert.equal(directory.every((entry) => entry.verified === "local"), true);

        const pushed = await runCli(["confirm", "--push", "--api", mock.url], { cwd, env });
        assert.equal(pushed.code, 0, pushed.stderr);
        assert.equal(mock.hits.length, 2);
        assert.deepEqual(mock.hits.map((hit) => hit.url), ["/v0/directory/confirm", "/v0/directory/confirm"]);
        assert.deepEqual(mock.hits[0].body.allow, ["read"]);
        assert.deepEqual(mock.hits[1].body.allow, ["read", "act"]);
        assert.equal(mock.hits[0].body.verified, "local");
        assert.equal(mock.hits[1].body.verified, "local");
        const results = JSON.parse(pushed.stdout);
        assert.equal(results.length, 2);
        assert.equal(results[0].status, "confirmed");
        assert.equal(results[0].card.verified, true);
        directory = JSON.parse(await readFile(join(home, ".kloudy", "directory.json"), "utf8"));
        assert.equal(directory.every((entry) => entry.verified === true), true);

        const again = await runCli(["confirm", "--push", "--api", mock.url], { cwd, env });
        assert.equal(again.code, 0, again.stderr);
        assert.equal(again.stdout, "[]\n");
        assert.equal(mock.hits.length, 2);
      } finally {
        await mock.close();
      }
    });
  });

  test("--fetch GETs the URL only for an opened local session", async () => {
    await withFixture(async ({ cwd, env }) => {
      const mock = await startServer(async (hit) => {
        if (hit.method === "GET") return { body: { ok: true } };
        return { status: 404, body: { error: "not_found" } };
      });
      try {
        const blocked = await runCli(["run", mock.url + "/pay", "--mode", "checkout", "--fetch"], { cwd, env });
        assert.equal(blocked.code, 0, blocked.stderr);
        assert.equal(JSON.parse(blocked.stdout).reason, "unverified-checkout");
        assert.equal(mock.hits.length, 0);

        const opened = await runCli(["run", mock.url + "/doc", "--fetch"], { cwd, env });
        assert.equal(opened.code, 0, opened.stderr);
        assertSessionShape(JSON.parse(opened.stdout));
        assert.deepEqual(mock.hits.map((hit) => [hit.method, hit.url]), [["GET", "/doc"]]);

        const failing = await startServer(async () => ({ status: 404, body: { error: "missing" } }));
        try {
          const before = existsSync(join(env.HOME, ".kloudy", "sessions.jsonl"))
            ? (await readFile(join(env.HOME, ".kloudy", "sessions.jsonl"), "utf8")).trim().split("\n").length
            : 0;
          const failed = await runCli(["run", failing.url + "/missing", "--fetch"], { cwd, env });
          assert.equal(failed.code, 1);
          assert.match(failed.stderr, /Fetch failed: HTTP 404/);
          const after = (await readFile(join(env.HOME, ".kloudy", "sessions.jsonl"), "utf8")).trim().split("\n").length;
          assert.equal(after, before);
        } finally {
          await failing.close();
        }
      } finally {
        await mock.close();
      }
    });
  });

  test("botboozle is preferred locally and skipped when an API is configured", async () => {
    await withFixture(async ({ cwd, env, home }) => {
      const remoteSession = {
        id: "ses_remote1",
        url: "https://example.com/from-bot",
        mode: "checkout",
        vis: "none",
        bot: { id: "anon", kind: "agent" },
        verified: true,
        status: "ok",
        opened: "2026-02-02T00:00:00.000Z",
      };
      const bot = await startServer(async () => ({ body: remoteSession }));
      const api = await startServer(apiHandler);
      try {
        const preferred = await runCli(["run", "https://example.com/from-bot", "--mode", "checkout"], {
          cwd,
          env: envWith(home, { KLOUDY_BOTBOOZLE_URL: bot.url }),
        });
        assert.equal(preferred.code, 0, preferred.stderr);
        assert.equal(preferred.stdout, JSON.stringify(remoteSession, null, 2) + "\n");
        assert.equal(bot.hits.length, 1);
        assert.equal(bot.hits[0].method, "POST");
        assert.deepEqual(bot.hits[0].body, { url: "https://example.com/from-bot", mode: "checkout", vis: "none" });
        const logged = JSON.parse((await readFile(join(home, ".kloudy", "sessions.jsonl"), "utf8")).trim());
        assert.deepEqual(logged, remoteSession);

        const port = await closedPort();
        const fellBack = await runCli(["run", "https://example.com/local"], {
          cwd,
          env: envWith(home, { KLOUDY_BOTBOOZLE_URL: "http://127.0.0.1:" + port }),
        });
        assert.equal(fellBack.code, 0, fellBack.stderr);
        const session = JSON.parse(fellBack.stdout);
        assertSessionShape(session);
        assert.equal(session.url, "https://example.com/local");
        assert.notEqual(session.id, "ses_remote1");

        const online = await runCli(["run", "https://example.com/api"], {
          cwd,
          env: envWith(home, { KLOUDY_API: api.url, KLOUDY_BOTBOOZLE_URL: bot.url }),
        });
        assert.equal(online.code, 0, online.stderr);
        assert.equal(bot.hits.length, 1);
        assert.equal(api.hits.length, 1);
        assert.equal(api.hits[0].url, "/v0/sessions");
        assert.deepEqual(api.hits[0].body, { url: "https://example.com/api", mode: "read", vis: "none" });
      } finally {
        await bot.close();
        await api.close();
      }
    });
  });

  test("help lists offline commands and usage errors stay explicit", async () => {
    await withFixture(async ({ cwd, env }) => {
      const help = await runCli(["--help"], { cwd, env });
      assert.equal(help.code, 0, help.stderr);
      assert.match(help.stdout, /kloudy init/);
      assert.match(help.stdout, /--user/);
      assert.match(help.stdout, /--push/);
      assert.match(help.stdout, /--remote/);
      assert.match(help.stdout, /--fetch/);
      const unknown = await runCli(["nope"], { cwd, env });
      assert.equal(unknown.code, 1);
      assert.match(unknown.stdout, /kloudy init/);
      const usage = await runCli(["run"], { cwd, env });
      assert.equal(usage.code, 1);
      assert.match(usage.stderr, /Usage: kloudy run <url>/);
      const remote = await runCli(["status", "--remote"], { cwd, env });
      assert.equal(remote.code, 1);
      assert.match(remote.stderr, /Set KLOUDY_API to your authorized development service\./);
    });
  });
});

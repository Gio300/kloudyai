#!/usr/bin/env node
// Adapted from the Apache-2.0 Kloudy scaffold for public integration use, 2026-09-27.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const cmd = args[0] || "help";
const API = process.env.KLOUDY_API;

function help() {
  console.log(`kloudy — destination integration CLI (experimental)

  kloudy init
  kloudy allow read,act
  kloudy deny checkout
  kloudy confirm
  kloudy run <url>
  kloudy status
  kloudy bots list|search <words>|get <id>|sync|works <id>|broken <id>

Remote commands require KLOUDY_API for a service you are authorized to use.
`);
}

function cardPath() {
  return resolve(process.cwd(), ".well-known", "kloudy.json");
}

function loadCard() {
  const p = cardPath();
  if (!existsSync(p)) {
    return {
      kloudy: "0.1",
      origin: "https://example.com",
      allow: ["read"],
      deny: [],
      identity: "signed-bot",
      updated: new Date().toISOString(),
    };
  }
  return JSON.parse(readFileSync(p, "utf8"));
}

function saveCard(card) {
  mkdirSync(resolve(process.cwd(), ".well-known"), { recursive: true });
  card.updated = new Date().toISOString();
  writeFileSync(cardPath(), JSON.stringify(card, null, 2) + "\n");
  console.log("wrote", cardPath());
}

async function post(path, body) {
  if (!API) throw new Error("Set KLOUDY_API to your authorized development service.");
  const res = await fetch(API + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Service request failed: HTTP " + res.status);
  return res.json();
}

if (cmd === "bots") {
  const { botsCommand } = await import("./bots.mjs");
  try { await botsCommand(args.slice(1)); } catch (e) { console.error(e.message); process.exitCode = 1; }
} else if (cmd === "help" || cmd === "--help") help();
else if (cmd === "init") saveCard(loadCard());
else if (cmd === "allow") {
  const card = loadCard();
  card.allow = (args[1] || "read").split(",");
  saveCard(card);
} else if (cmd === "deny") {
  const card = loadCard();
  card.deny = (args[1] || "").split(",");
  saveCard(card);
} else if (cmd === "confirm") {
  console.log(JSON.stringify(await post("/v0/directory/confirm", loadCard()), null, 2));
} else if (cmd === "run") {
  if (!args[1]) throw new Error("Usage: kloudy run <url>");
  console.log(JSON.stringify(await post("/v0/sessions", { url: args[1], mode: "read", vis: "none" }), null, 2));
} else if (cmd === "status") {
  if (!API) throw new Error("Set KLOUDY_API to your authorized development service.");
  const res = await fetch(API + "/v0/status");
  if (!res.ok) throw new Error("Service request failed: HTTP " + res.status);
  console.log(JSON.stringify(await res.json(), null, 2));
} else {
  help();
  process.exit(1);
}

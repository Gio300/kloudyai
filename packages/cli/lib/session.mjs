import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { sessionsPath } from "./config.mjs";

export function findConfirmedCard(entries, origin) {
  if (!Array.isArray(entries)) return null;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i] && entries[i].origin === origin) return entries[i];
  }
  return null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function openLocalSession(body, context = {}) {
  const url = body.url || "https://kloudy.ai";
  const mode = body.mode || "read";
  const origin = new URL(url).origin;
  const card = context.card || null;
  const policy = context.policy || null;
  const siteCard = context.siteCard && context.siteCard.origin === origin ? context.siteCard : null;
  const deny = new Set([...list(policy?.deny), ...list(card?.deny), ...list(siteCard?.deny)]);

  if (deny.has(mode)) return { status: "blocked", reason: "denied", url };

  const policyAllow = list(policy?.allow);
  if (policyAllow.length > 0 && !policyAllow.includes(mode)) {
    return { status: "blocked", reason: "denied", url };
  }

  if (mode === "checkout" && (!card || !card.verified || !card.allow?.includes("checkout"))) {
    return { status: "blocked", reason: "unverified-checkout", url };
  }

  const known = Boolean(card) || mode === "wrap";
  return {
    id: "ses_" + Math.random().toString(36).slice(2, 10),
    url,
    mode,
    vis: body.vis || "none",
    bot: body.bot || { id: "anon", kind: "agent" },
    verified: Boolean(card?.verified),
    status: known ? "ok" : "unverified",
    opened: new Date().toISOString(),
  };
}

export function countSessions() {
  const path = sessionsPath();
  if (!existsSync(path)) return 0;
  return readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).length;
}

export function appendSession(session) {
  const path = sessionsPath();
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(session) + "\n");
}

export function isOpenedSession(session) {
  return Boolean(session && typeof session === "object" && typeof session.id === "string");
}

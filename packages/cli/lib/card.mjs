import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validateCard } from "./validate.mjs";

export function cardPath(cwd = process.cwd()) {
  return resolve(cwd, ".well-known", "kloudy.json");
}

export function defaultCard() {
  return {
    kloudy: "0.1",
    origin: "https://example.com",
    allow: ["read"],
    deny: [],
    identity: "signed-bot",
    updated: new Date().toISOString(),
  };
}

export function readCard(cwd = process.cwd()) {
  const path = cardPath(cwd);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadCard(cwd = process.cwd()) {
  return readCard(cwd) || defaultCard();
}

export function saveCard(card, cwd = process.cwd()) {
  const next = { ...card, updated: new Date().toISOString() };
  const errors = validateCard(next);
  if (errors.length) throw new Error("Card failed schema validation: " + errors.join("; "));
  const path = cardPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n");
  return path;
}

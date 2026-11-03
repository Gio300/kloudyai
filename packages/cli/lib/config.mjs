import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export function homeDirectory() {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

export function kloudyHome() {
  return join(homeDirectory(), ".kloudy");
}

export function configPath() {
  return join(kloudyHome(), "config.json");
}

export function policyPath() {
  return join(kloudyHome(), "policy.json");
}

export function directoryPath() {
  return join(kloudyHome(), "directory.json");
}

export function sessionsPath() {
  return join(kloudyHome(), "sessions.jsonl");
}

export function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error("Invalid JSON in " + path + ": " + (err.message || err));
  }
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

export function resolveApi(flag) {
  if (typeof flag === "string" && flag.length > 0) return flag;
  const fromEnv = process.env.KLOUDY_API;
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
  const config = readJson(configPath());
  if (config && typeof config.api === "string" && config.api.length > 0) return config.api;
  return null;
}

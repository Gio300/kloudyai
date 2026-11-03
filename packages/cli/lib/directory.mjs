import { directoryPath, readJson, writeJson } from "./config.mjs";
import { validateCard } from "./validate.mjs";
import { apiPost } from "./client.mjs";

export function readDirectory() {
  const data = readJson(directoryPath());
  if (data == null) return [];
  if (!Array.isArray(data)) throw new Error("directory.json must be an array");
  return data;
}

export function writeDirectory(entries) {
  writeJson(directoryPath(), entries);
}

export function appendLocalCard(card) {
  const errors = validateCard(card);
  if (errors.length) throw new Error("Card failed schema validation: " + errors.join("; "));
  const stored = structuredClone(card);
  stored.verified = "local";
  const entries = readDirectory();
  entries.push(stored);
  writeDirectory(entries);
  return stored;
}

export async function pushQueued(api) {
  if (!api) throw new Error("Set KLOUDY_API to your authorized development service.");
  const entries = readDirectory();
  const results = [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i]?.verified !== "local") continue;
    const result = await apiPost(api, "/v0/directory/confirm", entries[i]);
    entries[i] = result && result.card && typeof result.card === "object"
      ? result.card
      : { ...entries[i], verified: true };
    writeDirectory(entries);
    results.push(result);
  }
  return results;
}

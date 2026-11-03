import { policyPath, readJson, writeJson } from "./config.mjs";
import { validatePolicy } from "./validate.mjs";

function merge(list, { add, remove }) {
  const removing = new Set(remove);
  const next = list.filter((item) => !removing.has(item));
  for (const item of add) {
    if (!next.includes(item)) next.push(item);
  }
  return next;
}

export function readPolicy() {
  const policy = readJson(policyPath());
  if (policy == null) return null;
  if (typeof policy !== "object" || Array.isArray(policy)) throw new Error("policy.json must be an object");
  return policy;
}

export function savePolicy(policy) {
  const errors = validatePolicy(policy);
  if (errors.length) throw new Error("Policy failed schema validation: " + errors.join("; "));
  const path = policyPath();
  writeJson(path, policy);
  return path;
}

export function applyPolicy(kind, { add = [], remove = [] } = {}) {
  const current = readPolicy() || {};
  const policy = {
    ...current,
    allow: Array.isArray(current.allow) ? [...current.allow] : [],
    deny: Array.isArray(current.deny) ? [...current.deny] : [],
  };
  policy[kind] = merge(policy[kind], { add, remove });
  return savePolicy(policy);
}

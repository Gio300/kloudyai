const UNREACHABLE = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ECONNRESET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

export function isUnreachableError(err) {
  const seen = new Set();
  const pending = [err];
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if (current.name === "TimeoutError" || current.name === "AbortError") return true;
    if (current.code && UNREACHABLE.has(current.code)) return true;
    if (current.cause) pending.push(current.cause);
    if (Array.isArray(current.errors)) pending.push(...current.errors);
  }
  return false;
}

export async function postJson(url, body, { timeout } = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: timeout ? AbortSignal.timeout(timeout) : undefined,
  });
  if (!res.ok) throw new Error("Service request failed: HTTP " + res.status);
  return res.json();
}

export async function apiPost(api, path, body) {
  if (!api) throw new Error("Set KLOUDY_API to your authorized development service.");
  return postJson(api + path, body);
}

export async function apiGet(api, path) {
  if (!api) throw new Error("Set KLOUDY_API to your authorized development service.");
  const res = await fetch(api + path);
  if (!res.ok) throw new Error("Service request failed: HTTP " + res.status);
  return res.json();
}

export async function fetchResource(url) {
  const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("Fetch failed: HTTP " + res.status);
  await res.arrayBuffer();
  return res.status;
}

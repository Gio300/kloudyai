# Connect an existing destination

## Author a card

From your own site's project directory, invoke the CLI by its path or installed `kloudy` command:

```sh
kloudy init
kloudy allow read,act
kloudy deny checkout
```

Edit `.well-known/kloudy.json` to use your real origin and describe only capabilities you actually expose. The fictional example is not a verified destination. Serve the card at `https://your-domain/.well-known/kloudy.json`.

The v0.1 schema is an early draft. Existing MCP, OpenAPI, FHIR/SMART, or other supported machine endpoints provide the actual application behavior. A card does not generate a missing backend or grant a bot access to protected data.

## Offline-first use

The CLI runs locally when no API is configured. Missing configuration does not throw.

API resolution order is `--api <url>`, then `KLOUDY_API`, then `~/.kloudy/config.json` with an `api` string. On Windows and Unix the user directory is `HOME` or `USERPROFILE`.

`kloudy allow read,act` and `kloudy deny checkout` still replace those lists on `./.well-known/kloudy.json`. Per-user rules are separate:

```sh
kloudy allow --user --add read
kloudy allow --user --remove read
kloudy deny --user --add checkout
kloudy deny --user --remove checkout
```

Those commands merge `~/.kloudy/policy.json`. Allow names must be in the card schema enum (`read`, `act`, `form`, `checkout`, `wrap`). Deny entries are strings. The CLI checks writes with a small validator and does not add a dependency.

`kloudy confirm` with no API appends the current site card to `~/.kloudy/directory.json` and sets `verified` to `"local"`. That marker is local bookkeeping. It is not hosted verification and does not grant access to protected data.

`kloudy confirm --push` POSTs each queued `verified: "local"` entry to `/v0/directory/confirm` when an API is set. The service decides what to store and whether the origin is verified.

`kloudy run <url>` with no API opens a local session record in `~/.kloudy/sessions.jsonl`. The JSON uses the same session fields as the development service: `id`, `url`, `mode`, `vis`, `bot`, `verified`, `status`, and `opened`. A blocked result is `{status, reason, url}` and is not appended. Checkout is blocked unless a confirmed directory card for that origin is verified and lists `checkout` in `allow`. User-policy and card `deny` lists block a mode before a session is opened. A non-empty user `allow` list permits only those modes.

`--fetch` is opt-in. Local run does not contact the URL unless you pass it. In local mode, `KLOUDY_BOTBOOZLE_URL` is tried first with the same session body; if that host is unreachable, run continues locally.

`kloudy status` prints local state: `mode` (`local` or `online`), the on-disk site `card` or null, user `policy` or null, `directory` count, and `sessions` count. `mode` is `online` when an API is configured. The command still reads this machine unless you pass `--remote`.

## Development service requests

Set an API only for a service you are authorized to use. With an API configured, `confirm` and `run` keep the existing development contract and JSON shapes. `confirm` POSTs the site card to `/v0/directory/confirm`. `run <url>` POSTs `{url, mode: "read", vis: "none"}` to `/v0/sessions`. `status --remote` GETs `/v0/status`. These calls do not operate a local Kloudy platform. Authenticated production requests depend on the service's eventual documented authorization contract.

These are development contracts, not a guarantee that a public production endpoint exists. The server decides whether an origin is verified and whether an operation is permitted. A local `verified` value of `"local"` must not be read as that decision.

`packages/connector/grok.tools.json` records proposed tool vocabulary only. It has no parameter schemas or execution engine. `wrap`, checkout, deployment, and pet-related definitions must not be interpreted as generally available features.

## Proof

A useful proof demonstrates an actual supported read or advertised action and reports its source/result. Ownership confirmation, authorized access, and successful execution are separate facts. Treat missing capabilities and failed contact paths as incomplete integration rather than fabricating success.

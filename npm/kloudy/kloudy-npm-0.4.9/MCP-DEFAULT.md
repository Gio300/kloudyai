# MCP Default — Bot Profile Creation

**Public-facing note for kloudy-open (2026-09-28)**

When an MCP is registered with Kloudy or built with Kloudy's help, the **default** is that bots may create profiles on it. This is disclosed to providers at registration and in partner docs; any provider can opt out at any time from their Kloudy settings.

- Registry listing is metadata only — Kloudy still authenticates per provider through its own vault.
- The open default makes converted and registered MCPs maximally useful to the bot economy, which is the audience Kloudy is built for.
- Opt-out is immediate for new requests; in-flight actions complete or fail cleanly.
- Spam and abuse are handled by per-bot and per-provider rate limits and the session kill switch — not by closing the default.

See the full decision in kloudy-shared: `decisions/2026-09-28-mcp-registry-default-bot-profile-creation.md`.

# Kloudy AI — developer materials

Build destinations and integrations that work with Kloudy, the browser for bots.

This public repository contains the site-card schema, a card-authoring CLI, a draft connector vocabulary, examples, and integration documentation. It does not contain the Kloudy browser application, hosted execution service, directory implementation, permission authority, or operating infrastructure.

## Start here

For the current Kloudy installer, use [Kloudy setup](https://kloudy.ai/install). This repository retains earlier card-authoring materials.

The commands below assume an existing checkout. They require Node.js 20 or newer; no dependencies are required.

```sh
cd kloudyai
npm run check
node packages/cli/kloudy.mjs --help
```

Run `kloudy init` in your destination's project to create `.well-known/kloudy.json`. Edit the example origin to your own, describe your existing capabilities, and publish the card on the origin you control. See [the integration guide](docs/INTEGRATION.md).

Remote CLI requests require `KLOUDY_API` pointing to a service you are authorized to use. This repo does not include that server or assert that a public production API is available. Confirmation is a server-side ownership and capability check, not a client permission grant.

## Contents

| Material | Purpose |
| --- | --- |
| `schemas/` | Draft v0.1 card format and a fictional destination example. |
| `packages/cli/` | Author a card and make development requests to a configured service. |
| `packages/connector/` | Draft tool names; not an executable MCP server or complete SDK. |
| [Integration guide](docs/INTEGRATION.md) | Connect an existing destination to Kloudy. |
| [Public boundary](docs/PUBLIC_BOUNDARY.md) | What belongs in this repository. |

The interfaces are experimental. A listed tool name or schema mode does not imply a deployed feature. No client can grant itself verification, permissions, budgets, or access to protected data.

## License

Apache-2.0 applies to these public integration materials. You may reuse them under that license. It grants no access to Kloudy's private service implementation, credentials, production systems, or branding rights beyond those in the license. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

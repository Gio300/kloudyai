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

## Development service requests

Set `KLOUDY_API` to the HTTP(S) base URL of a service you are authorized to use. `confirm`, `run <url>`, and `status` send requests to that service; they do not operate a local Kloudy platform. Authenticated production requests depend on the service's eventual documented authorization contract.

The scaffold request shapes are POST `/v0/directory/confirm` with a card, POST `/v0/sessions` with `url` and `mode: read`, and GET `/v0/status`. These are development contracts, not a guarantee that a public production endpoint exists. The server decides whether an origin is verified and whether an operation is permitted.

`packages/connector/grok.tools.json` records proposed tool vocabulary only. It has no parameter schemas or execution engine. `wrap`, checkout, deployment, and pet-related definitions must not be interpreted as generally available features.

## Proof

A useful proof demonstrates an actual supported read or advertised action and reports its source/result. Ownership confirmation, authorized access, and successful execution are separate facts. Treat missing capabilities and failed contact paths as incomplete integration rather than fabricating success.

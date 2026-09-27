# Public repository boundary

This repository is public. Add only reviewed developer-facing integration materials: public schemas, client tools, fictional examples, compatibility tests, and integration documentation.

Do not add the product browser UI, glasses product adapter, API/server implementation, BBE internals, private planning, directory data, authorization or credential custody, deployment control, billing implementation, or production configuration. Do not copy another repository or its history wholesale.

Run `npm run check` before publishing changes. Update the explicit path allowlist only after reviewing the new files for this boundary. The check is a guardrail, not a substitute for reviewing contents. Remote feature availability and authority must not be inferred from schema examples.

import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';

const allowed = new Set([
  '.gitignore', '.github/workflows/public-check.yml', 'AGENTS.md',
  'README.md', 'LICENSE', 'NOTICE', 'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md', 'SECURITY.md', 'package.json',
  'docs/INTEGRATION.md', 'docs/PUBLIC_BOUNDARY.md',
  'packages/cli/kloudy.mjs',
  'packages/cli/lib/args.mjs', 'packages/cli/lib/card.mjs', 'packages/cli/lib/client.mjs',
  'packages/cli/lib/config.mjs', 'packages/cli/lib/directory.mjs', 'packages/cli/lib/policy.mjs',
  'packages/cli/lib/session.mjs', 'packages/cli/lib/status.mjs', 'packages/cli/lib/validate.mjs',
  'packages/connector/grok.tools.json',
  'schemas/kloudy.card.schema.json', 'schemas/well-known.example.json',
  'scripts/check-public.mjs',
  'test/cli.test.mjs', 'test/index.js', 'test/package.json'
]);
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
if (!tracked.length) throw new Error('Stage the reviewed public files before checking.');
for (const path of tracked) {
  if (!allowed.has(path)) throw new Error(`File requires public-boundary review: ${path}`);
  if (lstatSync(path).isSymbolicLink()) throw new Error(`Symlinks cannot be exported: ${path}`);
  if (path.endsWith('.json')) JSON.parse(readFileSync(path, 'utf8'));
}
for (const path of allowed) if (!tracked.includes(path)) throw new Error(`Missing expected public file: ${path}`);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (pkg.scripts.api || pkg.scripts.dashboard) throw new Error('Product/server commands must remain private.');
const cliHelp = execFileSync(process.execPath, ['packages/cli/kloudy.mjs', '--help'], { encoding: 'utf8' });
if (!cliHelp.includes('kloudy init')) throw new Error('CLI help smoke check failed.');
console.log(`Public boundary, JSON, and CLI checks passed (${tracked.length} reviewed files).`);

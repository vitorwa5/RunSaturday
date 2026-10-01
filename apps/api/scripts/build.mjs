// Bundles the API into dist/server.js. Workspace packages (@runsaturday/shared) are
// inlined because they ship TypeScript source; npm dependencies stay external.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@runsaturday/'));

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  // Match subpath imports such as @prisma/client/runtime/client as external too.
  external: external.flatMap((name) => [name, `${name}/*`]),
  logLevel: 'info',
});

import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = fs.readFileSync('bun.lock', 'utf8');
const expected = pkg.devDependencies?.esbuild;
if (!expected) throw new Error('Missing root devDependency: esbuild');
const match = expected.match(/^(?:\^|~)?(\d+\.\d+\.\d+)/);
if (!match) throw new Error(`Unsupported root esbuild range: ${expected}`);
const version = match[1];
const rootLine = lock.match(/^\s*"esbuild": \["esbuild@([^"\s]+)"/m);
if (!rootLine) throw new Error('bun.lock has no root esbuild package record');
if (rootLine[1] !== version) {
  throw new Error(`bun.lock root esbuild is ${rootLine[1]}, but package.json requires ${expected}. Regenerate bun.lock with Bun before release.`);
}
console.log(`Release dependency check passed: root esbuild ${rootLine[1]} satisfies ${expected}`);

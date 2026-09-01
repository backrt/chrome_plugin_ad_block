#!/usr/bin/env node
import { mkdir, rm, cp, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const STAGE = path.join(DIST, 'extension');
const ZIP = path.join(DIST, 'ai-ad-block.zip');

async function copyDir(from, to, filter) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (filter && !filter(entry.name, entry.isDirectory())) continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDir(src, dest);
    } else {
      await cp(src, dest);
    }
  }
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(STAGE, { recursive: true });

  await cp(path.join(ROOT, 'manifest.json'), path.join(STAGE, 'manifest.json'));
  await copyDir(path.join(ROOT, '_locales'), path.join(STAGE, '_locales'));
  await copyDir(path.join(ROOT, 'src'), path.join(STAGE, 'src'));
  await copyDir(path.join(ROOT, 'cosmetics'), path.join(STAGE, 'cosmetics'), (name) => name === 'snapshot.json');
  await copyDir(path.join(ROOT, 'icons'), path.join(STAGE, 'icons'), (name) => /^icon(16|32|48|128)\.png$/.test(name));
  await copyDir(path.join(ROOT, 'rules'), path.join(STAGE, 'rules'), (name, isDir) => {
    if (isDir) return false;
    return name.endsWith('.json') && name !== 'packaged-keys.json' && name !== 'packaged-revision.json';
  });

  await execFileAsync('zip', ['-r', '-q', ZIP, '.'], { cwd: STAGE });
  const { stdout } = await execFileAsync('du', ['-sh', ZIP]);
  console.log(`Wrote ${ZIP} (${stdout.trim().split('\t')[0]})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.join(ROOT, 'icons');
const SOURCE = path.join(ICONS, 'icon-source.png');

const PY = `
from pathlib import Path
from PIL import Image, ImageFilter
src = Path(${JSON.stringify(SOURCE)})
out = src.parent
master = Image.open(src).convert('RGBA')
for size in (16, 32, 48, 128):
    img = master.resize((size, size), Image.Resampling.LANCZOS)
    if size <= 32:
        img = img.filter(ImageFilter.UnsharpMask(radius=0.6, percent=140, threshold=1))
    img.save(out / f'icon{size}.png', 'PNG', optimize=True)
    print(f'icon{size}.png')
`;

async function main() {
  await access(SOURCE);
  const { stdout } = await execFileAsync('python3', ['-c', PY], { cwd: ROOT });
  console.log('已从 icons/icon-source.png 生成：', stdout.trim().replaceAll('\n', ', '));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

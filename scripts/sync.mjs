#!/usr/bin/env node
/**
 * Sync core/ → extension/lib/ and bundle content.js → content.bundle.js
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'core/src');
const DEST = join(ROOT, 'extension/lib');
const EXT = join(ROOT, 'extension');

rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });
cpSync(SRC, DEST, { recursive: true });
console.log('Synced core/src → extension/lib');

await esbuild.build({
  entryPoints: [join(EXT, 'content.js')],
  bundle: true,
  outfile: join(EXT, 'content.bundle.js'),
  format: 'iife',
  target: 'chrome100',
  logLevel: 'info',
});

console.log('Bundled extension/content.bundle.js');

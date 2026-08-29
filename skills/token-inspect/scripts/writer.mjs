#!/usr/bin/env node
/**
 * Portable Token Inspect CSS writer (any project).
 *
 * Reads token-inspect.config.json from the project root (cwd, or TOKEN_INSPECT_CONFIG).
 * Listens on 127.0.0.1:{writerPort} and applies exact from→to CSS edits under cssRoots.
 *
 * Usage (from project root):
 *   node ~/.cursor/skills/token-inspect/scripts/writer.mjs
 */

import { createServer } from 'node:http';
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from 'node:fs';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';

const HOST = '127.0.0.1';
const ROOT = resolve(process.env.TOKEN_INSPECT_ROOT || process.cwd());
const CONFIG_PATH = resolve(
  process.env.TOKEN_INSPECT_CONFIG || join(ROOT, 'token-inspect.config.json')
);

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `Missing config: ${CONFIG_PATH}\n` +
        'Copy ~/.cursor/skills/token-inspect/templates/token-inspect.config.json to the project root.'
    );
  }
  const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const cssRoots = Array.isArray(raw.cssRoots) ? raw.cssRoots : [];
  if (!cssRoots.length) {
    throw new Error('token-inspect.config.json must include non-empty cssRoots[]');
  }
  return {
    layers: raw.layers === 2 ? 2 : 3,
    cssRoots: cssRoots.map((p) => resolve(ROOT, String(p))),
    tokens: raw.tokens || {},
    writerPort: Number(raw.writerPort || process.env.TOKEN_INSPECT_WRITER_PORT || 7319),
    devOrigins: raw.devOrigins || [],
  };
}

const config = loadConfig();
const PORT = config.writerPort;
const ALLOWED_ROOTS = config.cssRoots.map((p) => resolve(p));

function json(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

const SOURCE_EXTS = new Set(['.css', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.svg']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'build']);

function collectCssFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) collectCssFiles(full, acc);
    } else if (entry.endsWith('.css')) acc.push(full);
  }
  return acc;
}

function collectSourceFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) collectSourceFiles(full, acc);
    } else if (SOURCE_EXTS.has(extnameLower(entry))) acc.push(full);
  }
  return acc;
}

function extnameLower(name) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

function buildCssIndex() {
  const index = new Map();
  for (const root of ALLOWED_ROOTS) {
    for (const abs of collectCssFiles(root)) {
      const base = abs.split(sep).pop();
      if (!index.has(base)) index.set(base, abs);
      else if (index.get(base) !== abs) index.set(base, '');
    }
  }
  return index;
}

function isAllowlisted(absPath) {
  const normalized = resolve(absPath);
  return ALLOWED_ROOTS.some((root) => {
    const prefix = root.endsWith(sep) ? root : root + sep;
    return normalized === root || normalized.startsWith(prefix);
  });
}

function assertAllowlisted(absPath, { source = false } = {}) {
  const normalized = resolve(absPath);
  if (!isAllowlisted(normalized)) {
    throw new Error(`Refusing path outside cssRoots: ${relative(ROOT, absPath)}`);
  }
  if (source) {
    if (!SOURCE_EXTS.has(extnameLower(normalized))) {
      throw new Error(`Refusing non-source file: ${absPath}`);
    }
    return;
  }
  if (!normalized.endsWith('.css')) {
    throw new Error(`Refusing non-CSS file: ${absPath}`);
  }
}

function resolveEditFile(edit, cssIndex) {
  const candidates = [edit.file, edit.sourcePath].filter(Boolean).map(String);

  for (const raw of candidates) {
    if (!raw || raw === 'inline' || raw === 'element.style') continue;

    let rel = raw.replace(/\\/g, '/').replace(/^\//, '');
    try {
      if (rel.includes('://')) rel = new URL(rel).pathname.replace(/^\//, '');
    } catch {
      // keep
    }
    rel = rel.split('?')[0];

    // Absolute-ish path containing a cssRoot segment
    for (const root of ALLOWED_ROOTS) {
      const rootRel = relative(ROOT, root).replace(/\\/g, '/');
      const marker = `/${rootRel}/`;
      const hay = `/${rel}`.replace(/\\/g, '/');
      const idx = hay.lastIndexOf(marker);
      if (idx !== -1) {
        const fromRoot = hay.slice(idx + marker.length);
        const abs = resolve(root, fromRoot);
        assertAllowlisted(abs);
        if (existsSync(abs)) return abs;
      }
    }

    // Project-relative path
    const absRel = resolve(ROOT, rel);
    if (existsSync(absRel) && absRel.endsWith('.css')) {
      assertAllowlisted(absRel);
      return absRel;
    }

    // Known token files from config
    for (const tokenPath of Object.values(config.tokens || {})) {
      if (!tokenPath) continue;
      const base = String(tokenPath).split('/').pop();
      if (rel === tokenPath || rel.endsWith(`/${base}`) || rel === base) {
        const abs = resolve(ROOT, tokenPath);
        assertAllowlisted(abs);
        if (existsSync(abs)) return abs;
      }
    }

    // Basename index
    const base = rel.split('/').pop();
    const abs = cssIndex.get(base);
    if (abs) {
      assertAllowlisted(abs);
      return abs;
    }
    if (abs === '') throw new Error(`Ambiguous CSS filename: ${base}`);
  }

  throw new Error(
    `Cannot resolve CSS file: ${edit.file || edit.sourcePath || '(missing)'}. ` +
      'Reload the page so Vite exposes a file path, or set tokens.* in token-inspect.config.json.'
  );
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function skipCommentOrString(css, i) {
  if (css[i] === '/' && css[i + 1] === '*') {
    const end = css.indexOf('*/', i + 2);
    return end === -1 ? css.length : end + 2;
  }
  const q = css[i];
  if (q === '"' || q === "'") {
    let j = i + 1;
    while (j < css.length && css[j] !== q) {
      if (css[j] === '\\') j += 1;
      j += 1;
    }
    return Math.min(j + 1, css.length);
  }
  return i;
}

function indexOfMatchingBrace(css, openIdx) {
  let depth = 0;
  let i = openIdx;
  while (i < css.length) {
    const skipped = skipCommentOrString(css, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

function walkStyleRules(css, from, to, visit) {
  let i = from;
  let preludeStart = from;
  while (i < to) {
    const skipped = skipCommentOrString(css, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    if (css[i] === '{') {
      const prelude = css.slice(preludeStart, i).replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
      const close = indexOfMatchingBrace(css, i);
      if (close === -1 || close > to) return;
      const bodyStart = i + 1;
      const bodyEnd = close;
      if (prelude.startsWith('@')) {
        walkStyleRules(css, bodyStart, Math.min(bodyEnd, to), visit);
      } else if (prelude) {
        visit({ selector: prelude, bodyStart, bodyEnd });
      }
      i = close + 1;
      preludeStart = i;
      continue;
    }
    i += 1;
  }
}

function normalizeSelector(selector) {
  return String(selector || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

function findRuleBlocks(css, selector) {
  const want = normalizeSelector(selector);
  if (!want) return [];
  const hits = [];
  walkStyleRules(css, 0, css.length, (block) => {
    if (normalizeSelector(block.selector) === want) hits.push(block);
  });
  return hits;
}

/** Browser CSSOM writes `0px`; source often uses unitless `0`. */
function normalizeCssValue(value) {
  let s = String(value ?? '').trim().replace(/\s+/g, ' ');
  let important = false;
  if (/\s*!important$/i.test(s)) {
    important = true;
    s = s.replace(/\s*!important$/i, '').trim();
  }
  s = s
    .split(/\s+/)
    .map((tok) =>
      /^-?0*\.?0+(?:px|em|rem|pt|pc|in|cm|mm|ex|ch|vw|vh|vmin|vmax|%)$/i.test(tok) ? '0' : tok
    )
    .join(' ');
  return important ? `${s} !important` : s;
}

function cssValuesEquivalent(a, b) {
  return normalizeCssValue(a) === normalizeCssValue(b);
}

function valueForWrite(to) {
  return normalizeCssValue(to);
}

function collectEquivalentDecls(css, property, from) {
  const re = new RegExp(
    `(^|[^\\w-])(${escapeRegExp(property)}\\s*:\\s*)([^;]+?)(\\s*;)`,
    'gi'
  );
  /** @type {Array<{ index: number, pre: string, value: string, semi: string, length: number }>} */
  const hits = [];
  let m;
  while ((m = re.exec(css))) {
    if (!cssValuesEquivalent(m[3], from)) continue;
    hits.push({
      index: m.index + m[1].length,
      pre: m[2],
      value: m[3],
      semi: m[4],
      length: m[2].length + m[3].length + m[4].length,
    });
  }
  return hits;
}

function replaceDeclHit(css, hit, to) {
  return (
    css.slice(0, hit.index) + hit.pre + valueForWrite(to) + hit.semi + css.slice(hit.index + hit.length)
  );
}

function applyPropertyEdit(css, edit) {
  const { selector, property, from, to } = edit;
  if (!property || from == null || to == null) {
    throw new Error('Property edit requires property, from, to');
  }
  if (cssValuesEquivalent(from, to)) return { css, changed: false };

  if (selector && selector !== 'element.style' && !selector.startsWith('element.')) {
    const blocks = findRuleBlocks(css, selector);
    const scoped = [];
    for (const block of blocks) {
      const slice = css.slice(block.bodyStart, block.bodyEnd);
      const found = collectEquivalentDecls(slice, property, from);
      if (found.length) scoped.push({ block, found });
    }
    if (scoped.length === 1 && scoped[0].found.length === 1) {
      const { block, found } = scoped[0];
      const slice = css.slice(block.bodyStart, block.bodyEnd);
      return {
        css: css.slice(0, block.bodyStart) + replaceDeclHit(slice, found[0], to) + css.slice(block.bodyEnd),
        changed: true,
      };
    }
    if (scoped.length > 1 || scoped.some((s) => s.found.length > 1)) {
      throw new Error(
        `Ambiguous: found multiple \`${property}\` matches for selector \`${selector}\``
      );
    }
    if (blocks.length && !scoped.length) {
      throw new Error(
        `Could not find \`${property}: ${from}\` in selector \`${selector}\``
      );
    }
  }

  const matches = collectEquivalentDecls(css, property, from);
  if (!matches.length) {
    throw new Error(`Could not find \`${property}: ${from}\` in file`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous: found ${matches.length} matches for \`${property}: ${from}\` — include a selector`
    );
  }
  return {
    css: replaceDeclHit(css, matches[0], to),
    changed: true,
  };
}

function applyTokenEdit(css, edit) {
  const { tokenName, from, to } = edit;
  if (!tokenName || from == null || to == null) {
    throw new Error('Token edit requires tokenName, from, to');
  }
  if (cssValuesEquivalent(from, to)) return { css, changed: false };

  const declRe = new RegExp(
    `(${escapeRegExp(tokenName)}\\s*:\\s*)([^;]+?)(\\s*;)`,
    'g'
  );
  const hits = [];
  let m;
  while ((m = declRe.exec(css))) {
    if (cssValuesEquivalent(m[2], from)) hits.push(m);
  }
  if (!hits.length) {
    throw new Error(`Could not find \`${tokenName}: ${from}\` in file`);
  }
  if (hits.length > 1) {
    throw new Error(`Ambiguous: found ${hits.length} matches for \`${tokenName}: ${from}\``);
  }
  const hit = hits[0];
  const next = css.slice(0, hit.index) + hit[1] + valueForWrite(to) + hit[3] + css.slice(hit.index + hit[0].length);
  return { css: next, changed: true };
}

function pathAttrPatterns(d) {
  const escaped = escapeRegExp(d);
  return [
    new RegExp(`(d\\s*=\\s*")${escaped}(")`, 'g'),
    new RegExp(`(d\\s*=\\s*')${escaped}(')`, 'g'),
    new RegExp(`(d\\s*=\\s*\\{\\s*\`)${escaped}(\`\\s*\\})`, 'g'),
    new RegExp(`(d\\s*=\\s*\\{\\s*")${escaped}("\\s*\\})`, 'g'),
  ];
}

function matchPathAttr(source, d) {
  for (const re of pathAttrPatterns(d)) {
    re.lastIndex = 0;
    const matches = source.match(re);
    if (matches?.length) return { re, count: matches.length };
  }
  return { re: null, count: 0 };
}

function applySvgPathEdit(source, edit) {
  const { from, to } = edit;
  if (from === to) return { css: source, changed: false };
  if (!from || !to) throw new Error('svg-path edit requires from and to path data');

  const found = matchPathAttr(source, from);
  if (found.count === 0) {
    throw new Error(`Could not find path d="${from.slice(0, 80)}${from.length > 80 ? '…' : ''}" in source`);
  }
  if (found.count > 1) {
    throw new Error(
      `Ambiguous: found ${found.count} matches for that path d — make sure the icon path is unique`
    );
  }

  found.re.lastIndex = 0;
  const next = source.replace(found.re, (_, pre, post) => `${pre}${to}${post}`);
  return { css: next, changed: true };
}

function findSvgPathFile(from) {
  const files = [];
  for (const root of ALLOWED_ROOTS) collectSourceFiles(root, files);
  const hits = [];
  for (const abs of files) {
    const text = readFileSync(abs, 'utf8');
    if (matchPathAttr(text, from).count > 0) hits.push(abs);
  }
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) {
    throw new Error(
      'Could not find path d in cssRoots. The live SVG d must match source (e.g. icons.tsx).'
    );
  }
  throw new Error(
    `Ambiguous path d found in ${hits.map((p) => relative(ROOT, p)).join(', ')}`
  );
}

function validateEditShape(edit) {
  if (!edit || typeof edit !== 'object') throw new Error('Invalid edit');
  if (edit.kind !== 'property' && edit.kind !== 'token' && edit.kind !== 'svg-path') {
    throw new Error(`Unsupported edit kind: ${edit.kind}`);
  }
  if (typeof edit.from !== 'string' || typeof edit.to !== 'string') {
    throw new Error('Edit requires string from/to');
  }
  if (edit.kind !== 'svg-path' && (edit.to.includes('</') || edit.from.includes('</'))) {
    throw new Error('Refusing HTML-like content in CSS values');
  }
}

function applyEdits(edits) {
  const cssIndex = buildCssIndex();
  /** @type {Map<string, { abs: string, css: string, dirty: boolean }>} */
  const files = new Map();
  const results = [];

  for (const [index, edit] of edits.entries()) {
    try {
      validateEditShape(edit);
      let abs;
      if (edit.kind === 'svg-path') {
        if (edit.file) {
          abs = resolve(ROOT, edit.file);
          assertAllowlisted(abs, { source: true });
          if (!existsSync(abs)) throw new Error(`File not found: ${edit.file}`);
        } else {
          abs = findSvgPathFile(edit.from);
        }
      } else {
        abs = resolveEditFile(edit, cssIndex);
      }
      const rel = relative(ROOT, abs);

      if (!files.has(abs)) {
        files.set(abs, { abs, css: readFileSync(abs, 'utf8'), dirty: false });
      }
      const entry = files.get(abs);
      const applied =
        edit.kind === 'svg-path'
          ? applySvgPathEdit(entry.css, edit)
          : edit.kind === 'property'
            ? applyPropertyEdit(entry.css, edit)
            : applyTokenEdit(entry.css, edit);

      entry.css = applied.css;
      if (applied.changed) entry.dirty = true;

      results.push({
        index,
        ok: true,
        file: rel,
        kind: edit.kind,
        changed: applied.changed,
      });
    } catch (err) {
      results.push({
        index,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        kind: edit?.kind,
      });
    }
  }

  const written = [];
  if (results.some((r) => !r.ok)) {
    return {
      ok: false,
      message: 'One or more edits failed — no files were written',
      results,
      written,
    };
  }

  for (const entry of files.values()) {
    if (!entry.dirty) continue;
    writeFileSync(entry.abs, entry.css, 'utf8');
    written.push(relative(ROOT, entry.abs));
  }

  return {
    ok: true,
    message: written.length ? `Wrote ${written.length} file(s)` : 'No file changes needed',
    results,
    written,
  };
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, {
      ok: true,
      service: 'token-inspect-writer',
      root: ROOT,
      config: CONFIG_PATH,
      cssRoots: ALLOWED_ROOTS.map((p) => relative(ROOT, p)),
      layers: config.layers,
      port: PORT,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/apply') {
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const edits = Array.isArray(body.edits) ? body.edits : null;
      if (!edits || edits.length === 0) {
        json(res, 400, { ok: false, message: 'Body must include non-empty edits[]' });
        return;
      }
      if (edits.length > 100) {
        json(res, 400, { ok: false, message: 'Too many edits (max 100)' });
        return;
      }

      const outcome = applyEdits(edits);
      json(res, outcome.ok ? 200 : 422, outcome);
    } catch (err) {
      json(res, 400, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  json(res, 404, { ok: false, message: 'Not found. Use GET /health or POST /apply' });
});

server.listen(PORT, HOST, () => {
  console.log(`Token Inspect writer listening on http://${HOST}:${PORT}`);
  console.log(`Project root: ${ROOT}`);
  console.log(`Config: ${CONFIG_PATH}`);
  console.log(
    `Allowlisted cssRoots: ${ALLOWED_ROOTS.map((p) => relative(ROOT, p)).join(', ')}`
  );
  console.log('POST /apply  { "edits": [ ... ] }');
});

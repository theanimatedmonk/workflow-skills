import {
  ALLOWED_LITERALS,
  LENGTH_PROPERTIES_RE,
  NAKED_COLOR_RE,
  NAKED_LENGTH_RE,
  NAKED_RGB_RE,
  PRIMITIVE_VAR_RE,
  SKIP_FILE_NAMES,
} from './constants.mjs';
import { classifyToken, extractVarRefs, traceToken } from './registry.mjs';

export function isAllowedLiteral(value) {
  const trimmed = value.trim();
  if (ALLOWED_LITERALS.has(trimmed)) return true;
  if (/^\d+(\.\d+)?%$/.test(trimmed)) return true;
  if (/^\d+\s*\/\s*\d+$/.test(trimmed)) return true;
  if (/^calc\(/i.test(trimmed)) return true;
  if (/^clamp\(/i.test(trimmed)) return true;
  if (/^min\(/i.test(trimmed)) return true;
  if (/^max\(/i.test(trimmed)) return true;
  if (/^color-mix\(/i.test(trimmed)) return true;
  if (/^rgb\(from\s+var\(/i.test(trimmed)) return true;
  if (/^cubic-bezier\(/i.test(trimmed)) return true;
  if (/^translateX?\(/i.test(trimmed)) return true;
  if (/^var\(/.test(trimmed)) return true;
  return false;
}

export function stripVarFallbacks(value) {
  return value.replace(/var\([^)]+\)/g, ' ');
}

/**
 * @param {string} filePath
 */
export function shouldSkipFile(filePath) {
  const name = filePath.split(/[/\\]/).pop() ?? filePath;
  return SKIP_FILE_NAMES.has(name);
}

/**
 * @param {{
 *   file?: string,
 *   line?: number,
 *   property?: string,
 *   value: string,
 *   context: 'declaration' | 'custom-property',
 *   tokenRegistry: Map<string, { value: string, file: string, layer: string }>,
 *   showTrace?: boolean,
 *   selector?: string,
 * }} input
 */
export function auditValue(input) {
  const { file = '', line, property, value, context, tokenRegistry, showTrace = false, selector } =
    input;
  /** @type {Array<{ severity: string, rule: string, file: string, line?: number, property?: string, value: string, message: string, trace?: string[], selector?: string }>} */
  const findings = [];

  if (context !== 'declaration') return findings;

  let primitiveMatch;
  const primitiveRe = new RegExp(PRIMITIVE_VAR_RE.source, 'g');
  while ((primitiveMatch = primitiveRe.exec(value)) !== null) {
    findings.push({
      severity: 'error',
      rule: 'no-primitive-in-component',
      file,
      line,
      property,
      value: value.trim(),
      message: `Component CSS must not reference primitive token ${primitiveMatch[1]} directly — use a semantic or component token.`,
      trace: showTrace ? traceToken(primitiveMatch[1], tokenRegistry) : undefined,
      selector,
    });
  }

  for (const ref of extractVarRefs(value)) {
    if (!tokenRegistry.has(ref) && !ref.match(/^--[a-z]+-/)) {
      if (classifyToken(ref, tokenRegistry) === 'component' && !tokenRegistry.has(ref)) {
        // local --block-token defined in same file may not be in registry yet; skip
      }
    }
  }

  const nakedProbe = stripVarFallbacks(value);

  if (NAKED_COLOR_RE.test(nakedProbe)) {
    findings.push({
      severity: 'error',
      rule: 'no-naked-color',
      file,
      line,
      property,
      value: value.trim(),
      message: 'Hardcoded color found — use a semantic or component token via var().',
      selector,
    });
  } else if (NAKED_RGB_RE.test(nakedProbe) && !/rgb\(from\s+var\(/i.test(value)) {
    findings.push({
      severity: 'error',
      rule: 'no-naked-color',
      file,
      line,
      property,
      value: value.trim(),
      message: 'Hardcoded rgb/rgba color found — use a token via var().',
      selector,
    });
  }

  if (property && LENGTH_PROPERTIES_RE.test(property)) {
    const lengthMatch = nakedProbe.match(NAKED_LENGTH_RE);
    if (lengthMatch && !isAllowedLiteral(lengthMatch[0])) {
      findings.push({
        severity: 'warn',
        rule: 'no-naked-length',
        file,
        line,
        property,
        value: value.trim(),
        message: `Hardcoded length ${lengthMatch[0]} — prefer a spacing/size token.`,
        selector,
      });
    }
  }

  if (property === 'z-index' && /^\d+$/.test(value.trim())) {
    findings.push({
      severity: 'warn',
      rule: 'no-naked-z-index',
      file,
      line,
      property,
      value: value.trim(),
      message: 'Hardcoded z-index — prefer --primitive-z-* via a component token.',
      selector,
    });
  }

  return findings;
}

/**
 * @param {string} cssText
 * @param {string} file
 * @param {{
 *   tokenRegistry: Map<string, { value: string, file: string, layer: string }>,
 *   showTrace?: boolean,
 * }} options
 */
export function auditCssText(cssText, file, options) {
  if (shouldSkipFile(file)) return [];

  const { tokenRegistry, showTrace = false } = options;
  /** @type {ReturnType<typeof auditValue>} */
  const findings = [];
  const lines = cssText.split('\n');
  let inKeyframes = false;
  let inPropertyBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.split('/*')[0].trim();
    if (!line) continue;

    if (/^@keyframes\b/.test(line)) inKeyframes = true;
    if (inKeyframes && line === '}') inKeyframes = false;
    if (inKeyframes) continue;

    if (/^@property\b/.test(line)) inPropertyBlock = true;
    if (inPropertyBlock) {
      if (line === '}') inPropertyBlock = false;
      continue;
    }

    const customProp = line.match(/^(--[a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
    if (customProp) {
      findings.push(
        ...auditValue({
          file,
          line: i + 1,
          property: customProp[1],
          value: customProp[2].replace(/;\s*$/, ''),
          context: 'custom-property',
          tokenRegistry,
          showTrace,
        })
      );
      continue;
    }

    const decl = line.match(/^([a-zA-Z-]+)\s*:\s*(.+?);?\s*$/);
    if (decl) {
      findings.push(
        ...auditValue({
          file,
          line: i + 1,
          property: decl[1],
          value: decl[2],
          context: 'declaration',
          tokenRegistry,
          showTrace,
        })
      );
    }
  }

  return findings;
}

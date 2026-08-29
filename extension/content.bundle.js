(() => {
  // extension/lib/constants.mjs
  var SEMANTIC_PREFIXES = [
    "--color-",
    "--space-",
    "--font-",
    "--radius-",
    "--shadow-",
    "--duration-",
    "--ease-",
    "--layout-",
    "--icon-",
    "--line-height-",
    "--letter-spacing-"
  ];

  // extension/lib/registry.mjs
  function stripComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, "");
  }
  function parseCustomProperties(css, layer, file = "") {
    const registry = /* @__PURE__ */ new Map();
    const cleaned = stripComments(css);
    const re = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
    let match;
    while ((match = re.exec(cleaned)) !== null) {
      registry.set(match[1], {
        value: match[2].trim(),
        file,
        layer
      });
    }
    return registry;
  }
  function createTokenRegistry(primitivesCss, semanticCss) {
    const registry = /* @__PURE__ */ new Map();
    for (const [key, entry] of parseCustomProperties(primitivesCss, "primitive", "primitives.css")) {
      registry.set(key, entry);
    }
    for (const [key, entry] of parseCustomProperties(semanticCss, "semantic", "semantic.css")) {
      registry.set(key, entry);
    }
    return registry;
  }
  function extractVarRefs(value) {
    const refs = [];
    const re = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
    let match;
    while ((match = re.exec(value)) !== null) {
      refs.push(match[1]);
    }
    return refs;
  }
  function classifyToken(name, tokenRegistry2) {
    const entry = tokenRegistry2.get(name);
    if (entry) return entry.layer;
    if (name.startsWith("--primitive-")) return "primitive";
    if (SEMANTIC_PREFIXES.some((prefix) => name.startsWith(prefix))) return "semantic";
    return "component";
  }
  function resolveTokenTree(name, tokenRegistry2, seen = /* @__PURE__ */ new Set()) {
    if (seen.has(name)) {
      return {
        name,
        layer: "unknown",
        value: "(cycle)",
        children: [],
        terminal: true
      };
    }
    seen.add(name);
    const entry = tokenRegistry2.get(name);
    const layer = entry?.layer ?? classifyToken(name, tokenRegistry2);
    const value = entry?.value ?? "";
    if (!entry) {
      return {
        name,
        layer,
        value: "(unknown)",
        children: [],
        terminal: true
      };
    }
    const refs = extractVarRefs(value);
    if (refs.length === 0) {
      return {
        name,
        layer,
        value,
        file: entry.file,
        children: [],
        terminal: true
      };
    }
    return {
      name,
      layer,
      value,
      file: entry.file,
      children: refs.map((ref) => resolveTokenTree(ref, tokenRegistry2, new Set(seen))),
      terminal: false
    };
  }
  function resolveValueTrees(cssValue, tokenRegistry2) {
    const refs = extractVarRefs(cssValue);
    return refs.map((ref) => resolveTokenTree(ref, tokenRegistry2));
  }
  function terminalValue(node) {
    if (!node) return "";
    if (node.terminal || !node.children?.length) return node.value;
    return terminalValue(node.children[0]);
  }
  function normalizeColor(color) {
    const trimmed = color.trim().toLowerCase();
    if (trimmed.startsWith("#")) return trimmed;
    const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
      const [r, g, b] = rgbMatch.slice(1, 4).map((n) => Number(n));
      return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    }
    return trimmed;
  }

  // extension/tokens.js
  var pageConfig = null;
  async function loadPageConfig() {
    if (pageConfig) return pageConfig;
    try {
      const res = await fetch(new URL("/token-inspect.config.json", window.location.origin));
      if (res.ok) {
        pageConfig = await res.json();
        return pageConfig;
      }
    } catch {
    }
    pageConfig = null;
    return null;
  }
  function toPublicUrl(repoPath) {
    if (!repoPath) return "";
    let p = String(repoPath).replace(/\\/g, "/");
    const srcIdx = p.indexOf("/src/");
    if (srcIdx !== -1) return p.slice(srcIdx);
    if (p.startsWith("src/")) return `/${p}`;
    if (p.startsWith("/")) return p;
    return `/${p}`;
  }
  async function loadTokenRegistry() {
    const config = await loadPageConfig();
    try {
      globalThis.__TI_PAGE_CONFIG__ = config;
    } catch {
    }
    const primPath = toPublicUrl(config?.tokens?.primitives) || "/src/styles/tokens/primitives.css";
    const semPath = toPublicUrl(config?.tokens?.semantic) || "/src/styles/tokens/semantic.css";
    const primitivesCss = await fetchCss(primPath);
    const semanticCss = await fetchCss(semPath);
    const registry = createTokenRegistry(primitivesCss, semanticCss);
    for (const sheet of document.styleSheets) {
      let href = "";
      try {
        href = sheet.href ?? "inline";
      } catch {
        continue;
      }
      const file = fileNameFromHref(href);
      harvestCustomProps(sheet, registry, file);
    }
    return registry;
  }
  async function fetchCss(path) {
    try {
      const res = await fetch(new URL(path, window.location.origin));
      if (res.ok) return await res.text();
    } catch {
    }
    return "";
  }
  function fileNameFromHref(href) {
    if (!href || href === "inline") return "inline";
    try {
      return decodeURIComponent(new URL(href).pathname.split("/").pop() || href);
    } catch {
      return href.split("/").pop() || href;
    }
  }
  function harvestCustomProps(styleSheet, registry, file, seen = /* @__PURE__ */ new Set()) {
    if (!styleSheet || seen.has(styleSheet)) return;
    seen.add(styleSheet);
    let rules;
    try {
      rules = styleSheet.cssRules;
    } catch {
      return;
    }
    if (!rules) return;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (rule.type === CSSRule.STYLE_RULE) {
        const style = (
          /** @type {CSSStyleRule} */
          rule.style
        );
        for (let j = 0; j < style.length; j++) {
          const prop = style[j];
          if (!prop.startsWith("--")) continue;
          if (registry.has(prop)) continue;
          const value = style.getPropertyValue(prop).trim();
          registry.set(prop, {
            value,
            file,
            layer: classifyToken(prop, registry)
          });
        }
      } else if (rule.type === CSSRule.IMPORT_RULE) {
        const imported = (
          /** @type {CSSImportRule} */
          rule.styleSheet
        );
        if (imported) harvestCustomProps(imported, registry, fileNameFromHref(imported.href), seen);
      } else if ("cssRules" in rule && rule.cssRules) {
        harvestCustomProps(
          /** @type {CSSStyleSheet} */
          rule,
          registry,
          file,
          seen
        );
      }
    }
  }

  // extension/collect-styles.js
  function collectMatchedStyles(el, tokenRegistry2) {
    const groups = [];
    for (const sheet of document.styleSheets) {
      if (isInspectorStylesheet(sheet)) continue;
      let href = "";
      try {
        href = sheet.href ?? "";
      } catch {
        continue;
      }
      const viteId = viteDevIdFromSheet(sheet);
      const sourcePath = sourcePathFromHref(href) || sourcePathFromViteId(viteId);
      const file = fileNameFromHref2(href) || fileNameFromPath(sourcePath) || (viteId ? fileNameFromPath(viteId) : "inline");
      for (const rule of walkStyleRules(sheet)) {
        const selector = rule.selectorText;
        if (!selector || !matchesElement(el, selector)) continue;
        const declarations = getRuleDeclarations(rule);
        const properties = [];
        for (const { property, value } of declarations) {
          if (!value) continue;
          const trees = resolveValueTrees(value, tokenRegistry2);
          const computed = getComputedStyle(el).getPropertyValue(property).trim();
          const swatch = colorSwatchFor(property, trees, computed, value);
          properties.push({
            property,
            value,
            trees,
            computed,
            swatch,
            hasTokens: trees.length > 0
          });
        }
        if (properties.length === 0) continue;
        properties.sort((a, b) => Number(b.hasTokens) - Number(a.hasTokens));
        groups.push({ selector, file, sourcePath, properties });
      }
    }
    if (el instanceof HTMLElement && el.style.length > 0) {
      const properties = [];
      for (let i = 0; i < el.style.length; i++) {
        const property = el.style[i];
        const value = el.style.getPropertyValue(property).trim();
        const trees = resolveValueTrees(value, tokenRegistry2);
        const computed = getComputedStyle(el).getPropertyValue(property).trim();
        properties.push({
          property,
          value,
          trees,
          computed,
          swatch: colorSwatchFor(property, trees, computed, value),
          hasTokens: trees.length > 0
        });
      }
      if (properties.length) {
        groups.unshift({ selector: "element.style", file: "inline", properties });
      }
    }
    return prioritizeGroups(mergeGroupsBySelector(groups), el);
  }
  function mergeGroupsBySelector(groups) {
    const merged = /* @__PURE__ */ new Map();
    const order = [];
    for (const group of groups) {
      const key = `${group.selector}\0${group.file}\0${group.sourcePath || ""}`;
      if (!merged.has(key)) {
        merged.set(key, {
          selector: group.selector,
          file: group.file,
          sourcePath: group.sourcePath,
          byProp: /* @__PURE__ */ new Map()
        });
        order.push(key);
      }
      const target = merged.get(key);
      for (const prop of group.properties) {
        target.byProp.set(prop.property, prop);
      }
    }
    return order.map((key) => {
      const entry = merged.get(key);
      const properties = [...entry.byProp.values()];
      properties.sort((a, b) => Number(b.hasTokens) - Number(a.hasTokens));
      return {
        selector: entry.selector,
        file: entry.file,
        sourcePath: entry.sourcePath,
        properties
      };
    });
  }
  function prioritizeGroups(groups, el) {
    const classList = el instanceof Element ? [...el.classList] : [];
    return [...groups].sort((a, b) => {
      const score = (g) => {
        let s = 0;
        for (const cls of classList) {
          if (g.selector.includes(`.${cls}`)) s += 10;
        }
        if (g.selector === "element.style") s += 100;
        s += (g.selector.match(/\./g) || []).length;
        return -s;
      };
      return score(a) - score(b);
    });
  }
  function getRuleDeclarations(rule) {
    const fromText = parseDeclarationsFromCssText(rule.cssText);
    if (fromText.length > 0) return fromText;
    const style = rule.style;
    const decls = [];
    const seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < style.length; i++) {
      const property = style[i];
      const value = style.getPropertyValue(property).trim();
      if (!value || seen.has(property)) continue;
      seen.add(property);
      decls.push({ property, value });
    }
    for (const shorthand of SHORTHAND_PROPS) {
      if (seen.has(shorthand)) continue;
      const value = style.getPropertyValue(shorthand).trim();
      if (!value) continue;
      seen.add(shorthand);
      decls.push({ property: shorthand, value });
    }
    return decls;
  }
  var SHORTHAND_PROPS = [
    "border",
    "border-top",
    "border-right",
    "border-bottom",
    "border-left",
    "border-width",
    "border-style",
    "border-color",
    "background",
    "margin",
    "padding",
    "font",
    "outline",
    "inset",
    "gap",
    "flex",
    "grid",
    "transition",
    "animation",
    "box-shadow"
  ];
  function parseDeclarationsFromCssText(cssText) {
    if (!cssText) return [];
    const start = cssText.indexOf("{");
    const end = cssText.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return [];
    const body = cssText.slice(start + 1, end).trim();
    if (!body) return [];
    const decls = [];
    let i = 0;
    while (i < body.length) {
      while (i < body.length && /\s/.test(body[i])) i++;
      if (i >= body.length) break;
      const colon = body.indexOf(":", i);
      if (colon === -1) break;
      const property = body.slice(i, colon).trim();
      if (!property || property.startsWith("/*")) {
        const commentEnd = body.indexOf("*/", i);
        i = commentEnd === -1 ? body.length : commentEnd + 2;
        continue;
      }
      i = colon + 1;
      let value = "";
      let depth = 0;
      while (i < body.length) {
        const ch = body[i];
        if (ch === "(") depth++;
        else if (ch === ")") depth = Math.max(0, depth - 1);
        else if (ch === ";" && depth === 0) {
          i++;
          break;
        }
        value += ch;
        i++;
      }
      const trimmedProp = property.replace(/\/\*[\s\S]*?\*\//g, "").trim();
      const trimmedValue = value.replace(/\/\*[\s\S]*?\*\//g, "").trim();
      if (trimmedProp && trimmedValue) {
        decls.push({ property: trimmedProp, value: trimmedValue });
      }
    }
    return decls;
  }
  function matchesElement(el, selectorText) {
    const parts = selectorText.split(",").map((s) => s.trim());
    for (let part of parts) {
      part = part.replace(/::?(before|after|placeholder|marker|selection|first-line|first-letter)\b.*/g, "");
      part = part.replace(/:(hover|focus|active|disabled|visited|focus-visible|focus-within)(?![-\w])/g, "");
      part = part.trim();
      if (!part) continue;
      try {
        if (el.matches(part)) return true;
      } catch {
      }
    }
    return false;
  }
  function* walkStyleRules(styleSheet, seen = /* @__PURE__ */ new Set()) {
    if (!styleSheet || seen.has(styleSheet)) return;
    seen.add(styleSheet);
    let rules;
    try {
      rules = styleSheet.cssRules;
    } catch {
      return;
    }
    if (!rules) return;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (rule.type === CSSRule.STYLE_RULE) {
        yield (
          /** @type {CSSStyleRule} */
          rule
        );
      } else if (rule.type === CSSRule.IMPORT_RULE) {
        const imported = (
          /** @type {CSSImportRule} */
          rule.styleSheet
        );
        if (imported) yield* walkStyleRules(imported, seen);
      } else if (rule.type === CSSRule.MEDIA_RULE) {
        if (!mediaRuleMatches(
          /** @type {CSSMediaRule} */
          rule
        )) continue;
        yield* walkStyleRules(
          /** @type {any} */
          rule,
          seen
        );
      } else if (rule.type === CSSRule.SUPPORTS_RULE) {
        if (!supportsRuleMatches(
          /** @type {CSSSupportsRule} */
          rule
        )) continue;
        yield* walkStyleRules(
          /** @type {any} */
          rule,
          seen
        );
      } else if ("cssRules" in rule && rule.cssRules) {
        yield* walkStyleRules(
          /** @type {any} */
          rule,
          seen
        );
      }
    }
  }
  function mediaRuleMatches(rule) {
    try {
      const text = rule.media?.mediaText || rule.conditionText || "";
      if (!text || text === "all") return true;
      return window.matchMedia(text).matches;
    } catch {
      return true;
    }
  }
  function supportsRuleMatches(rule) {
    try {
      const text = rule.conditionText || "";
      if (!text) return true;
      return CSS.supports(text);
    } catch {
      return true;
    }
  }
  function fileNameFromHref2(href) {
    if (!href || href === "inline") return "inline";
    try {
      return decodeURIComponent(new URL(href).pathname.split("/").pop() || href);
    } catch {
      return href.split("/").pop() || href;
    }
  }
  function sourcePathFromHref(href) {
    if (!href || href === "inline") return "";
    try {
      const pathname = new URL(href).pathname;
      const idx = pathname.indexOf("/src/");
      if (idx !== -1) return decodeURIComponent(pathname.slice(idx + 1));
      return decodeURIComponent(pathname.replace(/^\//, ""));
    } catch {
      return "";
    }
  }
  function viteDevIdFromSheet(sheet) {
    try {
      const node = sheet.ownerNode;
      if (!(node instanceof HTMLElement)) return "";
      return node.getAttribute("data-vite-dev-id") || node.dataset?.viteDevId || "";
    } catch {
      return "";
    }
  }
  function isInspectorStylesheet(sheet) {
    try {
      const node = sheet.ownerNode;
      if (!(node instanceof HTMLElement)) return false;
      const id = node.id || "";
      return id === "slimvg-token-inspect-overrides" || id === "slimvg-token-inspect-style" || id === "slimvg-token-inspect-root";
    } catch {
      return false;
    }
  }
  function sourcePathFromViteId(viteId) {
    if (!viteId) return "";
    const cleaned = viteId.split("?")[0].replace(/\\/g, "/");
    const marker = "/src/";
    const idx = cleaned.lastIndexOf(marker);
    if (idx !== -1) return cleaned.slice(idx + 1);
    if (cleaned.endsWith(".css")) {
      const parts = cleaned.split("/");
      const file = parts[parts.length - 1];
      return file;
    }
    return "";
  }
  function fileNameFromPath(path) {
    if (!path) return "";
    const clean = path.split("?")[0];
    const parts = clean.split("/");
    return parts[parts.length - 1] || "";
  }
  function colorSwatchFor(property, trees, computed, declared) {
    const isColorProp = /color|background|fill|stroke|border|outline|shadow/i.test(property) || property === "background";
    if (!isColorProp) return null;
    let raw = "";
    if (trees.length) {
      raw = terminalValue(trees[0]);
    }
    if (!raw || raw.startsWith("var(") || extractVarRefs(raw).length) {
      raw = computed || declared;
    }
    const hex = normalizeColor(raw);
    if (hex.startsWith("#") || /^rgba?\(/i.test(raw) || raw === "transparent") {
      return raw.startsWith("#") || raw.startsWith("rgb") || raw === "transparent" ? raw : hex;
    }
    return null;
  }
  function elementLabel(el) {
    if (el.classList?.length) {
      const classes = [...el.classList];
      const modifier = classes.find((c) => c.includes("--"));
      if (modifier) return `.${modifier}`;
      return `.${classes[0]}`;
    }
    if (el.id) return `#${el.id}`;
    return el.tagName.toLowerCase();
  }

  // extension/svg-icon.js
  function closestSvg(el) {
    if (!(el instanceof Element)) return null;
    return el.closest?.("svg") ?? (el.tagName?.toLowerCase() === "svg" ? el : null);
  }
  function relatedIconSvg(el) {
    if (!(el instanceof Element)) return null;
    const svg = closestSvg(el);
    if (svg) return svg;
    const marked = el.closest?.(".icon, [data-ti-icon]");
    if (marked) {
      return marked.tagName.toLowerCase() === "svg" ? marked : marked.querySelector("svg");
    }
    return el.querySelector?.(":scope > .icon, :scope > [data-ti-icon], :scope > svg") || null;
  }
  function firstPathD(svg) {
    const path = svg?.querySelector?.("path");
    return path?.getAttribute("d")?.trim() || "";
  }
  function parsePastedIcon(raw) {
    const text = String(raw || "").trim();
    if (!text) return null;
    if (text.includes("<")) {
      const wrapped = /<svg[\s>]/i.test(text) ? text : `<svg xmlns="http://www.w3.org/2000/svg">${text}</svg>`;
      const doc = new DOMParser().parseFromString(wrapped, "image/svg+xml");
      if (doc.querySelector("parsererror")) return null;
      const svg = doc.querySelector("svg");
      if (!svg) return null;
      const paths = [...svg.querySelectorAll("path")].map((p) => p.getAttribute("d")?.trim()).filter(Boolean);
      if (!paths.length) return null;
      return { paths, viewBox: svg.getAttribute("viewBox")?.trim() || "" };
    }
    return { paths: [text], viewBox: "" };
  }
  function applySvgPreview(svg, parsed) {
    if (!svg || !parsed?.paths?.length) return;
    if (svg.__tiOrigInner == null) {
      svg.__tiOrigInner = svg.innerHTML;
      svg.__tiOrigViewBox = svg.getAttribute("viewBox");
      svg.__tiOrigD = firstPathD(svg);
    }
    for (const el of svg.querySelectorAll("path, circle, rect, line, polyline, polygon, ellipse")) {
      el.remove();
    }
    for (const d of parsed.paths) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    if (parsed.viewBox) svg.setAttribute("viewBox", parsed.viewBox);
  }
  function restoreSvgPreview(svg) {
    if (!svg || svg.__tiOrigInner == null) return;
    svg.innerHTML = svg.__tiOrigInner;
    if (svg.__tiOrigViewBox != null) {
      if (svg.__tiOrigViewBox) svg.setAttribute("viewBox", svg.__tiOrigViewBox);
      else svg.removeAttribute("viewBox");
    }
    delete svg.__tiOrigInner;
    delete svg.__tiOrigViewBox;
    delete svg.__tiOrigD;
  }
  function restoreAllSvgPreviews() {
    for (const svg of document.querySelectorAll("svg")) {
      restoreSvgPreview(svg);
    }
  }

  // extension/overrides.js
  var OVERRIDE_STYLE_ID = "slimvg-token-inspect-overrides";
  var propertyOverrides = /* @__PURE__ */ new Map();
  var tokenOverrides = /* @__PURE__ */ new Map();
  var pendingEdits = /* @__PURE__ */ new Map();
  function propertyKey(selector, property) {
    return `${selector}\0${property}`;
  }
  function editKey(edit) {
    if (edit.kind === "property") {
      return `property\0${edit.file || edit.sourcePath || ""}\0${edit.selector || ""}\0${edit.property}`;
    }
    if (edit.kind === "svg-path") {
      return `svg-path\0${edit.from}`;
    }
    return `token\0${edit.file || ""}\0${edit.tokenName}`;
  }
  function ensureOverrideSheet() {
    let el = document.getElementById(OVERRIDE_STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = OVERRIDE_STYLE_ID;
      document.documentElement.appendChild(el);
    }
    return el;
  }
  function rebuildPropertySheet() {
    const el = ensureOverrideSheet();
    const rules = [];
    for (const { selector, property, value } of propertyOverrides.values()) {
      rules.push(`${selector} { ${property}: ${value} !important; }`);
    }
    el.textContent = rules.join("\n");
  }
  function rememberEdit(partial) {
    const key = editKey(partial);
    const existing = pendingEdits.get(key);
    const from = existing ? existing.from : partial.from;
    const to = partial.to;
    if (from === to) {
      pendingEdits.delete(key);
      return;
    }
    pendingEdits.set(key, {
      ...partial,
      id: existing?.id || key,
      from,
      to
    });
  }
  function previewPropertyOverride(input) {
    const { selector, property, from, to, file = "", sourcePath = "" } = input;
    propertyOverrides.set(propertyKey(selector, property), {
      selector,
      property,
      value: to
    });
    rebuildPropertySheet();
    rememberEdit({
      kind: "property",
      file,
      sourcePath,
      selector,
      property,
      from,
      to
    });
  }
  function previewTokenOverride(input) {
    const { tokenName, from, to, file = "", registry } = input;
    document.documentElement.style.setProperty(tokenName, to);
    tokenOverrides.set(tokenName, to);
    const existing = registry.get(tokenName);
    registry.set(tokenName, {
      value: to,
      file: existing?.file ?? file ?? "preview",
      layer: existing?.layer ?? "semantic"
    });
    rememberEdit({
      kind: "token",
      file: file || existing?.file || "",
      tokenName,
      from,
      to
    });
  }
  function previewSvgPathOverride(input) {
    const { from, to } = input;
    rememberEdit({
      kind: "svg-path",
      file: "",
      from,
      to
    });
  }
  function getPropertyOverride(selector, property) {
    return propertyOverrides.get(propertyKey(selector, property))?.value ?? null;
  }
  function clearOverrides(registry) {
    for (const name of tokenOverrides.keys()) {
      document.documentElement.style.removeProperty(name);
      void registry;
    }
    tokenOverrides.clear();
    propertyOverrides.clear();
    pendingEdits.clear();
    restoreAllSvgPreviews();
    const el = document.getElementById(OVERRIDE_STYLE_ID);
    if (el) el.textContent = "";
  }
  function overrideCount() {
    return pendingEdits.size;
  }
  function listPendingEdits() {
    return [...pendingEdits.values()];
  }
  function normalizeTokenFile(file) {
    if (!file) return "";
    try {
      const cfg = globalThis.__TI_PAGE_CONFIG__;
      if (cfg?.tokens) {
        const prim = String(cfg.tokens.primitives || "");
        const sem = String(cfg.tokens.semantic || "");
        if (file === "semantic.css" || file.endsWith("/semantic.css")) return sem || file;
        if (file === "primitives.css" || file.endsWith("/primitives.css")) return prim || file;
      }
    } catch {
    }
    if (file === "semantic.css" || file.endsWith("/semantic.css")) {
      return "apps/frontend/src/styles/tokens/semantic.css";
    }
    if (file === "primitives.css" || file.endsWith("/primitives.css")) {
      return "apps/frontend/src/styles/tokens/primitives.css";
    }
    if (file.startsWith("apps/frontend/")) return file;
    if (file.startsWith("src/")) return file;
    return file;
  }

  // extension/token-options.js
  function tokenKind(name) {
    const n = name.toLowerCase();
    if (n.includes("color") || n.includes("brand") || n.includes("success") || n.includes("warning") || n.includes("error") || n.includes("-white") || n.endsWith("white") || n.includes("-black") || n.includes("bg-") || n.includes("text-") || n.includes("border-") || n.includes("fill") || n.includes("stroke")) {
      return "color";
    }
    if (n.includes("space") || n.includes("gap") || n.includes("inset") || n.includes("page-")) {
      return "space";
    }
    if (n.includes("radius")) return "radius";
    if (n.includes("font-size") || n.includes("line-height")) return "font-size";
    if (n.includes("font-weight") || n.includes("font-family") || n.includes("letter-spacing")) {
      return "font";
    }
    if (n.includes("shadow")) return "shadow";
    if (n.includes("duration") || n.includes("ease")) return "motion";
    if (n.includes("z-") || n.includes("z-index")) return "z";
    if (n.includes("icon")) return "icon";
    return "other";
  }
  function listTokensByLayerAndKind(registry, layer, kind) {
    const options = [];
    for (const [name, entry] of registry.entries()) {
      if (entry.layer !== layer) continue;
      if (tokenKind(name) !== kind) continue;
      const tree = resolveTokenTree(name, registry);
      const terminal = terminalValue(tree);
      let swatch = null;
      if (kind === "color") {
        const normalized = normalizeColor(terminal);
        if (normalized.startsWith("#") || /^rgba?\(/i.test(terminal) || terminal === "transparent") {
          swatch = terminal.startsWith("#") || terminal.startsWith("rgb") || terminal === "transparent" ? terminal : normalized;
        }
      }
      options.push({
        name,
        value: entry.value,
        swatch,
        label: kind === "color" && terminal ? `${name} \xB7 ${terminal}` : name
      });
    }
    options.sort((a, b) => a.name.localeCompare(b.name));
    return options;
  }
  function editableTargetForNode(node) {
    if (!node?.children?.length) return null;
    const child = node.children[0];
    if (node.layer === "semantic") {
      if (child?.layer === "primitive" || child?.name?.startsWith("--primitive-")) {
        return {
          mode: "token",
          tokenName: node.name,
          currentRef: child.name,
          optionLayer: "primitive",
          kind: tokenKind(node.name)
        };
      }
      if (child?.layer === "semantic") {
        return {
          mode: "token",
          tokenName: node.name,
          currentRef: child.name,
          optionLayer: "semantic",
          kind: tokenKind(node.name)
        };
      }
    }
    if (node.layer === "component") {
      if (child?.layer === "semantic") {
        return {
          mode: "token",
          tokenName: node.name,
          currentRef: child.name,
          optionLayer: "semantic",
          kind: tokenKind(child.name)
        };
      }
      if (child?.layer === "primitive") {
        return {
          mode: "token",
          tokenName: node.name,
          currentRef: child.name,
          optionLayer: "primitive",
          kind: tokenKind(child.name)
        };
      }
    }
    return null;
  }
  function editableTargetForProperty(prop) {
    if (!prop?.trees?.length) return null;
    const primary = prop.trees[0];
    if (!primary?.name) return null;
    if (primary.layer === "semantic") {
      return {
        mode: "property",
        currentRef: primary.name,
        optionLayer: "semantic",
        kind: tokenKind(primary.name)
      };
    }
    if (primary.layer === "primitive") {
      return {
        mode: "property",
        currentRef: primary.name,
        optionLayer: "primitive",
        kind: tokenKind(primary.name)
      };
    }
    if (primary.layer === "component") {
      const child = primary.children?.[0];
      if (child?.layer === "semantic") {
        return {
          mode: "property",
          currentRef: primary.name,
          optionLayer: "semantic",
          kind: tokenKind(child.name)
        };
      }
    }
    return null;
  }

  // extension/design-layout.js
  var LAYOUT_SIGNAL_PROPS = [
    "display",
    "flex-direction",
    "flex-wrap",
    "align-items",
    "justify-content",
    "gap",
    "row-gap",
    "column-gap",
    "padding",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "grid-template-columns",
    "grid-template-rows"
  ];
  var LAYOUT_EDITOR_PROPS = /* @__PURE__ */ new Set([
    ...LAYOUT_SIGNAL_PROPS,
    "align-content",
    "justify-items",
    "place-items",
    "padding-block",
    "padding-inline"
  ]);
  var DISTRIBUTE_OPTIONS = [
    { value: "flex-start", label: "Start" },
    { value: "center", label: "Center" },
    { value: "flex-end", label: "End" },
    { value: "space-between", label: "Space between" },
    { value: "space-around", label: "Space around" },
    { value: "space-evenly", label: "Space evenly" }
  ];
  var ICONS = {
    stack: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="2.5" width="10" height="2.5" rx="0.75" fill="currentColor"/><rect x="3" y="6.75" width="10" height="2.5" rx="0.75" fill="currentColor"/><rect x="3" y="11" width="10" height="2.5" rx="0.75" fill="currentColor"/></svg>`,
    grid: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="0.75" fill="currentColor"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="0.75" fill="currentColor"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="0.75" fill="currentColor"/><rect x="9" y="9" width="4.5" height="4.5" rx="0.75" fill="currentColor"/></svg>`,
    row: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 7.25h9.2L8.6 4.65l.7-.7L13.4 8l-4.1 4.05-.7-.7 2.6-2.6H2v-1.5z"/></svg>`,
    column: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7.25 2v9.2l-2.6-2.6-.7.7L8 13.4l4.05-4.1-.7-.7-2.6 2.6V2h-1.5z"/></svg>`,
    alignStart: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 2.5h12v1.25H2V2.5zm3 3.5h6v2H5v-2zm0 4h6v2H5v-2z"/></svg>`,
    alignCenter: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 7.4h12v1.2H2V7.4zM5 3.5h6v2H5v-2zm0 7h6v2H5v-2z"/></svg>`,
    alignEnd: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M2 12.25h12v1.25H2v-1.25zm3-8.5h6v2H5v-2zm0 4h6v2H5v-2z"/></svg>`,
    padUniform: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
    padSides: `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7.25 2h1.5v3h-1.5V2zm0 9h1.5v3h-1.5v-3zM2 7.25h3v1.5H2v-1.5zm9 0h3v1.5h-3v-1.5z"/><rect x="5.5" y="5.5" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.25"/></svg>`
  };
  function hasLayoutEditorContent(winning) {
    return LAYOUT_SIGNAL_PROPS.some((name) => winning.has(name));
  }
  function firstHit(winning, names) {
    for (const name of names) {
      const hit = winning.get(name);
      if (hit) return { ...hit, property: name };
    }
    return null;
  }
  function authored(hit) {
    return hit?.prop?.value ?? "";
  }
  var SPACE_ORDER = [
    "--space-stack-xs",
    "--space-stack-sm",
    "--space-stack-md",
    "--space-stack-lg",
    "--space-stack-xl",
    "--space-stack-2xl",
    "--space-inline-sm",
    "--space-inline-md",
    "--space-page-x",
    "--space-page-y",
    "--space-section-y"
  ];
  function listSpaceTokenOptions(registry) {
    if (!registry) return [];
    const semantic = listTokensByLayerAndKind(registry, "semantic", "space");
    const rank = new Map(SPACE_ORDER.map((name, i) => [name, i]));
    return semantic.map((opt) => ({
      name: opt.name,
      value: `var(${opt.name})`,
      label: opt.name.replace(/^--/, "")
    })).sort((a, b) => {
      const ra = rank.has(a.name) ? rank.get(a.name) : 1e3;
      const rb = rank.has(b.name) ? rank.get(b.name) : 1e3;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  }
  function asVarRef(value) {
    const trimmed = String(value || "").trim();
    const m = trimmed.match(/^var\(\s*(--[\w-]+)\s*\)$/i);
    return m ? `var(${m[1]})` : null;
  }
  function normalizeAlign(value) {
    const v = String(value || "").toLowerCase();
    if (v === "center") return "center";
    if (v === "flex-end" || v === "end" || v === "right" || v === "self-end") return "end";
    if (v === "flex-start" || v === "start" || v === "left" || v === "self-start" || v === "stretch" || v === "baseline" || v === "normal") {
      return v === "stretch" || v === "baseline" || v === "normal" ? "start" : "start";
    }
    return "";
  }
  function alignToCss(key) {
    if (key === "center") return "center";
    if (key === "end") return "flex-end";
    return "flex-start";
  }
  function normalizeDistribute(value) {
    const v = String(value || "").toLowerCase();
    if (v === "start" || v === "left") return "flex-start";
    if (v === "end" || v === "right") return "flex-end";
    return v;
  }
  function distributeLabel(value) {
    const norm = normalizeDistribute(value);
    return DISTRIBUTE_OPTIONS.find((o) => o.value === norm)?.label || DISTRIBUTE_OPTIONS.find((o) => o.value === value)?.label || (value ? String(value) : "Start");
  }
  function isUniformPadding(value) {
    const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return true;
    if (parts.length === 2) return parts[0] === parts[1];
    if (parts.length === 3) return parts[0] === parts[1] && parts[1] === parts[2];
    if (parts.length >= 4) return parts[0] === parts[1] && parts[1] === parts[2] && parts[2] === parts[3];
    return true;
  }
  function renderLayoutEditor(winning, hooks) {
    const root = document.createElement("section");
    root.className = "ti-design-section ti-layout";
    const spaceOptions = listSpaceTokenOptions(hooks.registry);
    const head = document.createElement("div");
    head.className = "ti-layout-head";
    const title = document.createElement("div");
    title.className = "ti-design-title ti-layout-title";
    title.textContent = "Layout";
    head.appendChild(title);
    root.appendChild(head);
    const displayHit = firstHit(winning, ["display"]);
    const directionHit = firstHit(winning, ["flex-direction"]);
    const justifyHit = firstHit(winning, ["justify-content"]);
    const alignHit = firstHit(winning, ["align-items"]);
    const wrapHit = firstHit(winning, ["flex-wrap"]);
    const gapHit = firstHit(winning, ["gap", "column-gap", "row-gap"]);
    const paddingHit = firstHit(winning, [
      "padding",
      "padding-block",
      "padding-inline",
      "padding-top"
    ]);
    const paddingTarget = winning.get("padding") ? { ...winning.get("padding"), property: "padding" } : paddingHit;
    const display = String(hooks.computedDisplay || authored(displayHit) || "").toLowerCase();
    const isStack = display === "flex" || display === "inline-flex";
    const isGrid = display === "grid" || display === "inline-grid";
    if (displayHit) {
      root.appendChild(
        row("Type", segment([
          {
            html: ICONS.stack,
            label: "Stack",
            title: "Stack",
            active: isStack,
            onClick: () => hooks.onCommit(displayHit, "flex")
          },
          {
            html: ICONS.grid,
            label: "Grid",
            title: "Grid",
            active: isGrid,
            onClick: () => hooks.onCommit(displayHit, "grid")
          }
        ]))
      );
    }
    if (directionHit) {
      const dir = authored(directionHit).toLowerCase();
      const isRow = dir === "row" || dir === "row-reverse" || !dir && isStack;
      const isCol = dir === "column" || dir === "column-reverse";
      root.appendChild(
        row("Direction", segment([
          {
            html: ICONS.row,
            title: "Horizontal",
            active: isRow && !isCol,
            onClick: () => hooks.onCommit(directionHit, "row")
          },
          {
            html: ICONS.column,
            title: "Vertical",
            active: isCol,
            onClick: () => hooks.onCommit(directionHit, "column")
          }
        ]))
      );
    }
    if (justifyHit) {
      root.appendChild(
        row(
          "Distribute",
          dropdown({
            label: distributeLabel(authored(justifyHit)),
            options: DISTRIBUTE_OPTIONS,
            current: normalizeDistribute(authored(justifyHit)),
            onPick: (value) => hooks.onCommit(justifyHit, value)
          })
        )
      );
    }
    if (alignHit) {
      const alignKey = normalizeAlign(authored(alignHit));
      root.appendChild(
        row("Align", segment([
          {
            html: ICONS.alignStart,
            title: "Start",
            active: alignKey === "start",
            onClick: () => hooks.onCommit(alignHit, alignToCss("start"))
          },
          {
            html: ICONS.alignCenter,
            title: "Center",
            active: alignKey === "center",
            onClick: () => hooks.onCommit(alignHit, alignToCss("center"))
          },
          {
            html: ICONS.alignEnd,
            title: "End",
            active: alignKey === "end",
            onClick: () => hooks.onCommit(alignHit, alignToCss("end"))
          }
        ]))
      );
    }
    if (wrapHit) {
      const wrap = authored(wrapHit).toLowerCase();
      const wrapYes = wrap === "wrap" || wrap === "wrap-reverse";
      root.appendChild(
        row("Wrap", segment([
          {
            label: "Yes",
            active: wrapYes,
            onClick: () => hooks.onCommit(wrapHit, "wrap")
          },
          {
            label: "No",
            active: !wrapYes,
            onClick: () => hooks.onCommit(wrapHit, "nowrap")
          }
        ]))
      );
    }
    if (gapHit) {
      root.appendChild(row("Gap", spaceTokenSelect(authored(gapHit), spaceOptions, (next) => {
        hooks.onCommit(gapHit, next);
      })));
    }
    if (paddingTarget) {
      let renderPaddingControls = function() {
        padHost.replaceChildren();
        const value = authored(paddingTarget);
        const controls = document.createElement("div");
        controls.className = "ti-layout-pad-controls";
        if (!padExpanded) {
          controls.appendChild(
            spaceTokenSelect(value, spaceOptions, (next) => {
              hooks.onCommit(paddingTarget, next);
            })
          );
        } else {
          const parts = splitPaddingParts(value);
          const grid = document.createElement("div");
          grid.className = "ti-layout-pad-grid";
          for (const side of [
            { key: "top", label: "T" },
            { key: "right", label: "R" },
            { key: "bottom", label: "B" },
            { key: "left", label: "L" }
          ]) {
            const cell = document.createElement("label");
            cell.className = "ti-layout-pad-cell";
            const tag = document.createElement("span");
            tag.textContent = side.label;
            cell.appendChild(tag);
            cell.appendChild(
              spaceTokenSelect(parts[side.key], spaceOptions, (next) => {
                const updated = { ...parts, [side.key]: next };
                hooks.onCommit(
                  paddingTarget,
                  `${updated.top} ${updated.right} ${updated.bottom} ${updated.left}`
                );
              })
            );
            grid.appendChild(cell);
          }
          controls.appendChild(grid);
        }
        const mode = segment([
          {
            html: ICONS.padUniform,
            title: "Uniform padding",
            active: !padExpanded,
            onClick: () => {
              padExpanded = false;
              if (!isUniformPadding(authored(paddingTarget))) {
                const parts = splitPaddingParts(authored(paddingTarget));
                hooks.onCommit(paddingTarget, parts.top);
                return;
              }
              renderPaddingControls();
            }
          },
          {
            html: ICONS.padSides,
            title: "Independent padding",
            active: padExpanded,
            onClick: () => {
              padExpanded = true;
              renderPaddingControls();
            }
          }
        ]);
        mode.classList.add("ti-layout-pad-mode");
        controls.appendChild(mode);
        padHost.appendChild(controls);
      };
      let padExpanded = !isUniformPadding(authored(paddingTarget));
      const padHost = document.createElement("div");
      padHost.className = "ti-layout-pad-host";
      renderPaddingControls();
      root.appendChild(row("Padding", padHost));
    }
    if (isGrid) {
      const cols = firstHit(winning, ["grid-template-columns"]);
      const rows = firstHit(winning, ["grid-template-rows"]);
      if (cols) {
        root.appendChild(row("Columns", textField(cols, hooks)));
      }
      if (rows) {
        root.appendChild(row("Rows", textField(rows, hooks)));
      }
    }
    return root;
  }
  function splitPaddingParts(value) {
    const raw = String(value || "").trim();
    const parts = raw ? raw.split(/\s+/).filter(Boolean) : [];
    if (parts.length === 0) {
      return { top: "", right: "", bottom: "", left: "" };
    }
    if (parts.length === 1) {
      return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
    }
    if (parts.length === 2) {
      return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
    }
    if (parts.length === 3) {
      return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
    }
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
  }
  function row(label, control) {
    const el = document.createElement("div");
    el.className = "ti-layout-row";
    const lab = document.createElement("div");
    lab.className = "ti-layout-label";
    lab.textContent = label;
    const cell = document.createElement("div");
    cell.className = "ti-layout-control";
    if (control instanceof Node) cell.appendChild(control);
    else cell.append(control);
    el.append(lab, cell);
    return el;
  }
  function segment(items) {
    const el = document.createElement("div");
    el.className = "ti-seg";
    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ti-seg-btn";
      if (item.active) btn.classList.add("active");
      if (item.disabled) {
        btn.disabled = true;
        btn.title = item.title || "Not declared on this element";
      } else if (item.title) {
        btn.title = item.title;
      }
      if (item.html && item.label) {
        btn.innerHTML = `${item.html}<span>${item.label}</span>`;
      } else if (item.html) {
        btn.innerHTML = item.html;
      } else {
        btn.textContent = item.label || "";
      }
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.onClick();
      });
      el.appendChild(btn);
    }
    return el;
  }
  function dropdown(config) {
    const wrap = document.createElement("div");
    wrap.className = "ti-layout-select-wrap";
    const select = document.createElement("select");
    select.className = "ti-layout-select";
    select.disabled = Boolean(config.disabled);
    if (config.disabled) select.title = "Not declared on this element";
    const current = config.current;
    let hasCurrent = false;
    for (const opt of config.options) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === current) {
        o.selected = true;
        hasCurrent = true;
      }
      select.appendChild(o);
    }
    if (current && !hasCurrent) {
      const o = document.createElement("option");
      o.value = current;
      o.textContent = config.label || current;
      o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener("click", (e) => e.stopPropagation());
    select.addEventListener("change", () => config.onPick(select.value));
    wrap.appendChild(select);
    return wrap;
  }
  function textField(hit, hooks) {
    const input = document.createElement("input");
    input.className = "ti-layout-num ti-layout-num--wide";
    input.type = "text";
    input.value = authored(hit);
    input.title = authored(hit);
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("change", () => {
      const next = input.value.trim();
      if (next && next !== authored(hit)) hooks.onCommit(hit, next);
    });
    return input;
  }
  function spaceTokenSelect(currentValue, options, onPick) {
    const current = asVarRef(currentValue) || String(currentValue || "").trim();
    return dropdown({
      label: current || "Choose space\u2026",
      options: options.length ? options : [{ value: current || "var(--space-stack-md)", label: current || "space-stack-md" }],
      current,
      onPick
    });
  }

  // extension/design-pane.js
  var DESIGN_SECTIONS = [
    {
      id: "position",
      title: "Position",
      fields: [
        { property: "position", label: "Position" },
        { property: "inset", label: "Inset" },
        { property: "top", label: "Top" },
        { property: "right", label: "Right" },
        { property: "bottom", label: "Bottom" },
        { property: "left", label: "Left" },
        { property: "z-index", label: "Z-index" },
        { property: "overflow", label: "Overflow" },
        { property: "overflow-x", label: "Overflow X" },
        { property: "overflow-y", label: "Overflow Y" }
      ]
    },
    {
      id: "spacing",
      title: "Spacing",
      fields: [
        { property: "margin", label: "Margin" },
        { property: "margin-top", label: "Margin top" },
        { property: "margin-right", label: "Margin right" },
        { property: "margin-bottom", label: "Margin bottom" },
        { property: "margin-left", label: "Margin left" },
        { property: "margin-block", label: "Margin block" },
        { property: "margin-inline", label: "Margin inline" }
      ]
    },
    {
      id: "size",
      title: "Size",
      fields: [
        { property: "width", label: "Width" },
        { property: "height", label: "Height" },
        { property: "min-width", label: "Min width" },
        { property: "max-width", label: "Max width" },
        { property: "min-height", label: "Min height" },
        { property: "max-height", label: "Max height" },
        { property: "flex", label: "Flex" },
        { property: "flex-grow", label: "Grow" },
        { property: "flex-shrink", label: "Shrink" },
        { property: "flex-basis", label: "Basis" },
        { property: "aspect-ratio", label: "Aspect" },
        { property: "box-sizing", label: "Box sizing" }
      ]
    },
    {
      id: "fill",
      title: "Fill",
      fields: [
        { property: "background", label: "Fill" },
        { property: "background-color", label: "Fill color" },
        { property: "background-image", label: "Fill image" },
        { property: "color", label: "Text" },
        { property: "opacity", label: "Opacity" },
        { property: "fill", label: "SVG fill" }
      ]
    },
    {
      id: "stroke",
      title: "Stroke",
      fields: [
        { property: "border", label: "Stroke" },
        { property: "border-width", label: "Weight" },
        { property: "border-style", label: "Style" },
        { property: "border-color", label: "Color" },
        { property: "border-top", label: "Top" },
        { property: "border-right", label: "Right" },
        { property: "border-bottom", label: "Bottom" },
        { property: "border-left", label: "Left" },
        { property: "outline", label: "Outline" },
        { property: "stroke", label: "SVG stroke" },
        { property: "stroke-width", label: "SVG weight" }
      ]
    },
    {
      id: "corner",
      title: "Corner",
      fields: [
        { property: "border-radius", label: "Radius" },
        { property: "border-top-left-radius", label: "Top left" },
        { property: "border-top-right-radius", label: "Top right" },
        { property: "border-bottom-right-radius", label: "Bottom right" },
        { property: "border-bottom-left-radius", label: "Bottom left" }
      ]
    },
    {
      id: "effects",
      title: "Effects",
      fields: [
        { property: "box-shadow", label: "Shadow" },
        { property: "filter", label: "Filter" },
        { property: "backdrop-filter", label: "Backdrop" },
        { property: "transition", label: "Transition" },
        { property: "transform", label: "Transform" },
        { property: "cursor", label: "Cursor" },
        { property: "pointer-events", label: "Pointer" },
        { property: "visibility", label: "Visibility" }
      ]
    },
    {
      id: "type",
      title: "Typography",
      fields: [
        { property: "font-family", label: "Family" },
        { property: "font-size", label: "Size" },
        { property: "font-weight", label: "Weight" },
        { property: "font-style", label: "Style" },
        { property: "line-height", label: "Line height" },
        { property: "letter-spacing", label: "Letter spacing" },
        { property: "text-align", label: "Align" },
        { property: "text-decoration", label: "Decoration" },
        { property: "text-transform", label: "Transform" },
        { property: "white-space", label: "Whitespace" }
      ]
    }
  ];
  function flattenWinningProps(groups, applyOverride) {
    const map = /* @__PURE__ */ new Map();
    for (const group of [...groups].reverse()) {
      for (const prop of group.properties) {
        map.set(prop.property, {
          prop: applyOverride(prop, group.selector),
          group
        });
      }
    }
    return map;
  }
  function listPresentDesignSections(winning) {
    return DESIGN_SECTIONS.map((section) => ({
      id: section.id,
      title: section.title,
      rows: section.fields.map((field) => {
        if (LAYOUT_EDITOR_PROPS.has(field.property)) return null;
        const hit = winning.get(field.property);
        if (!hit) return null;
        return {
          property: field.property,
          label: field.label,
          prop: hit.prop,
          group: hit.group
        };
      }).filter(Boolean)
    })).filter((section) => section.rows.length > 0);
  }

  // extension/property-options.js
  var KEYWORD_OPTIONS = {
    display: [
      "none",
      "block",
      "inline",
      "inline-block",
      "flex",
      "inline-flex",
      "grid",
      "inline-grid",
      "contents",
      "flow-root",
      "list-item"
    ],
    "flex-direction": ["row", "row-reverse", "column", "column-reverse"],
    "flex-wrap": ["nowrap", "wrap", "wrap-reverse"],
    "align-items": ["stretch", "flex-start", "flex-end", "center", "baseline", "start", "end", "normal"],
    "align-self": ["auto", "stretch", "flex-start", "flex-end", "center", "baseline", "start", "end"],
    "align-content": [
      "stretch",
      "flex-start",
      "flex-end",
      "center",
      "space-between",
      "space-around",
      "space-evenly",
      "start",
      "end",
      "normal"
    ],
    "justify-content": [
      "flex-start",
      "flex-end",
      "center",
      "space-between",
      "space-around",
      "space-evenly",
      "start",
      "end",
      "left",
      "right",
      "normal"
    ],
    "justify-items": ["stretch", "start", "end", "center", "left", "right", "normal"],
    "justify-self": ["auto", "stretch", "start", "end", "center", "left", "right"],
    position: ["static", "relative", "absolute", "fixed", "sticky"],
    overflow: ["visible", "hidden", "clip", "scroll", "auto"],
    "overflow-x": ["visible", "hidden", "clip", "scroll", "auto"],
    "overflow-y": ["visible", "hidden", "clip", "scroll", "auto"],
    "text-align": ["start", "end", "left", "right", "center", "justify"],
    "white-space": ["normal", "nowrap", "pre", "pre-wrap", "pre-line", "break-spaces"],
    "pointer-events": ["auto", "none"],
    cursor: [
      "auto",
      "default",
      "pointer",
      "not-allowed",
      "grab",
      "grabbing",
      "text",
      "move",
      "crosshair",
      "help"
    ],
    "box-sizing": ["border-box", "content-box"],
    visibility: ["visible", "hidden", "collapse"],
    "object-fit": ["fill", "contain", "cover", "none", "scale-down"],
    "object-position": ["center", "top", "bottom", "left", "right"],
    "flex-shrink": ["0", "1"],
    "flex-grow": ["0", "1"],
    float: ["none", "left", "right"],
    clear: ["none", "left", "right", "both"],
    "user-select": ["auto", "none", "text", "all"],
    "text-decoration": ["none", "underline", "line-through", "overline"],
    "font-style": ["normal", "italic", "oblique"],
    "font-weight": ["100", "200", "300", "400", "500", "600", "700", "800", "900", "normal", "bold"],
    "border-style": ["none", "solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset"]
  };
  var SIZE_SUGGESTIONS = [
    "auto",
    "0",
    "100%",
    "90%",
    "80%",
    "75%",
    "50%",
    "33%",
    "25%",
    "fit-content",
    "max-content",
    "min-content",
    "100vw",
    "100vh",
    "1rem",
    "1.5rem",
    "2rem",
    "2.5rem",
    "3rem",
    "4rem",
    "8px",
    "16px",
    "24px",
    "32px"
  ];
  var SIZE_PROPERTIES = /* @__PURE__ */ new Set([
    "width",
    "height",
    "min-width",
    "max-width",
    "min-height",
    "max-height",
    "flex-basis",
    "gap",
    "row-gap",
    "column-gap",
    "top",
    "right",
    "bottom",
    "left",
    "inset",
    "margin",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "padding",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "border-radius",
    "border-width",
    "font-size",
    "line-height",
    "outline-offset"
  ]);
  var GRID_TRACK_SUGGESTIONS = [
    "1fr",
    "1fr 1fr",
    "1fr 2fr",
    "2fr 1fr",
    "1fr 1fr 1fr",
    "2fr 3fr 1fr",
    "2fr 4fr 1fr",
    "1fr 3fr 1fr",
    "auto 1fr",
    "auto 1fr auto",
    "max-content 1fr",
    "minmax(0, 1fr)",
    "minmax(0, 1fr) minmax(0, 2fr)",
    "repeat(2, 1fr)",
    "repeat(3, 1fr)",
    "repeat(4, minmax(0, 1fr))"
  ];
  var GRID_TEMPLATE_PROPERTIES = /* @__PURE__ */ new Set([
    "grid-template-columns",
    "grid-template-rows",
    "grid-auto-columns",
    "grid-auto-rows",
    "grid-template"
  ]);
  function prefersFullValueEdit(property) {
    return GRID_TEMPLATE_PROPERTIES.has(property.toLowerCase());
  }
  function getPropertyValueEditor(property) {
    const prop = property.toLowerCase();
    if (GRID_TEMPLATE_PROPERTIES.has(prop)) {
      return { mode: "grid", options: GRID_TRACK_SUGGESTIONS };
    }
    if (KEYWORD_OPTIONS[prop]) {
      return { mode: "keywords", options: KEYWORD_OPTIONS[prop] };
    }
    if (SIZE_PROPERTIES.has(prop)) {
      return { mode: "size", options: SIZE_SUGGESTIONS };
    }
    if (prop === "color" || prop === "background" || prop === "background-color" || prop.endsWith("-color") || prop === "fill" || prop === "stroke" || prop === "border" || prop.startsWith("border-") && prop.includes("color")) {
      return { mode: "color", options: ["transparent", "currentColor", "#000000", "#ffffff"] };
    }
    if (prop === "opacity" || prop === "z-index" || prop === "order" || prop === "flex" || prop === "transform" || prop === "transition" || prop === "box-shadow" || prop === "border" || prop.startsWith("border-")) {
      return { mode: "freeform", options: [] };
    }
    return { mode: "freeform", options: [] };
  }
  function detectRawValueKind(value) {
    const v = value.trim();
    if (/^#([0-9a-f]{3,8})$/i.test(v) || /^rgba?\(/i.test(v) || /^hsla?\(/i.test(v)) {
      return "color";
    }
    if (/^-?[\d.]+(rem|px|em|%|vh|vw|ch|ex)$/i.test(v) || v === "0") {
      return "length";
    }
    if (/^-?[\d.]+$/.test(v)) {
      return "number";
    }
    return "text";
  }

  // extension/push.js
  var WRITER_BASE = "http://127.0.0.1:7319";
  async function pushEditsToWriter(edits) {
    if (!edits.length) {
      return { ok: false, message: "No pending edits" };
    }
    const payload = {
      edits: edits.map((e) => {
        if (e.kind === "property") {
          return {
            kind: "property",
            file: e.file,
            sourcePath: e.sourcePath,
            selector: e.selector,
            property: e.property,
            from: e.from,
            to: e.to
          };
        }
        if (e.kind === "svg-path") {
          return {
            kind: "svg-path",
            file: e.file,
            from: e.from,
            to: e.to
          };
        }
        return {
          kind: "token",
          file: e.file,
          tokenName: e.tokenName,
          from: e.from,
          to: e.to
        };
      })
    };
    let res;
    try {
      res = await fetch(`${WRITER_BASE}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch {
      return {
        ok: false,
        message: "Writer not reachable. Run `npm run token-inspect:writer` in the repo, then try again."
      };
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      const failed = (body.results || []).filter((r) => !r.ok);
      const detail = failed.map((f) => f.error).filter(Boolean).join("; ");
      return {
        ok: false,
        message: body.message || `Push failed (${res.status})`,
        detail,
        body
      };
    }
    return {
      ok: true,
      message: body.message || "Pushed",
      written: body.written || [],
      body
    };
  }

  // extension/panel.js
  var ROOT_ID = "slimvg-token-inspect-root";
  var STYLE_ID = "slimvg-token-inspect-style";
  var ui = null;
  var panelContext = null;
  var activeTab = "css";
  var panelView = { label: "", groups: [] };
  var outsideCloseArmed = false;
  function clearInspectorUi() {
    disarmOutsideClose();
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    ui = null;
    panelContext = null;
  }
  function ensureStyles() {
  }
  function positionBox(box, el) {
    if (!el || !el.isConnected) {
      box.style.display = "none";
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      box.style.display = "none";
      return;
    }
    box.style.display = "block";
    box.style.top = `${rect.top}px`;
    box.style.left = `${rect.left}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }
  function ensureInspectorUi() {
    const stale = document.getElementById(ROOT_ID);
    if (stale && !stale.querySelector(".ti-icon-slot")) {
      stale.remove();
      ui = null;
    }
    if (ui?.panel?.isConnected) return ui;
    ui = null;
    document.getElementById(ROOT_ID)?.remove();
    ensureStyles();
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
    <div class="ti-box hover" style="display:none"></div>
    <div class="ti-box select" style="display:none"></div>
    <aside class="ti-panel" role="dialog" aria-label="Token inspector">
      <div class="ti-header">
        <div class="ti-selector">Select an element</div>
        <button type="button" class="ti-close" aria-label="Close">\xD7</button>
      </div>
      <div class="ti-hint">
        <span class="ti-hint-text">Hover a value to edit \xB7 click an icon to paste a new path</span>
      </div>
      <div class="ti-icon-slot" hidden></div>
      <div class="ti-tabs" role="tablist" aria-label="Inspector views">
        <button type="button" class="ti-tab active" role="tab" aria-selected="true" data-tab="css">CSS</button>
        <button type="button" class="ti-tab" role="tab" aria-selected="false" data-tab="design">Design</button>
      </div>
      <div class="ti-body"></div>
    </aside>
  `;
    document.documentElement.appendChild(root);
    const panel = root.querySelector(".ti-panel");
    panel.querySelector(".ti-close").addEventListener("click", () => {
      ui?.onClose?.();
    });
    for (const tab of panel.querySelectorAll(".ti-tab")) {
      tab.addEventListener("click", (event) => {
        event.stopPropagation();
        const next = tab.getAttribute("data-tab");
        if (next !== "css" && next !== "design") return;
        if (activeTab === next) return;
        activeTab = next;
        showInspectPanel(panelView.label, panelView.groups, panelContext);
      });
    }
    ui = {
      hoverBox: root.querySelector(".ti-box.hover"),
      selectBox: root.querySelector(".ti-box.select"),
      panel
    };
    return ui;
  }
  function syncTabButtons(panel) {
    for (const tab of panel.querySelectorAll(".ti-tab")) {
      const isActive = tab.getAttribute("data-tab") === activeTab;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    }
  }
  function setHoverTarget(el) {
    const current = ensureInspectorUi();
    positionBox(current.hoverBox, el);
  }
  function setSelectTarget(el) {
    const current = ensureInspectorUi();
    positionBox(current.selectBox, el);
    current.hoverBox.style.display = "none";
  }
  function closeAllEditors(except) {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    for (const el of root.querySelectorAll(".ti-dropdown.open, .ti-value-editor.open")) {
      if (el !== except) el.classList.remove("open");
    }
    if (!root.querySelector(".ti-dropdown.open, .ti-value-editor.open")) {
      disarmOutsideClose();
    }
  }
  function onOutsidePointerDown(event) {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const open = root.querySelector(".ti-dropdown.open, .ti-value-editor.open");
    if (!open) {
      disarmOutsideClose();
      return;
    }
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (open.contains(target)) return;
    closeAllEditors();
  }
  function armOutsideClose() {
    if (outsideCloseArmed) return;
    outsideCloseArmed = true;
    window.setTimeout(() => {
      if (!outsideCloseArmed) return;
      document.addEventListener("pointerdown", onOutsidePointerDown, true);
    }, 0);
  }
  function disarmOutsideClose() {
    if (!outsideCloseArmed) return;
    outsideCloseArmed = false;
    document.removeEventListener("pointerdown", onOutsidePointerDown, true);
  }
  function mountDropdown(host, config) {
    closeAllEditors();
    let dropdown2 = host.querySelector(":scope > .ti-dropdown");
    if (!dropdown2) {
      dropdown2 = document.createElement("div");
      dropdown2.className = "ti-dropdown";
      host.appendChild(dropdown2);
    }
    dropdown2.replaceChildren();
    dropdown2.classList.add("open");
    armOutsideClose();
    const search = document.createElement("input");
    search.className = "ti-dropdown-search";
    search.type = "search";
    search.placeholder = "Filter tokens\u2026";
    dropdown2.appendChild(search);
    const list = document.createElement("div");
    dropdown2.appendChild(list);
    function renderOptions(filter = "") {
      list.replaceChildren();
      const q = filter.trim().toLowerCase();
      const filtered = config.options.filter(
        (opt) => !q || opt.name.toLowerCase().includes(q) || opt.label.toLowerCase().includes(q)
      );
      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "ti-dropdown-empty";
        empty.textContent = "No matching tokens";
        list.appendChild(empty);
        return;
      }
      for (const opt of filtered) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ti-dropdown-option";
        if (opt.name === config.currentRef) btn.classList.add("active");
        if (opt.swatch) {
          const swatch = document.createElement("span");
          swatch.className = "ti-swatch";
          swatch.style.background = opt.swatch;
          btn.appendChild(swatch);
        }
        btn.appendChild(document.createTextNode(opt.name));
        btn.title = opt.label;
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          dropdown2.classList.remove("open");
          config.onPick(opt.name);
        });
        list.appendChild(btn);
      }
    }
    renderOptions();
    search.addEventListener("input", () => renderOptions(search.value));
    search.addEventListener("click", (e) => e.stopPropagation());
    requestAnimationFrame(() => search.focus());
  }
  function mountValueEditor(host, config) {
    closeAllEditors();
    let editor = host.querySelector(":scope > .ti-value-editor");
    if (!editor) {
      editor = document.createElement("div");
      editor.className = "ti-value-editor";
      host.appendChild(editor);
    }
    editor.replaceChildren();
    editor.classList.add("open");
    armOutsideClose();
    const options = config.options ?? [];
    const allowCustom = config.allowCustom !== false;
    const valueKind = config.valueKind ?? detectRawValueKind(config.currentValue);
    if (allowCustom) {
      const form = document.createElement("form");
      form.className = "ti-value-editor-form";
      const textInput = document.createElement("input");
      textInput.className = "ti-value-input";
      textInput.type = "text";
      textInput.value = config.currentValue;
      textInput.placeholder = config.placeholder ?? "Enter value\u2026";
      if (valueKind === "color") {
        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.className = "ti-color-input";
        const hexMatch = config.currentValue.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        colorInput.value = hexMatch ? normalizeHexForColorInput(config.currentValue.trim()) : "#000000";
        colorInput.addEventListener("input", () => {
          textInput.value = colorInput.value;
        });
        form.appendChild(colorInput);
      }
      form.appendChild(textInput);
      const apply = document.createElement("button");
      apply.type = "submit";
      apply.className = "ti-apply";
      apply.textContent = "Apply";
      form.appendChild(apply);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = textInput.value.trim();
        if (!next) return;
        editor.classList.remove("open");
        config.onCommit(next);
      });
      textInput.addEventListener("click", (e) => e.stopPropagation());
      editor.appendChild(form);
      requestAnimationFrame(() => textInput.focus());
    }
    if (options.length) {
      const list = document.createElement("div");
      for (const opt of options) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ti-dropdown-option";
        if (opt === config.currentValue) btn.classList.add("active");
        if (/^#|^rgb/i.test(opt) || opt === "transparent") {
          const swatch = document.createElement("span");
          swatch.className = "ti-swatch";
          swatch.style.background = opt === "transparent" ? "transparent" : opt;
          btn.appendChild(swatch);
        }
        btn.appendChild(document.createTextNode(opt));
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          editor.classList.remove("open");
          config.onCommit(opt);
        });
        list.appendChild(btn);
      }
      editor.appendChild(list);
    }
  }
  function normalizeHexForColorInput(hex) {
    const h = hex.replace("#", "");
    if (h.length === 3) {
      return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    }
    return `#${h.slice(0, 6)}`;
  }
  function replaceVarRef(value, fromName, toName) {
    const re = new RegExp(`var\\(\\s*${fromName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*([,)])`, "g");
    return value.replace(re, `var(${toName}$1`);
  }
  function withCurrentGridOption(options, currentValue) {
    const trimmed = currentValue.trim();
    if (!trimmed) return options;
    if (options.includes(trimmed)) return options;
    return [trimmed, ...options];
  }
  var EDIT_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M2 14V11.1667L10.8 2.38333C10.9333 2.26111 11.0807 2.16667 11.242 2.1C11.4033 2.03333 11.5727 2 11.75 2C11.9273 2 12.0996 2.03333 12.2667 2.1C12.4338 2.16667 12.5782 2.26667 12.7 2.4L13.6167 3.33333C13.75 3.45556 13.8473 3.6 13.9087 3.76667C13.97 3.93333 14.0004 4.1 14 4.26667C14 4.44444 13.9696 4.614 13.9087 4.77533C13.8478 4.93667 13.7504 5.08378 13.6167 5.21667L4.83333 14H2ZM11.7333 5.2L12.6667 4.26667L11.7333 3.33333L10.8 4.26667L11.7333 5.2Z" fill="currentColor"/></svg>';
  function createEditButton(title) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ti-edit";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.innerHTML = EDIT_ICON_SVG;
    return btn;
  }
  function appendPropertyChips(host, prop) {
    if (prefersFullValueEdit(prop.property)) {
      const chip = document.createElement("span");
      chip.className = "ti-token-chip wide";
      chip.textContent = prop.value;
      chip.title = prop.value;
      host.appendChild(chip);
      return;
    }
    const refs = extractVarRefs(prop.value);
    if (refs.length === 0) {
      const chip = document.createElement("span");
      chip.className = "ti-token-chip";
      chip.textContent = prop.trees?.[0]?.name || prop.value;
      chip.title = prop.value;
      host.appendChild(chip);
      return;
    }
    refs.forEach((ref, index) => {
      if (index > 0) {
        const sep = document.createElement("span");
        sep.className = "ti-token-sep";
        sep.textContent = "\xB7";
        host.appendChild(sep);
      }
      const chip = document.createElement("span");
      chip.className = "ti-token-chip";
      const tree = prop.trees?.[index];
      const terminal = tree ? terminalValue(tree) : "";
      if (refs.length > 1 && terminal && !terminal.startsWith("var(")) {
        chip.textContent = `${ref} = ${terminal}`;
        chip.classList.add("wide");
      } else {
        chip.textContent = ref;
      }
      chip.title = tree ? `${ref}${terminal ? ` \u2192 ${terminal}` : ""}` : prop.value;
      host.appendChild(chip);
    });
  }
  function showInspectPanel(label, groups, context) {
    const current = ensureInspectorUi();
    panelContext = context ?? null;
    panelView = { label, groups: groups ?? [] };
    current.panel.classList.add("open");
    current.panel.querySelector(".ti-selector").textContent = label;
    syncTabButtons(current.panel);
    const hint = current.panel.querySelector(".ti-hint");
    hint.replaceChildren();
    const hintText = document.createElement("span");
    hintText.className = "ti-hint-text";
    const count = overrideCount();
    if (count) {
      hintText.textContent = `${count} pending edit(s) \xB7 preview only until Push`;
    } else if (activeTab === "design") {
      hintText.textContent = "Design view \xB7 edit values like Figma \xB7 Push writes files";
    } else {
      hintText.textContent = "Hover a value to edit \xB7 click an icon to paste a new path";
    }
    hint.appendChild(hintText);
    if (count) {
      const actions = document.createElement("div");
      actions.className = "ti-hint-actions";
      if (context?.onReset) {
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "ti-reset";
        reset.textContent = "Reset";
        reset.addEventListener("click", (e) => {
          e.stopPropagation();
          context.onReset();
        });
        actions.appendChild(reset);
      }
      const push = document.createElement("button");
      push.type = "button";
      push.className = "ti-push";
      push.textContent = `Push ${count} change${count === 1 ? "" : "s"}`;
      push.addEventListener("click", async (e) => {
        e.stopPropagation();
        push.disabled = true;
        push.textContent = "Pushing\u2026";
        setPushStatus("Writing files\u2026", null);
        const result = await pushEditsToWriter(listPendingEdits());
        if (result.ok) {
          setPushStatus(
            `${result.message}${result.written?.length ? `: ${result.written.join(", ")}` : ""}`,
            "ok"
          );
          context?.onPushed?.();
        } else {
          setPushStatus(
            result.detail ? `${result.message} \u2014 ${result.detail}` : result.message,
            "error"
          );
          push.disabled = false;
          push.textContent = `Push ${overrideCount()} change${overrideCount() === 1 ? "" : "s"}`;
        }
      });
      actions.appendChild(push);
      hint.appendChild(actions);
    }
    current.panel.querySelector(".ti-push-status")?.remove();
    renderPanelBody();
  }
  function renderPanelBody() {
    const current = ensureInspectorUi();
    const body = current.panel.querySelector(".ti-body");
    const iconSlot = current.panel.querySelector(".ti-icon-slot");
    body.replaceChildren();
    iconSlot?.replaceChildren();
    const groups = panelView.groups;
    const svg = relatedIconSvg(panelContext?.element);
    const editor = svg ? renderIconEditor(svg) : null;
    if (iconSlot) {
      if (editor) {
        iconSlot.hidden = false;
        iconSlot.appendChild(editor);
      } else {
        iconSlot.hidden = true;
      }
    } else if (editor) {
      body.appendChild(editor);
    }
    if (!groups.length && !svg) {
      const empty = document.createElement("div");
      empty.className = "ti-design-empty";
      empty.textContent = "No matching stylesheet rules found for this element.";
      body.appendChild(empty);
      return;
    }
    if (!groups.length) return;
    if (activeTab === "design") {
      renderDesignBody(body, groups);
    } else {
      renderCssBody(body, groups);
    }
  }
  function renderIconEditor(svg) {
    const section = document.createElement("section");
    section.className = "ti-group ti-icon-editor";
    const title = document.createElement("div");
    title.className = "ti-group-title";
    title.textContent = "Icon path";
    const file = document.createElement("span");
    file.className = "ti-group-file";
    file.textContent = "paste d to change";
    title.appendChild(file);
    section.appendChild(title);
    const previewRow = document.createElement("div");
    previewRow.className = "ti-icon-preview-row";
    const preview = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    preview.classList.add("ti-icon-preview");
    preview.setAttribute("viewBox", svg.getAttribute("viewBox") || "0 0 24 24");
    preview.setAttribute("aria-hidden", "true");
    preview.innerHTML = svg.innerHTML;
    previewRow.appendChild(preview);
    const current = document.createElement("div");
    current.className = "ti-icon-current";
    const d = firstPathD(svg);
    current.textContent = d ? `d: ${d.length > 96 ? `${d.slice(0, 96)}\u2026` : d}` : "No path d on this SVG";
    current.title = d;
    previewRow.appendChild(current);
    section.appendChild(previewRow);
    const help = document.createElement("p");
    help.className = "ti-icon-help";
    help.textContent = "Paste a path d, a <path>, or a full <svg>. The glyph on the left updates as you paste. Preview icon also updates the page.";
    section.appendChild(help);
    const form = document.createElement("form");
    form.className = "ti-icon-form";
    const area = document.createElement("textarea");
    area.className = "ti-icon-paste";
    area.rows = 5;
    area.placeholder = "M6 6l12 12M18 6L6 18";
    area.addEventListener("click", (e) => e.stopPropagation());
    area.addEventListener("keydown", (e) => e.stopPropagation());
    area.addEventListener("input", () => {
      const parsed = parsePastedIcon(area.value);
      if (!parsed?.paths?.length) return;
      if (parsed.viewBox) preview.setAttribute("viewBox", parsed.viewBox);
      preview.replaceChildren();
      for (const pathD of parsed.paths) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathD);
        preview.appendChild(path);
      }
    });
    form.appendChild(area);
    const apply = document.createElement("button");
    apply.type = "submit";
    apply.className = "ti-apply";
    apply.textContent = "Preview icon";
    form.appendChild(apply);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const parsed = parsePastedIcon(area.value);
      if (!parsed) {
        setPushStatus("Could not parse that SVG / path data", "error");
        return;
      }
      const originalD = svg.__tiOrigD || firstPathD(svg);
      if (!originalD) {
        setPushStatus("This SVG has no path d to replace in source", "error");
        return;
      }
      applySvgPreview(svg, parsed);
      previewSvgPathOverride({ from: originalD, to: parsed.paths[0] });
      showInspectPanel(panelView.label, panelView.groups, panelContext);
    });
    section.appendChild(form);
    return section;
  }
  function renderCssBody(body, groups) {
    for (const group of groups) {
      const section = document.createElement("section");
      section.className = "ti-group";
      const title = document.createElement("div");
      title.className = "ti-group-title";
      title.textContent = group.selector;
      if (group.file && group.file !== "inline") {
        const file = document.createElement("span");
        file.className = "ti-group-file";
        file.textContent = group.file;
        title.appendChild(file);
      }
      section.appendChild(title);
      for (const prop of group.properties) {
        const displayProp = applyOverrideToProp(prop, group.selector, panelContext?.registry);
        section.appendChild(renderProperty(displayProp, group));
      }
      body.appendChild(section);
    }
  }
  function renderDesignBody(body, groups) {
    const winning = flattenWinningProps(
      groups,
      (prop, selector) => applyOverrideToProp(prop, selector, panelContext?.registry)
    );
    const sections = listPresentDesignSections(winning);
    const showLayout = hasLayoutEditorContent(winning);
    if (!showLayout && !sections.length) {
      const empty = document.createElement("div");
      empty.className = "ti-design-empty";
      empty.textContent = "No Design-mapped properties on this element. Switch to CSS for the full list.";
      body.appendChild(empty);
      return;
    }
    if (showLayout) {
      const computedDisplay = panelContext?.element instanceof Element ? getComputedStyle(panelContext.element).display : "";
      body.appendChild(
        renderLayoutEditor(winning, {
          registry: panelContext?.registry,
          computedDisplay,
          onCommit: (hit, next) => {
            if (!hit?.prop || !hit?.group) return;
            commitPropertyEdit(hit.group, { ...hit.prop, property: hit.property }, next);
          }
        })
      );
    }
    for (const section of sections) {
      const el = document.createElement("section");
      el.className = "ti-design-section";
      const title = document.createElement("div");
      title.className = "ti-design-title";
      title.textContent = section.title;
      el.appendChild(title);
      for (const row2 of section.rows) {
        const propEl = renderProperty(row2.prop, row2.group, row2.label);
        const source = document.createElement("span");
        source.className = "ti-design-source";
        source.textContent = row2.group.selector;
        source.title = [row2.group.selector, row2.group.file].filter(Boolean).join(" \xB7 ");
        propEl.querySelector(".ti-prop-name")?.appendChild(source);
        el.appendChild(propEl);
      }
      body.appendChild(el);
    }
  }
  function setPushStatus(text, kind) {
    const panel = document.querySelector(`#${ROOT_ID} .ti-panel`);
    if (!panel) return;
    let status = panel.querySelector(".ti-push-status");
    if (!status) {
      status = document.createElement("div");
      status.className = "ti-push-status";
      const hint = panel.querySelector(".ti-hint");
      hint?.insertAdjacentElement("afterend", status);
    }
    status.textContent = text;
    status.classList.remove("error", "ok");
    if (kind) status.classList.add(kind);
  }
  function groupFileMeta(group) {
    const sourcePath = group.sourcePath || "";
    let file = group.file || "";
    if (sourcePath.startsWith("src/")) {
      file = `apps/frontend/${sourcePath}`;
    } else if (file && file !== "inline" && file.endsWith(".css") && !file.includes("/")) {
      file = file;
    }
    return { file, sourcePath };
  }
  function commitPropertyEdit(group, prop, next) {
    const { file, sourcePath } = groupFileMeta(group);
    previewPropertyOverride({
      selector: group.selector,
      property: prop.property,
      from: prop._sourceValue ?? prop.value,
      to: next,
      file,
      sourcePath
    });
    panelContext?.onRefresh?.();
  }
  function commitTokenEdit(tokenName, from, to) {
    if (!panelContext?.registry) return;
    const entry = panelContext.registry.get(tokenName);
    previewTokenOverride({
      tokenName,
      from,
      to,
      file: normalizeTokenFile(entry?.file || ""),
      registry: panelContext.registry
    });
    panelContext.onRefresh?.();
  }
  function applyOverrideToProp(prop, selector, registry) {
    const overridden = getPropertyOverride(selector, prop.property);
    if (!overridden) return prop;
    const trees = registry ? resolveValueTrees(overridden, registry) : [];
    let swatch = prop.swatch;
    if (trees.length) {
      const terminal = terminalValue(trees[0]);
      const normalized = normalizeColor(terminal);
      if (normalized.startsWith("#") || /^rgb/i.test(terminal)) {
        swatch = terminal;
      }
    } else if (/^#|^rgb/i.test(overridden) || overridden === "transparent") {
      swatch = overridden;
    }
    return {
      ...prop,
      _sourceValue: prop._sourceValue ?? prop.value,
      value: overridden,
      trees,
      swatch,
      hasTokens: trees.length > 0,
      preview: true
    };
  }
  function renderProperty(prop, group, label) {
    const wrap = document.createElement("div");
    wrap.className = "ti-prop";
    const row2 = document.createElement("div");
    row2.className = "ti-prop-row";
    const name = document.createElement("div");
    name.className = "ti-prop-name";
    name.textContent = label || prop.property;
    row2.appendChild(name);
    const valueCell = document.createElement("div");
    if (prop.trees?.length) {
      const head = document.createElement("div");
      head.className = "ti-editable";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ti-token-btn";
      btn.setAttribute("aria-expanded", "false");
      if (prop.swatch && prop.trees.length === 1) {
        const swatch = document.createElement("span");
        swatch.className = "ti-swatch";
        swatch.style.background = prop.swatch;
        btn.appendChild(swatch);
      }
      appendPropertyChips(btn, prop);
      const chevron = document.createElement("span");
      chevron.className = "ti-chevron";
      chevron.textContent = "\u25B8";
      btn.appendChild(chevron);
      if (prop.preview) {
        const badge = document.createElement("span");
        badge.className = "ti-preview-badge";
        badge.textContent = "preview";
        head.appendChild(badge);
      }
      const tree = document.createElement("div");
      tree.className = "ti-tree";
      for (const node of prop.trees) {
        tree.appendChild(renderTreeNode(node, 0));
      }
      btn.addEventListener("click", () => {
        const open = tree.classList.toggle("open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      head.appendChild(btn);
      const valueEditor = getPropertyValueEditor(prop.property);
      if (prefersFullValueEdit(prop.property) && valueEditor) {
        const tracksEdit = createEditButton("Edit grid tracks / ratios");
        tracksEdit.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          mountValueEditor(valueCell, {
            currentValue: prop.value,
            options: withCurrentGridOption(valueEditor.options, prop.value),
            allowCustom: true,
            valueKind: "text",
            placeholder: "e.g. 2.5rem 2fr 4fr 1fr",
            onCommit: (next) => commitPropertyEdit(group, prop, next)
          });
        });
        head.appendChild(tracksEdit);
      } else {
        const propEdit = editableTargetForProperty(prop);
        if (propEdit && panelContext?.registry) {
          const editBtn = createEditButton(`Reassign ${propEdit.optionLayer} token`);
          editBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            tree.classList.add("open");
            btn.setAttribute("aria-expanded", "true");
            const options = listTokensByLayerAndKind(
              panelContext.registry,
              propEdit.optionLayer,
              propEdit.kind
            );
            mountDropdown(valueCell, {
              options,
              currentRef: propEdit.currentRef,
              onPick: (tokenName) => {
                const refs = extractVarRefs(prop.value);
                const fromRef = refs[0] || propEdit.currentRef;
                const nextValue = refs.length > 0 ? replaceVarRef(prop.value, fromRef, tokenName) : `var(${tokenName})`;
                commitPropertyEdit(group, prop, nextValue);
              }
            });
          });
          head.appendChild(editBtn);
        }
      }
      valueCell.appendChild(head);
      valueCell.appendChild(tree);
    } else {
      const literalRow = document.createElement("div");
      literalRow.className = "ti-literal-row";
      const literal = document.createElement("div");
      literal.className = "ti-literal";
      if (prop.swatch) {
        const swatch = document.createElement("span");
        swatch.className = "ti-swatch";
        swatch.style.background = prop.swatch;
        swatch.style.display = "inline-block";
        swatch.style.marginRight = "6px";
        swatch.style.verticalAlign = "middle";
        literal.appendChild(swatch);
      }
      literal.appendChild(document.createTextNode(prop.value));
      literalRow.appendChild(literal);
      if (prop.preview) {
        const badge = document.createElement("span");
        badge.className = "ti-preview-badge";
        badge.textContent = "preview";
        literalRow.appendChild(badge);
      }
      const valueEditor = getPropertyValueEditor(prop.property);
      if (valueEditor) {
        literalRow.classList.add("ti-editable");
        const editBtn = createEditButton(
          valueEditor.mode === "keywords" ? `Change ${prop.property}` : `Edit ${prop.property}`
        );
        editBtn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          mountValueEditor(valueCell, {
            currentValue: prop.value,
            options: valueEditor.options,
            allowCustom: valueEditor.mode !== "keywords",
            valueKind: valueEditor.mode === "color" ? "color" : valueEditor.mode === "size" ? "length" : detectRawValueKind(prop.value),
            placeholder: valueEditor.mode === "size" ? "e.g. 90%, fit-content, 2rem" : `New ${prop.property} value`,
            onCommit: (next) => commitPropertyEdit(group, prop, next)
          });
        });
        literalRow.appendChild(editBtn);
      }
      valueCell.appendChild(literalRow);
    }
    row2.appendChild(valueCell);
    wrap.appendChild(row2);
    return wrap;
  }
  function renderTreeNode(node, depth) {
    const wrap = document.createElement("div");
    wrap.className = "ti-tree-node";
    wrap.style.marginLeft = `${depth * 8}px`;
    const line = document.createElement("div");
    line.className = "ti-tree-line";
    const layer = document.createElement("span");
    layer.className = `ti-layer ${node.layer}`;
    layer.textContent = node.layer;
    line.appendChild(layer);
    const tokenName = document.createElement("span");
    tokenName.className = "ti-tree-name";
    tokenName.textContent = node.name;
    line.appendChild(tokenName);
    if (node.terminal) {
      const val = document.createElement("span");
      val.className = "ti-tree-value";
      val.textContent = `= ${node.value}`;
      line.appendChild(val);
      if (/^#|^rgb/i.test(node.value)) {
        const swatch = document.createElement("span");
        swatch.className = "ti-swatch";
        swatch.style.background = node.value;
        line.appendChild(swatch);
      }
    }
    const nodeEdit = editableTargetForNode(node);
    if (nodeEdit && panelContext?.registry) {
      line.classList.add("ti-editable");
      const editBtn = createEditButton(
        nodeEdit.optionLayer === "primitive" ? "Reassign primitive" : "Reassign semantic"
      );
      editBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const options = listTokensByLayerAndKind(
          panelContext.registry,
          nodeEdit.optionLayer,
          nodeEdit.kind
        );
        mountDropdown(wrap, {
          options,
          currentRef: nodeEdit.currentRef,
          onPick: (tokenName2) => {
            const declared = panelContext.registry.get(nodeEdit.tokenName)?.value || `var(${nodeEdit.currentRef})`;
            commitTokenEdit(nodeEdit.tokenName, declared, `var(${tokenName2})`);
          }
        });
      });
      line.appendChild(editBtn);
    }
    if (node.layer === "primitive" && node.terminal && panelContext?.registry) {
      line.classList.add("ti-editable");
      const rawEdit = createEditButton("Edit raw value");
      rawEdit.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const kind = detectRawValueKind(node.value);
        mountValueEditor(wrap, {
          currentValue: node.value,
          options: kind === "length" ? ["0", "0.25rem", "0.5rem", "1rem", "1.5rem", "2rem", "2.5rem", "3rem", "4rem"] : [],
          allowCustom: true,
          valueKind: kind,
          placeholder: kind === "color" ? "#hex or rgb()" : kind === "length" ? "e.g. 1rem, 16px" : "Raw value",
          onCommit: (next) => {
            const declared = panelContext.registry.get(node.name)?.value || node.value;
            commitTokenEdit(node.name, declared, next);
          }
        });
      });
      line.appendChild(rawEdit);
    }
    wrap.appendChild(line);
    for (const child of node.children || []) {
      wrap.appendChild(renderTreeNode(child, depth + 1));
    }
    return wrap;
  }
  function hidePanel() {
    if (!ui) return;
    ui.panel.classList.remove("open");
    ui.selectBox.style.display = "none";
    ui.hoverBox.style.display = "none";
  }
  function setOnClose(fn) {
    ensureInspectorUi().onClose = fn;
  }
  function reposition(selectedEl2, hoverEl2) {
    if (!ui) return;
    if (selectedEl2) positionBox(ui.selectBox, selectedEl2);
    if (hoverEl2) positionBox(ui.hoverBox, hoverEl2);
  }

  // extension/inspector.js
  var STORAGE_KEY = "tokenInspectEnabled";
  var tokenRegistry = null;
  var enabled = false;
  var selectedEl = null;
  var hoverEl = null;
  function isOurUi(el) {
    return Boolean(el?.closest?.("#slimvg-token-inspect-root"));
  }
  async function ensureRegistry() {
    if (!tokenRegistry) {
      tokenRegistry = await loadTokenRegistry();
    }
    return tokenRegistry;
  }
  function refreshSelectedPanel() {
    if (!selectedEl || !tokenRegistry) return;
    const groups = collectMatchedStyles(selectedEl, tokenRegistry);
    showInspectPanel(elementLabel(selectedEl), groups, {
      registry: tokenRegistry,
      element: selectedEl,
      onRefresh: refreshSelectedPanel,
      onReset: () => {
        clearOverrides(tokenRegistry);
        tokenRegistry = null;
        ensureRegistry().then(() => refreshSelectedPanel());
      },
      onPushed: () => {
        clearOverrides(tokenRegistry);
        tokenRegistry = null;
        setTimeout(() => {
          ensureRegistry().then(() => refreshSelectedPanel());
        }, 300);
      }
    });
  }
  function onMouseMove(event) {
    if (!enabled) return;
    const target = event.target;
    if (!(target instanceof Element) || isOurUi(target)) {
      setHoverTarget(null);
      hoverEl = null;
      return;
    }
    const hoverTarget = relatedIconSvg(target) || target;
    hoverEl = hoverTarget;
    if (selectedEl !== hoverTarget) setHoverTarget(hoverTarget);
  }
  async function onClick(event) {
    if (!enabled) return;
    const target = event.target;
    if (!(target instanceof Element) || isOurUi(target)) return;
    event.preventDefault();
    event.stopPropagation();
    selectedEl = relatedIconSvg(target) || target;
    hoverEl = null;
    setSelectTarget(selectedEl);
    setHoverTarget(null);
    await ensureRegistry();
    refreshSelectedPanel();
  }
  function onKeyDown(event) {
    if (!enabled) return;
    if (event.key === "Escape") {
      const openEditor = document.querySelector(
        "#slimvg-token-inspect-root .ti-dropdown.open, #slimvg-token-inspect-root .ti-value-editor.open"
      );
      if (openEditor) {
        event.preventDefault();
        openEditor.classList.remove("open");
        return;
      }
      event.preventDefault();
      setEnabled(false);
    }
  }
  function onScrollOrResize() {
    if (!enabled) return;
    reposition(selectedEl, hoverEl);
  }
  async function setEnabled(next) {
    if (next === enabled) {
      if (next) ensureInspectorUi();
      return;
    }
    enabled = next;
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    if (enabled) {
      ensureInspectorUi();
      setOnClose(() => setEnabled(false));
      document.addEventListener("mousemove", onMouseMove, true);
      document.addEventListener("click", onClick, true);
      document.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("scroll", onScrollOrResize, true);
      window.addEventListener("resize", onScrollOrResize);
      document.documentElement.style.cursor = "crosshair";
      await ensureRegistry();
    } else {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.documentElement.style.cursor = "";
      selectedEl = null;
      hoverEl = null;
      hidePanel();
      clearInspectorUi();
    }
  }
  window.addEventListener("slimvg-token-inspect-teardown", () => {
    if (enabled) {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.documentElement.style.cursor = "";
    }
    enabled = false;
    selectedEl = null;
    hoverEl = null;
    hidePanel();
    clearInspectorUi();
  });
  var TI_BUILD = "2.2.1";
  function getStatus() {
    return {
      enabled,
      selected: selectedEl ? elementLabel(selectedEl) : null,
      tokens: tokenRegistry?.size ?? 0,
      version: TI_BUILD
    };
  }
  async function enableInspect() {
    await setEnabled(true);
    return getStatus();
  }
  async function disableInspect() {
    await setEnabled(false);
    return getStatus();
  }
  async function initFromStorage() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    if (result[STORAGE_KEY]) {
      await setEnabled(true);
    }
  }

  // extension/content.js
  window.dispatchEvent(new Event("slimvg-token-inspect-teardown"));
  document.getElementById("slimvg-token-inspect-root")?.remove();
  document.getElementById("slimvg-token-inspect-style")?.remove();
  globalThis.__slimvgTokenInspectBuild = TI_BUILD;
  if (!globalThis.__slimvgTokenInspectListener) {
    globalThis.__slimvgTokenInspectListener = true;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const handle = globalThis.__slimvgTokenInspectHandle;
      if (!handle) {
        sendResponse({ error: "not-ready" });
        return false;
      }
      handle(message).then(sendResponse).catch((err) => {
        console.error("[Token Inspect]", err);
        sendResponse({ error: String(err) });
      });
      return true;
    });
  }
  globalThis.__slimvgTokenInspectHandle = async (message) => {
    switch (message.type) {
      case "PING":
        return { ok: true, version: TI_BUILD };
      case "ENABLE":
        return enableInspect();
      case "DISABLE":
        return disableInspect();
      case "GET_STATUS":
        return getStatus();
      default:
        return null;
    }
  };
  initFromStorage();
})();

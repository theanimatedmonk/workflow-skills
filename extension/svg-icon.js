/** Closest SVG for a click target (path, g, svg, …). */
export function closestSvg(el) {
  if (!(el instanceof Element)) return null;
  return el.closest?.('svg') ?? (el.tagName?.toLowerCase() === 'svg' ? el : null);
}

/** SVG to inspect: the node itself, a wrapping `.icon`, or a direct-child icon. */
export function relatedIconSvg(el) {
  if (!(el instanceof Element)) return null;
  const svg = closestSvg(el);
  if (svg) return svg;
  const marked = el.closest?.('.icon, [data-ti-icon]');
  if (marked) {
    return marked.tagName.toLowerCase() === 'svg' ? marked : marked.querySelector('svg');
  }
  return el.querySelector?.(':scope > .icon, :scope > [data-ti-icon], :scope > svg') || null;
}

export function firstPathD(svg) {
  const path = svg?.querySelector?.('path');
  return path?.getAttribute('d')?.trim() || '';
}

/**
 * Accept a raw `d` string, `<path d="…">`, or a full `<svg>…</svg>`.
 * @returns {{ paths: string[], viewBox: string } | null}
 */
export function parsePastedIcon(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  if (text.includes('<')) {
    const wrapped = /<svg[\s>]/i.test(text)
      ? text
      : `<svg xmlns="http://www.w3.org/2000/svg">${text}</svg>`;
    const doc = new DOMParser().parseFromString(wrapped, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return null;
    const svg = doc.querySelector('svg');
    if (!svg) return null;
    const paths = [...svg.querySelectorAll('path')]
      .map((p) => p.getAttribute('d')?.trim())
      .filter(Boolean);
    if (!paths.length) return null;
    return { paths, viewBox: svg.getAttribute('viewBox')?.trim() || '' };
  }

  return { paths: [text], viewBox: '' };
}

export function applySvgPreview(svg, parsed) {
  if (!svg || !parsed?.paths?.length) return;
  if (svg.__tiOrigInner == null) {
    svg.__tiOrigInner = svg.innerHTML;
    svg.__tiOrigViewBox = svg.getAttribute('viewBox');
    svg.__tiOrigD = firstPathD(svg);
  }
  for (const el of svg.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse')) {
    el.remove();
  }
  for (const d of parsed.paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  if (parsed.viewBox) svg.setAttribute('viewBox', parsed.viewBox);
}

export function restoreSvgPreview(svg) {
  if (!svg || svg.__tiOrigInner == null) return;
  svg.innerHTML = svg.__tiOrigInner;
  if (svg.__tiOrigViewBox != null) {
    if (svg.__tiOrigViewBox) svg.setAttribute('viewBox', svg.__tiOrigViewBox);
    else svg.removeAttribute('viewBox');
  }
  delete svg.__tiOrigInner;
  delete svg.__tiOrigViewBox;
  delete svg.__tiOrigD;
}

export function restoreAllSvgPreviews() {
  for (const svg of document.querySelectorAll('svg')) {
    restoreSvgPreview(svg);
  }
}

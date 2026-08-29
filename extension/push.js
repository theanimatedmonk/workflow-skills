const WRITER_BASE = 'http://127.0.0.1:7319';

/**
 * @param {import('./overrides.js').PendingEdit[]} edits
 */
export async function pushEditsToWriter(edits) {
  if (!edits.length) {
    return { ok: false, message: 'No pending edits' };
  }

  const payload = {
    edits: edits.map((e) => {
      if (e.kind === 'property') {
        return {
          kind: 'property',
          file: e.file,
          sourcePath: e.sourcePath,
          selector: e.selector,
          property: e.property,
          from: e.from,
          to: e.to,
        };
      }
      if (e.kind === 'svg-path') {
        return {
          kind: 'svg-path',
          file: e.file,
          from: e.from,
          to: e.to,
        };
      }
      return {
        kind: 'token',
        file: e.file,
        tokenName: e.tokenName,
        from: e.from,
        to: e.to,
      };
    }),
  };

  let res;
  try {
    res = await fetch(`${WRITER_BASE}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      ok: false,
      message:
        'Writer not reachable. Run `npm run token-inspect:writer` in the repo, then try again.',
    };
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const failed = (body.results || []).filter((r) => !r.ok);
    const detail = failed.map((f) => f.error).filter(Boolean).join('; ');
    return {
      ok: false,
      message: body.message || `Push failed (${res.status})`,
      detail,
      body,
    };
  }

  return {
    ok: true,
    message: body.message || 'Pushed',
    written: body.written || [],
    body,
  };
}

export async function checkWriterHealth() {
  try {
    const res = await fetch(`${WRITER_BASE}/health`);
    if (!res.ok) return false;
    const body = await res.json();
    return Boolean(body.ok);
  } catch {
    return false;
  }
}

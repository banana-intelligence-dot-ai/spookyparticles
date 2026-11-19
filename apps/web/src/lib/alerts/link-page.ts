/**
 * The small page an email link opens with no sign-in (opt-out, retire a job). Dark and plain,
 * never cached, never indexed. Title and body are HTML: escape anything a user typed.
 */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function linkPage(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} · spooky particles</title></head><body style="margin:0;padding:48px 24px;background:#0c0d0f;color:#e6e7e9;font:16px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif"><main style="max-width:52ch;margin:0 auto"><p style="margin:0 0 12px;font:14px ui-monospace,SFMono-Regular,Menlo,monospace;color:#9a9ca1">spooky particles</p><h1 style="margin:0 0 12px;font-size:24px;font-weight:600">${title}</h1><div style="margin:0;color:#c9cbd0">${body}</div></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } },
  );
}

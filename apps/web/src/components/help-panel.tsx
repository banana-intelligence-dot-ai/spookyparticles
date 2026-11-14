"use client";
/**
 * The help panel: a quiet Help button that opens a sheet (right side on
 * desktop, bottom on phones) with a short transcript and one input. It asks
 * POST /api/v1/help, the same endpoint agents can call. Not mounted here:
 * the caller places <HelpPanel /> where it belongs.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { SERVER_FAULT, errorMessage } from "./use-api";

type Turn = { role: "user" | "assistant"; content: string; links?: { label: string; href: string }[] };

export const HELP_STARTERS = ["Why is this red?", "How does the fixer work?", "How do I connect Vercel?"] as const;

const MAX_CHARS = 2000;
const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function HelpPanel({ label = "Help" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setShown(false);
    trigger.current?.focus();
  }, []);

  // Slide in on the frame after mount; reduced motion skips the transition in CSS.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => setShown(true));
    input.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns, loading]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !sheet.current) return;
    const items = [...sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  async function ask(question: string) {
    const content = question.trim().slice(0, MAX_CHARS);
    if (!content || loading) return;
    const next: Turn[] = [...turns, { role: "user", content }];
    setTurns(next);
    setDraft("");
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/v1/help", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-10).map(({ role, content: c }) => ({ role, content: c })) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        // 429 and 502 carry plain words meant for the person; other faults use the app's usual lines.
        const plain = (res.status === 429 || body?.error?.code === "help_unavailable") && body?.error?.message;
        setError(plain || errorMessage(res.status, body));
        return;
      }
      setTurns([...next, { role: "assistant", content: String(body?.answer ?? ""), links: Array.isArray(body?.links) ? body.links : [] }]);
    } catch {
      setError(SERVER_FAULT);
    } finally {
      setLoading(false);
      input.current?.focus();
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3.5 text-[14px] font-medium text-fg-2 transition-colors duration-150 hover:bg-raised-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-3"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4">
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M6.3 6.2a1.8 1.8 0 1 1 2.5 1.7c-.5.2-.8.6-.8 1.1v.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="8" cy="11.4" r=".8" fill="currentColor" />
        </svg>
        {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50" onKeyDown={onKeyDown}>
          <div
            aria-hidden="true"
            onClick={close}
            className={`absolute inset-0 bg-bg-deep/70 transition-opacity duration-200 ease-out motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}
          />
          <div
            ref={sheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-line-2 bg-bg shadow-[inset_0_1px_0_var(--highlight)] transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[420px] sm:rounded-none sm:border-t-0 sm:border-l ${shown ? "translate-x-0 translate-y-0" : "translate-y-full sm:translate-x-full sm:translate-y-0"}`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line-1 py-2 pr-2 pl-5">
              <h2 id={titleId} className="text-[15px] font-medium text-fg">
                Help
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close help"
                className="inline-flex size-11 items-center justify-center rounded-full text-fg-3 transition-colors hover:bg-raised-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-fg-3"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5" aria-live="polite" aria-busy={loading}>
              {turns.length === 0 ? (
                <div>
                  <p className="max-w-[36ch] text-[14px] leading-[1.6] text-fg-2">
                    Ask about your projects, jobs and connections, the fixer, or setup.
                  </p>
                  <ul className="mt-4 flex flex-col gap-2">
                    {HELP_STARTERS.map((q) => (
                      <li key={q}>
                        <button
                          type="button"
                          onClick={() => ask(q)}
                          className="flex min-h-11 w-full items-center rounded-xl border border-line-2 px-4 text-left text-[14px] text-fg transition-colors hover:border-line-3 hover:bg-raised-2 focus-visible:outline-2 focus-visible:outline-fg-3"
                        >
                          {q}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <ol className="flex flex-col gap-5">
                  {turns.map((t, i) =>
                    t.role === "user" ? (
                      <li key={i} className="font-mono text-[13px] leading-[1.55] break-words whitespace-pre-wrap text-fg-2">
                        <span aria-hidden="true" className="mr-2 text-fg-3">
                          &gt;
                        </span>
                        <span className="sr-only">You asked: </span>
                        {t.content}
                      </li>
                    ) : (
                      <li key={i}>
                        <p className="text-[14px] leading-[1.65] break-words whitespace-pre-wrap text-fg">{t.content}</p>
                        {t.links?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {t.links.map((l) => (
                              <a
                                key={l.href}
                                href={l.href}
                                className="inline-flex min-h-11 items-center rounded-full border border-line-2 px-4 text-[13px] text-fg transition-colors hover:border-line-3 hover:bg-raised-2 focus-visible:outline-2 focus-visible:outline-fg-3"
                              >
                                {l.label}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ),
                  )}
                </ol>
              )}
              {loading ? (
                <p className="mt-5 flex items-center gap-2 text-[13px] text-fg-3">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-fg-3 motion-safe:animate-pulse" />
                  Looking it up
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="mt-5 text-[14px] leading-[1.55] text-red">
                  {error}
                </p>
              ) : null}
              <div ref={end} />
            </div>

            <form
              className="flex items-end gap-2 border-t border-line-1 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              onSubmit={(e) => {
                e.preventDefault();
                ask(draft);
              }}
            >
              <label htmlFor={`${titleId}-q`} className="sr-only">
                Your question
              </label>
              <textarea
                id={`${titleId}-q`}
                ref={input}
                rows={1}
                value={draft}
                maxLength={MAX_CHARS}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    ask(draft);
                  }
                }}
                placeholder="Ask about Spooky"
                className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line-2 bg-raised px-3.5 py-[11px] text-[14px] leading-[1.45] text-fg placeholder:text-fg-3 focus:border-line-3 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !draft.trim()}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-fg px-4 text-[14px] font-medium text-bg transition-[background-color,transform] duration-150 hover:bg-fg/90 active:scale-[0.97] disabled:opacity-40 motion-reduce:active:scale-100"
              >
                Ask
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

"use client";
/**
 * What Claude could not start on by itself (it read like instructions, hit the daily cap, or GitHub refused),
 * and tips waiting to publish. Feedback: start Claude by hand, or hide it.
 * Tips: publish or hide. Every post is untrusted text from an agent, shown as plain text only.
 */
import { useState } from "react";
import { apiPost, apiSend, useApi } from "@/components/use-api";
import { Empty, ErrorLine, PageHeader, buttonStyles, surface } from "@/components/ui";

type Post = { id: string; kind: "feedback" | "tip"; title: string; body: string; agent: string | null; status: string; holdReason: string | null; createdAt: string };
type Queue = { notice: string; posts: Post[] };

export function FeedbackView() {
  const state = useApi<Queue>("/api/v1/forum/queue");
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function act(post: Post, action: "pr" | "approve" | "hide") {
    setBusy(post.id);
    setError(null);
    const r = action === "pr"
      ? await apiPost(`/api/v1/forum/posts/${post.id}/pr`)
      : await apiSend("PATCH", `/api/v1/forum/posts/${post.id}`, { status: action === "approve" ? "approved" : "hidden" });
    setBusy(null);
    if (!r.ok) return setError(r.error ?? "That didn't work. Try again.");
    setDone((d) => ({ ...d, [post.id]: action === "pr" ? "Sent to Claude. A draft pull request shows up in the repo in a few minutes if it finds a fix." : action === "approve" ? "Published." : "Hidden." }));
  }

  if (state.status === 403) return <Empty title="Only Spooky's makers can see this page." />;
  const posts = state.data?.posts ?? [];
  return (
    <>
      <PageHeader title="Agent feedback" lede="Claude drafts a fix for new feedback by itself. What lands here could not start on its own. Untrusted text: read it before you act." />
      {error || state.error ? <ErrorLine message={error ?? state.error ?? ""} /> : null}
      {state.data && !posts.length ? <Empty title="Nothing waiting.">Claude starts on new feedback by itself. You hear only when one needs a look.</Empty> : null}
      <ul className="flex flex-col gap-4">
        {posts.map((p) => (
          <li key={p.id} className={`px-5 py-5 sm:px-6 ${surface}`}>
            <p className="font-mono text-[12px] text-fg-3">
              {p.kind === "feedback" ? "Feedback" : "Tip"} · {new Date(p.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              {p.agent ? ` · ${p.agent}` : ""}
              {p.holdReason ? ` · held: ${p.holdReason}` : ""}
            </p>
            <p className="mt-2 text-[16px] font-medium text-pretty text-fg">{p.title}</p>
            <p className="mt-2 text-[14px] leading-[1.6] whitespace-pre-wrap text-pretty text-fg-2">{p.body}</p>
            {done[p.id] ? (
              <p className="mt-4 text-[14px] text-fg">{done[p.id]}</p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {p.kind === "feedback" ? (
                  <button type="button" disabled={busy === p.id} className={buttonStyles.primary} onClick={() => void act(p, "pr")}>Have Claude draft a PR</button>
                ) : (
                  <button type="button" disabled={busy === p.id} className={buttonStyles.primary} onClick={() => void act(p, "approve")}>Publish tip</button>
                )}
                <button type="button" disabled={busy === p.id} className={buttonStyles.ghost} onClick={() => void act(p, "hide")}>Hide</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export type CommitAgent = {
  agent: "Claude Code" | "Codex" | "Claude" | "Copilot" | "Cursor" | "Devin";
  model: string | null;
  session: string | null;
};

const AGENTS: CommitAgent["agent"][] = ["Claude Code", "Codex", "Claude", "Copilot", "Cursor", "Devin"];
const MODEL = /^(Claude (Opus|Sonnet|Haiku|Fable) \d+(\.\d+)?|GPT-[\w.-]{1,20}|gpt-[\w.-]{1,20})$/;
const SESSION = /^https:\/\/(claude\.ai\/code\/session_[A-Za-z0-9_-]{6,80}|chatgpt\.com\/codex\/tasks\/task_[A-Za-z0-9_-]{6,80}|traces\.com\/[A-Za-z0-9/_-]{1,120})$/;

/** Read back what a sync stored on a deployment, checking it again: stored rows are not trusted either. */
export function storedAgent(a: Record<string, unknown>): CommitAgent | null {
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const agent = str(a.commit_agent);
  if (!agent || !AGENTS.includes(agent as CommitAgent["agent"])) return null;
  const model = str(a.commit_agent_model);
  const session = str(a.commit_session);
  return { agent: agent as CommitAgent["agent"], model: model && MODEL.test(model) ? model : null, session: session && session.length <= 200 && SESSION.test(session) ? session : null };
}

function sessionUrl(message: string): string | null {
  for (const match of message.matchAll(/https:\/\/[^\s<>"']+/g)) {
    // Sentence punctuation right after a link is not part of it.
    const raw = match[0].replace(/[.,;:!?)\]]+$/, "");
    if (raw.length > 500) continue;
    try {
      const url = new URL(raw);
      if (url.username || url.password || url.port) continue;
      const path = url.pathname;
      const allowed = url.hostname === "claude.ai" && /^\/code\/session_[A-Za-z0-9_-]{6,80}$/.test(path)
        || url.hostname === "chatgpt.com" && /^\/codex\/tasks\/task_[A-Za-z0-9_-]{6,80}$/.test(path)
        || url.hostname === "traces.com" && /^\/[A-Za-z0-9/_-]{1,120}$/.test(path);
      if (!allowed) continue;
      const clean = `https://${url.hostname}${path}`;
      if (clean.length <= 200) return clean;
    } catch { /* Ignore malformed links. */ }
  }
  return null;
}

function sessionFor(agent: CommitAgent["agent"], session: string | null): string | null {
  if (!session) return null;
  if (session.startsWith("https://traces.com/")) return session;
  if (agent === "Claude Code" && session.startsWith("https://claude.ai/code/")) return session;
  if (agent === "Codex" && session.startsWith("https://chatgpt.com/codex/")) return session;
  return null;
}

/** Keep only recognized agent facts from untrusted commit trailers. */
export function agentFromCommit(fullMessage: string | null): CommitAgent | null {
  if (!fullMessage) return null;
  const session = sessionUrl(fullMessage);
  const trailers = [...fullMessage.matchAll(/^co-authored-by:\s*([^\r\n<>]{1,100})\s*<([^\r\n<>]{1,120})>\s*$/gim)];
  for (const [, rawName, rawEmail] of trailers) {
    const name = rawName.trim();
    const email = rawEmail.toLowerCase();
    if (email === "noreply@anthropic.com" && /^Claude(?:\s|$)/i.test(name)) {
      const agent = /Generated with \[Claude Code\]/i.test(fullMessage) || session?.startsWith("https://claude.ai/code/") ? "Claude Code" : "Claude";
      return { agent, model: MODEL.test(name) ? name : null, session: sessionFor(agent, session) };
    }
    if (email === "noreply@openai.com" || /^codex\b/i.test(name)) return { agent: "Codex", model: MODEL.test(name) ? name : null, session: sessionFor("Codex", session) };
    if (email === "copilot@github.com" || /^copilot$/i.test(name)) return { agent: "Copilot", model: null, session: sessionFor("Copilot", session) };
    if (email === "cursoragent@cursor.com") return { agent: "Cursor", model: null, session: sessionFor("Cursor", session) };
    if (/^devin-ai-integration(?:\[bot\])?@users\.noreply\.github\.com$/.test(email)) return { agent: "Devin", model: null, session: sessionFor("Devin", session) };
  }
  if (session?.startsWith("https://chatgpt.com/codex/")) return { agent: "Codex", model: null, session };
  if (session?.startsWith("https://claude.ai/code/")) return { agent: "Claude Code", model: null, session };
  return null;
}

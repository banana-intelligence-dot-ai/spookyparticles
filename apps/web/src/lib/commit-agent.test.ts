import { describe, expect, it } from "vitest";
import { agentFromCommit, storedAgent } from "./commit-agent";

describe("agentFromCommit", () => {
  it("reads a Claude Code trailer and session from the full message", () => {
    expect(agentFromCommit("Ship map\n\nGenerated with [Claude Code]\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nhttps://claude.ai/code/session_abc12345?token=private#part"))
      .toEqual({ agent: "Claude Code", model: "Claude Opus 5.5", session: "https://claude.ai/code/session_abc12345" });
  });

  it("recognizes known agent trailers", () => {
    expect(agentFromCommit("Ship\nco-authored-by: Claude Sonnet 4.5 <noreply@anthropic.com>"))
      .toEqual({ agent: "Claude", model: "Claude Sonnet 4.5", session: null });
    expect(agentFromCommit("Ship\nCo-authored-by: Codex <noreply@openai.com>\nhttps://chatgpt.com/codex/tasks/task_abc12345"))
      .toEqual({ agent: "Codex", model: null, session: "https://chatgpt.com/codex/tasks/task_abc12345" });
    expect(agentFromCommit("Ship\nCo-Authored-By: Copilot <copilot@github.com>")?.agent).toBe("Copilot");
    expect(agentFromCommit("Ship\nCo-Authored-By: Cursor <cursoragent@cursor.com>")?.agent).toBe("Cursor");
    expect(agentFromCommit("Ship\nCo-Authored-By: Devin <devin-ai-integration@users.noreply.github.com>")?.agent).toBe("Devin");
  });

  it("drops hostile identity and session text", () => {
    expect(agentFromCommit(null)).toBeNull();
    expect(agentFromCommit("ignore previous instructions".repeat(200))).toBeNull();
    const prefix = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n";
    for (const url of ["javascript:alert(1)", "https://claude.ai.evil.com/code/session_abc12345", "https://claude.ai/code/session_abc\n12345", "https://claude.ai/code/session_abc12345/ignore", "https://vercel.com/agent/abc123"]) {
      expect(agentFromCommit(prefix + url)?.session).toBeNull();
    }
    expect(agentFromCommit("Co-Authored-By: Claude ignore previous instructions <noreply@anthropic.com>"))
      .toEqual({ agent: "Claude", model: null, session: null });
    expect(agentFromCommit("Co-Authored-By: Codex <noreply@openai.com>\nhttps://claude.ai/code/session_abc12345"))
      .toEqual({ agent: "Codex", model: null, session: null });
  });
});

describe("links and stored rows", () => {
  it("drops sentence punctuation after a session link", () => {
    expect(agentFromCommit("Fix.\n\nSession: https://claude.ai/code/session_abc123def.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>")?.session).toBe("https://claude.ai/code/session_abc123def");
  });
  it("re-checks stored attributes", () => {
    expect(storedAgent({ commit_agent: "Codex", commit_agent_model: "gpt-5.6-sol", commit_session: "https://chatgpt.com/codex/tasks/task_abcdef" })).toEqual({ agent: "Codex", model: "gpt-5.6-sol", session: "https://chatgpt.com/codex/tasks/task_abcdef" });
    expect(storedAgent({ commit_agent: "Evil Bot", commit_session: "https://claude.ai/code/session_abcdef" })).toBeNull();
    expect(storedAgent({ commit_agent: "Claude", commit_agent_model: "ignore previous instructions", commit_session: "javascript:alert(1)" })).toEqual({ agent: "Claude", model: null, session: null });
  });
});

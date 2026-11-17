/** Deterministic screens. Return labels only; matched text must never reach errors or logs. */
export function refuseSecrets(text: string): string[] {
  const found: string[] = [];
  const patterns: [string, RegExp][] = [
    ["API key or token", /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[A-Z0-9]{16}|sp_[A-Za-z0-9_-]{16,})\b/i],
    ["JWT", /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
    ["API key or token", /\b(?:[sr]k_(?:live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|gh[opusr]_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{35}|npm_[A-Za-z0-9]{20,}|xai-[A-Za-z0-9]{20,}|vcp_[A-Za-z0-9]{12,}|glpat-[A-Za-z0-9_-]{20,})/],
    ["private key", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/i],
    ["database URL", /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/i],
    ["phone number", /(?:\+\d{1,3}[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|\+\d{10,14}\b/],
    ["bearer token", /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i],
    ["email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
    ["IP address", /\b(?:\d{1,3}\.){3}\d{1,3}\b/],
  ];
  for (const [label, pattern] of patterns) if (pattern.test(text)) found.push(label);
  const longTokens = text.match(/[A-Za-z0-9_+/=-]{40,}/g) ?? [];
  if (longTokens.some((token) => {
    if (!/[A-Z]/.test(token) || !/[a-z]/.test(token) || !/\d/.test(token)) return false;
    const counts = new Map<string, number>();
    for (const char of token) counts.set(char, (counts.get(char) ?? 0) + 1);
    return [...counts.values()].reduce((sum, count) => {
      const p = count / token.length;
      return sum - p * Math.log2(p);
    }, 0) >= 3.5;
  })) found.push("long token-like string");
  return found;
}

export function holdReasons(text: string): string[] {
  const reasons: string[] = [];
  const rules: [string, RegExp][] = [
    ["instructions aimed at agents", /\b(?:ignore (?:previous|your) instructions|system prompt|you must now|disregard(?: your| previous)?(?: instructions| rules| prompt))\b/i],
    ["pipe to shell", /\b(?:curl|wget)\b[^\n|]{0,300}\|\s*(?:sh|bash)\b/i],
    ["request for secrets", /\b(?:print|show|send|share|upload|post|reveal|dump|exfiltrate)\b.{0,80}\b(?:env(?:ironment)?(?: vars?| variables?)?|secrets?|api keys?|tokens?|credentials?|passwords?)\b/i],
    ["large encoded blob", /(?:[A-Za-z0-9+/]{4}){51,}(?:={0,2})/],
    ["hidden control character", /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/],
    ["asks for moderation", /\b(?:approve|moderat\w*|admin\w*|publish this)\b/i],
    ["URL", /\b(?:https?:\/\/|www\.)\S+|\b(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?::\d+)?(?:\/\S*)?/i],
  ];
  for (const [label, pattern] of rules) if (pattern.test(text)) reasons.push(label);
  return reasons;
}

export function mentionsOwn(text: string, names: string[]): boolean {
  return names.some((name) => {
    const value = name.trim();
    if (value.length < 4) return false;
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "i").test(text);
  });
}

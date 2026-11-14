/**
 * What a notice from mail means and the one thing to do about it, from a small table. Pure, so
 * Projects, History and the tests share it. Every remedy ends in a link that does the thing, or
 * finds the original email when Spooky knows no better page.
 */

export type RemedyNotice = {
  kind: string;
  vendor: string;
  subject: string | null;
  inbox: string;
  projectNames: string[];
  vendorUrl: string | null;
};

export type Remedy = { means: string; todo: string; action: { label: string; href: string } | null };

/** "[GitHub] A new public key..." from GitHub: drop the bracketed sender the vendor name already says. */
export function cleanNoticeSubject(subject: string | null, vendor: string): string | null {
  if (!subject) return subject;
  const s = subject.trim();
  const m = /^\[([^\]]+)\]\s*/.exec(s);
  if (m && m[1].toLowerCase().replace(/[^a-z0-9]/g, "") === vendor.toLowerCase().replace(/[^a-z0-9]/g, "")) return s.slice(m[0].length);
  return s;
}

/** "owner/repo" named in the subject, else the notice's first project that has an owner. */
function repoOf(n: RemedyNotice): string | null {
  const inSubject = /\b([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)\b/.exec(n.subject ?? "")?.[1];
  if (inSubject && !/^https?:/.test(inSubject)) return inSubject.replace(/\.+$/, "");
  return n.projectNames.find((p) => p.includes("/")) ?? null;
}

/** The original email in the inbox it came to, by its subject. */
export function emailSearchUrl(n: Pick<RemedyNotice, "inbox" | "subject">): string | null {
  if (!n.subject) return null;
  return `https://mail.google.com/mail/u/${encodeURIComponent(n.inbox)}/#search/${encodeURIComponent(`subject:"${n.subject.trim()}"`)}`;
}

const isGitHub = (n: RemedyNotice) => /github/i.test(n.vendor);
const find = (n: RemedyNotice) => {
  const href = emailSearchUrl(n);
  return href ? { label: "Find the email", href } : null;
};

/** What it means and what to do, for one notice. Rules run in order; the first match wins. */
export function noticeRemedy(n: RemedyNotice): Remedy {
  const s = (n.subject ?? "").toLowerCase();
  const repo = repoOf(n);

  if (/(deploy|ssh|public) key/.test(s) && /(added|new|created)/.test(s)) {
    return {
      means: `Something can now pull or push ${repo ?? "this repo"} with that key.`,
      todo: "If you or your agent added it, for a server say, nothing to do. If not, remove it.",
      action: repo && isGitHub(n) ? { label: "Open deploy keys", href: `https://github.com/${repo}/settings/keys` } : find(n),
    };
  }
  if (/(personal access token|access token|oauth|authorized|third.party application|app was (added|installed))/.test(s) && !/expir/.test(s)) {
    return {
      means: "An app or token can now act on your account.",
      todo: "If you set it up, nothing to do. If not, revoke it.",
      action: isGitHub(n)
        ? /token/.test(s)
          ? { label: "Open tokens", href: "https://github.com/settings/tokens" }
          : { label: "Open authorized apps", href: "https://github.com/settings/applications" }
        : (n.vendorUrl ? { label: `Open ${n.vendor}`, href: n.vendorUrl } : find(n)),
    };
  }
  if (/(expir|will be revoked|rotate)/.test(s) && /(token|key|certificate|secret|credential)/.test(s)) {
    return {
      means: "A token or key stops working soon. Anything that uses it will break.",
      todo: "Make a new one, put it where the old one is used, then delete the old one.",
      action: isGitHub(n) ? { label: "Open tokens", href: "https://github.com/settings/tokens" } : (n.vendorUrl ? { label: `Open ${n.vendor}`, href: n.vendorUrl } : find(n)),
    };
  }
  if (/(sign.?in|signed in|new device|new login|logged in|new browser|unrecognized|verification code|password)/.test(s)) {
    return {
      means: "Someone signed in to this account, or tried to.",
      todo: "If it was you, nothing to do. If not, change the password and sign out other sessions.",
      action: isGitHub(n) ? { label: "Open security log", href: "https://github.com/settings/security-log" } : (n.vendorUrl ? { label: `Open ${n.vendor}`, href: n.vendorUrl } : find(n)),
    };
  }
  if (n.kind === "payment_failed" || /(payment|charge|card).*(fail|declin)|(fail|declin).*(payment|charge|card)/.test(s)) {
    return {
      means: `${n.vendor} could not charge your card. Service can stop if it stays unpaid.`,
      todo: "Update the card on file, or cancel if you no longer use it.",
      action: n.vendorUrl ? { label: "Open billing", href: n.vendorUrl } : find(n),
    };
  }
  return {
    means: n.kind === "account_security" ? `${n.vendor} sent a security notice about your account.` : `${n.vendor} sent a notice.`,
    todo: "Read the email. If it was you, nothing to do.",
    action: find(n) ?? (n.vendorUrl ? { label: `Open ${n.vendor}`, href: n.vendorUrl } : null),
  };
}

"use client";
/**
 * Client data hook. The web app reads only through /api/v1, the same endpoints
 * the CLI and MCP server use.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ApiState<T> = {
  data: T | null;
  error: string | null;
  status: number | null;
  loading: boolean;
  reload: () => Promise<void>;
};

/** What the user sees for a failed call. Server faults never show raw text. */
export const SERVER_FAULT = "Something went wrong on our side. It was logged.";

/** What the app shows for a 401: the session ended. The views add a sign-in link beside it. */
export const SIGNED_OUT = "You're signed out.";

export function errorMessage(status: number, body: { error?: { code?: string; message?: string } } | null): string {
  if (status === 401) return SIGNED_OUT;
  if (status >= 500 || body?.error?.code === "internal") return SERVER_FAULT;
  return body?.error?.message ?? `Request failed (${status})`;
}

export function useApi<T>(path: string, opts: { pollMs?: (data: T | null) => number | null } = {}): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(opts.pollMs);
  pollRef.current = opts.pollMs;

  const load = useCallback(async () => {
    try {
      const res = await fetch(path, { credentials: "same-origin", cache: "no-store" });
      setStatus(res.status);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(errorMessage(res.status, body));
      } else {
        setError(null);
        setData(body as T);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ms = pollRef.current?.(data);
    if (!ms) return;
    const t = setTimeout(() => void load(), ms);
    return () => clearTimeout(t);
  }, [data, load]);

  return { data, error, status, loading, reload: load };
}

export async function apiPost<T>(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  return apiSend<T>("POST", path, body);
}

export async function apiSend<T>(method: "POST" | "DELETE" | "PATCH", path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data: res.ok ? (data as T) : null, error: res.ok ? undefined : errorMessage(res.status, data) };
}

export function formatInt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

/** Money in a column: always two decimals, so amounts line up. */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(cents / 100);
}

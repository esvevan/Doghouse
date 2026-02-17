import { getToken } from "./token";

const BASE = "";

export async function bootstrapToken(): Promise<string> {
  const res = await fetch("/bootstrap", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Bootstrap failed");
  const data = (await res.json()) as { token: string };
  return data.token;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("Missing API token");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      "X-API-Token": token
    }
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status}: ${txt}`);
  }
  return (await res.json()) as T;
}
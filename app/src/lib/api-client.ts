"use client";

export async function readJsonArray<T>(res: Response, label: string): Promise<T[]> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body && typeof body === "object" && "error" in body ? String(body.error) : res.statusText;
    throw new Error(`${label} failed: ${message}`);
  }
  if (!Array.isArray(body)) {
    throw new Error(`${label} returned an unexpected response`);
  }
  return body as T[];
}

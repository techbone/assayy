import "server-only";
import type { z } from "zod";

export function jsonResponder() {
  const requestId = crypto.randomUUID();
  const headers = { "Cache-Control": "no-store", "X-Request-Id": requestId };
  return {
    ok: (body: unknown) => Response.json(body, { headers }),
    fail: (status: number, error: string, code?: string) =>
      Response.json(
        { error, ...(code ? { code } : {}), requestId },
        { status, headers },
      ),
  };
}

/** Parses a small JSON body against a strict schema. Oversized or malformed bodies are rejected. */
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes = 4_096,
): Promise<{ data: T } | { error: string }> {
  const text = await request.text().catch(() => "");
  if (!text || text.length > maxBytes) return { error: "Invalid request body" };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: "Invalid request body" };
  }
  const parsed = schema.safeParse(body);
  return parsed.success
    ? { data: parsed.data }
    : { error: parsed.error.issues[0]?.message ?? "Invalid request" };
}

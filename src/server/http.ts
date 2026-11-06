import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const buckets = new Map<string, { count: number; start: number }>();
export function protect(request: Request, costly = false) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
  if (origin && origin !== expected)
    throw new HttpError(403, "Origin not allowed");
  if (costly && process.env.OPERATOR_TOKEN) {
    const incoming = Buffer.from(request.headers.get("x-operator-token") || "");
    const expected = Buffer.from(process.env.OPERATOR_TOKEN);
    if (
      incoming.length !== expected.length ||
      !timingSafeEqual(incoming, expected)
    )
      throw new HttpError(401, "An operator token is required");
  }
  if (
    costly &&
    process.env.NODE_ENV === "production" &&
    !process.env.OPERATOR_TOKEN
  )
    throw new HttpError(
      503,
      "Set OPERATOR_TOKEN before enabling operations on a production host",
    );
  const key = costly ? "operations" : "scans";
  let b = buckets.get(key);
  if (!b || Date.now() - b.start > 3600000) {
    b = { count: 0, start: Date.now() };
    buckets.set(key, b);
  }
  if (++b.count > (costly ? 30 : 120))
    throw new HttpError(429, "Hourly operation limit reached");
}
export async function body(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 2000000)
    throw new HttpError(413, "Body too large");
  const text = await request.text();
  if (text.length > 2000000) throw new HttpError(413, "Body too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
export function failure(error: unknown) {
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError)
    return Response.json(
      {
        error: "Invalid input",
        details: error.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      },
      { status: 400 },
    );
  return Response.json(
    {
      error:
        error instanceof Error &&
        /not found|Compare snapshots|Current block/.test(error.message)
          ? error.message
          : "Operation failed. Check the input and server configuration.",
    },
    { status: 400 },
  );
}

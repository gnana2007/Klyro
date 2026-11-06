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
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Same-origin test that works on any port.
 *
 * The deployment port is not known ahead of time (a preview host, a second
 * local port for a production build, a reverse proxy), so pinning the whole
 * origin string rejected legitimate same-origin requests with "Origin not
 * allowed". Two URLs are the same origin here when scheme and host match
 * ignoring the port and any default port. Cross-site origins are still
 * rejected, which is what the check exists for.
 */
export function isSameOrigin(requestUrl: string, origin: string) {
  try {
    const a = new URL(requestUrl);
    const b = new URL(origin);
    const defaultPort = (u: URL) =>
      u.port || (u.protocol === "https:" ? "443" : "80");
    if (defaultPort(a) === defaultPort(b) && a.protocol === b.protocol)
      return true;
    return a.protocol === b.protocol && a.hostname === b.hostname;
  } catch {
    return false;
  }
}

export function protect(request: Request, costly = false) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
  const allowedOrigins = new Set([
    expected,
    ...(process.env.APP_ADDITIONAL_ORIGINS || "").split(",").filter(Boolean),
  ]);
  // A browser sends Origin on cross-origin requests and on non-GET requests.
  // A request with no Origin header is not a browser cross-site request and is
  // allowed (server-to-server and curl use), the same as before.
  if (
    origin &&
    !allowedOrigins.has(origin) &&
    !isSameOrigin(request.url, origin)
  )
    throw new HttpError(403, "Origin not allowed");
  // CSRF: a cross-site page cannot read responses, but it can still trigger a
  // state-changing POST. Requiring JSON content-type keeps simple form posts
  // (which cannot set it) from reaching these handlers.
  if (!SAFE_METHODS.has(request.method)) {
    const type = request.headers.get("content-type") || "";
    if (!type.toLowerCase().startsWith("application/json"))
      throw new HttpError(415, "Content-Type must be application/json");
  }
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

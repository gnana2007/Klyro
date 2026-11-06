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

/**
 * True when the app is configured to be reachable from outside this machine.
 *
 * A production build served on loopback (127.0.0.1/localhost) is single-operator
 * by construction, so demanding an OPERATOR_TOKEN there only broke local
 * verification with a 503. Any deployment that points APP_ORIGIN at a public
 * host still requires the token, and requests carrying a public Origin header
 * always require it.
 */
export function isPublicOrigin() {
  const origin = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
  return isPublicHost(origin);
}

/** A browser Origin header can also reveal that a request came from the internet. */
function publicOriginHeader(request: Request) {
  const origin = request.headers.get("origin");
  return origin ? isPublicHost(origin) : false;
}

function isPublicHost(origin: string) {
  try {
    const host = new URL(origin).hostname;
    return !(
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".localhost")
    );
  } catch {
    return true;
  }
}

export function protect(request: Request, costly = false) {
  const origin = request.headers.get("origin");
  const allowedOrigins = new Set([
    process.env.APP_ORIGIN || "http://127.0.0.1:3000",
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
    !process.env.OPERATOR_TOKEN &&
    (isPublicOrigin() || publicOriginHeader(request))
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
  // viem classifies failures by name, not by string. Map the ones a caller can
  // act on (a wrong chain, a rejected transaction) instead of flattening every
  // provider error into one opaque message.
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  const message = error instanceof Error ? error.message : "";
  if (name === "ChainMismatchError")
    return Response.json(
      { error: "Configured RPC reports a different chain ID" },
      { status: 502 },
    );
  if (name === "TransactionExecutionError" || name === "ContractFunctionExecutionError")
    return Response.json(
      {
        error:
          "The chain rejected this call. Check the registry address, the signer and the submitted values.",
      },
      { status: 502 },
    );
  const safe =
    /not found|Compare snapshots|Current block|Unsupported|must be/i.test(message)
      ? message
      : "Operation failed. Check the input and server configuration.";
  return Response.json({ error: safe }, { status: 400 });
}

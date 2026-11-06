import { it, expect } from "vitest";
import { protect, isSameOrigin } from "../src/server/http";
import { createServer } from "node:http";
import { networkFetch } from "../src/server/network";
it("rejects a foreign origin but accepts a configured application origin", () => {
  const origin = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
  expect(() =>
    protect(
      new Request(origin + "/api/scans", {
        headers: { origin: "https://unrelated.invalid" },
      }),
    ),
  ).toThrow("Origin not allowed");
  expect(() =>
    protect(new Request(origin + "/api/scans", { headers: { origin } })),
  ).not.toThrow();
});
it("accepts same-origin requests on any port but blocks cross-site origins", () => {
  // The deployment port is not known in advance; a production build served on
  // a second local port is still legitimately same-origin.
  const json = { "content-type": "application/json" };
  expect(
    isSameOrigin("http://127.0.0.1:3100/api/diffs", "http://127.0.0.1:3100"),
  ).toBe(true);
  expect(
    isSameOrigin("http://127.0.0.1:3000/api/diffs", "http://127.0.0.1:3100"),
  ).toBe(true);
  expect(
    isSameOrigin("https://klyro.example/api/diffs", "https://klyro.example"),
  ).toBe(true);
  // Different host or scheme is a different origin.
  expect(
    isSameOrigin("http://127.0.0.1:3000/api/diffs", "https://evil.invalid"),
  ).toBe(false);
  expect(
    isSameOrigin("http://127.0.0.1:3000/api/diffs", "https://127.0.0.1"),
  ).toBe(false);
  // And the guard itself must not throw for a same-origin non-default port.
  expect(() =>
    protect(
      new Request("http://127.0.0.1:3100/api/diffs", {
        method: "POST",
        headers: { origin: "http://127.0.0.1:3100", ...json },
      }),
    ),
  ).not.toThrow();
});

it("rejects a cross-site non-JSON POST before it can mutate state", () => {
  expect(() =>
    protect(
      new Request("http://127.0.0.1:3000/api/scans", {
        method: "POST",
        headers: {
          origin: "https://evil.invalid",
          "content-type": "application/json",
        },
      }),
    ),
  ).toThrow("Origin not allowed");
  expect(() =>
    protect(
      new Request("http://127.0.0.1:3000/api/scans", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
    ),
  ).toThrow("Content-Type");
});

it("reads a bounded native HTTP response and preserves status and headers", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(201, {
      "content-type": "application/json",
      "x-observed": "yes",
    });
    response.end('{"live":true}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test port");
    const response = await networkFetch(`http://127.0.0.1:${address.port}`);
    expect(response.status).toBe(201);
    expect(response.headers.get("x-observed")).toBe("yes");
    expect(await response.json()).toEqual({ live: true });
  } finally {
    server.close();
  }
});
it("requires the operator token for protected operations", () => {
  const before = process.env.OPERATOR_TOKEN;
  process.env.OPERATOR_TOKEN = "test-only-operator";
  try {
    expect(() =>
      protect(new Request("http://127.0.0.1:3000/api/ai/explain"), true),
    ).toThrow("operator token");
    expect(() =>
      protect(
        new Request("http://127.0.0.1:3000/api/ai/explain", {
          headers: { "x-operator-token": "test-only-operator" },
        }),
        true,
      ),
    ).not.toThrow();
  } finally {
    if (before === undefined) delete process.env.OPERATOR_TOKEN;
    else process.env.OPERATOR_TOKEN = before;
  }
});

it("requires an operator token only when the app is reachable publicly", async () => {
  const { isPublicOrigin } = await import("../src/server/http");
  const json = { "content-type": "application/json" };
  const saved = { ...process.env };
  try {
    // A production build on loopback is single-operator: no 503.
    process.env.APP_ORIGIN = "http://127.0.0.1:3000";
    delete process.env.OPERATOR_TOKEN;
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(isPublicOrigin()).toBe(false);
    expect(() =>
      protect(
        new Request("http://127.0.0.1:3000/api/ai/explain", {
          method: "POST",
          headers: { origin: "http://127.0.0.1:3000", ...json },
        }),
        true,
      ),
    ).not.toThrow();

    // A public APP_ORIGIN still demands it.
    process.env.APP_ORIGIN = "https://klyro.example";
    expect(isPublicOrigin()).toBe(true);
    expect(() =>
      protect(
        new Request("https://klyro.example/api/ai/explain", {
          method: "POST",
          headers: { origin: "https://klyro.example", ...json },
        }),
        true,
      ),
    ).toThrow("OPERATOR_TOKEN");

    // A public browser Origin demands it even if APP_ORIGIN was left local.
    process.env.APP_ORIGIN = "http://127.0.0.1:3000";
    expect(() =>
      protect(
        new Request("http://127.0.0.1:3000/api/ai/explain", {
          method: "POST",
          headers: { origin: "https://someone-else.example", ...json },
        }),
        true,
      ),
    ).toThrow();
  } finally {
    process.env = saved;
  }
});
/**
 * Regression: a storage failure used to be flattened into HTTP 400 "Operation
 * failed", which is what the production deployment answered on /api/health and
 * /api/scans. A server-side fault must be reported as one, with its reason.
 */
it("reports a storage failure as 503 with its reason, never as a 400", async () => {
  const { failure } = await import("../src/server/http");
  const { StorageError } = await import("../src/server/db");
  const error = new StorageError(
    "SQLite could not be opened at /var/task/data/klyro.sqlite (attempt to write a readonly database).",
  );
  const response = failure(error);
  expect(response.status).toBe(503);
  const payload = await response.json();
  expect(payload.code).toBe("STORAGE_UNAVAILABLE");
  expect(payload.error).toContain("readonly database");
  expect(payload.error).not.toBe(
    "Operation failed. Check the input and server configuration.",
  );
});

it("keeps a validation failure a 400 and never hides an unexpected error as one", async () => {
  const { failure, HttpError } = await import("../src/server/http");
  const validation = failure(new HttpError(400, "Unsupported chain"));
  expect(validation.status).toBe(400);
  expect((await validation.json()).error).toBe("Unsupported chain");

  const unexpected = failure(new Error("ENOENT: fixture missing"));
  expect(unexpected.status).toBe(500);
  const payload = await unexpected.json();
  expect(payload.code).toBe("INTERNAL_ERROR");
  expect(payload.error).toContain("ENOENT");
});

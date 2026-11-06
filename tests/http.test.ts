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

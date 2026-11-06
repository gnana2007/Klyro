import { it, expect } from "vitest";
import { protect } from "../src/server/http";
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

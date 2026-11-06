import { it, expect } from "vitest";
import { protect } from "../src/server/http";
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

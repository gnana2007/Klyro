import { beforeAll, describe, it, expect } from "vitest";
import {
  describeHttpFailure,
  ExplanationSchema,
  ALLOWED_BASES,
} from "../src/server/ai";

beforeAll(() => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.ZERO_G_MODEL = "test-model";
});

/**
 * These cases are copied from responses the live Router actually returned on
 * 7 November 2026, so the diagnosis is tested against the real wire format
 * rather than an invented one.
 */
describe("0G failure diagnosis", () => {
  it("reads the live pay_no_balance body as an empty-account problem", () => {
    const live = JSON.stringify({
      _0g: { source: "upstream", upstream_status: 402 },
      error: {
        code: "pay_no_balance",
        message: "Add funds to keep using services.",
        type: "payment_error",
      },
    });
    const { error, retryable } = describeHttpFailure(402, live);
    expect(retryable).toBe(false);
    expect(error).toContain("insufficient credits");
    expect(error).toContain("pay_no_balance");
    // The operator must be told the app will not fund anything.
    expect(error).toContain("never funds");
  });

  it("does not blame the model for a billing failure", () => {
    const { error } = describeHttpFailure(
      402,
      JSON.stringify({ error: { code: "pay_no_balance", message: "Add funds" } }),
    );
    expect(error).not.toMatch(/model/i);
  });

  it("says the model id is wrong on 404 with a model message", () => {
    const { error, retryable } = describeHttpFailure(
      404,
      JSON.stringify({ error: { message: "model not found" } }),
    );
    expect(retryable).toBe(false);
    expect(error).toContain("test-model");
  });

  it("marks 429 and 5xx as retryable and 401 as not", () => {
    expect(describeHttpFailure(429, "{}").retryable).toBe(true);
    expect(describeHttpFailure(503, "{}").retryable).toBe(true);
    expect(describeHttpFailure(401, "{}").retryable).toBe(false);
  });

  it("keeps the credential out of an unrecognised failure", () => {
    const { error } = describeHttpFailure(418, "teapot");
    expect(error).toContain("418");
    expect(error).not.toContain("Bearer");
  });

  it("refuses undocumented base URLs", () => {
    expect(ALLOWED_BASES.length).toBeGreaterThan(0);
    for (const base of ALLOWED_BASES) expect(base.startsWith("https://")).toBe(true);
  });
});

describe("explanation contract", () => {
  const valid = {
    executiveSummary: "s",
    technicalExplanation: "t",
    findings: [],
    missingEvidence: [],
    recommendedInvestigation: [],
    limitations: ["bounded"],
  };
  it("accepts the documented shape", () => {
    expect(ExplanationSchema.parse(valid)).toEqual(valid);
  });
  it("rejects extra keys, so a model cannot smuggle severity or hashes", () => {
    expect(() =>
      ExplanationSchema.parse({ ...valid, severityOverride: "LOW" }),
    ).toThrow();
  });
  it("requires at least one limitation", () => {
    expect(() => ExplanationSchema.parse({ ...valid, limitations: [] })).toThrow();
  });
});

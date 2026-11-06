import { beforeAll, describe, it, expect } from "vitest";
import { artifact, prepareDeployment, listDeployments, explorerBase } from "../src/server/deploy";

beforeAll(() => {
  process.env.DATABASE_PATH = ":memory:";
  // No registry is configured here on purpose: these tests describe the
  // "nothing deployed yet" state, which must never look like success.
  delete process.env.REGISTRY_ADDRESS;
});

describe("registry artifact", () => {
  it("loads the real compiled contract, not a placeholder", () => {
    const art = artifact();
    expect(art.contractName).toBe("HookRiskRegistry");
    expect(art.solcVersion).toMatch(/^0\.8\.26/);
    expect(art.bytecode.startsWith("0x60")).toBe(true);
    // A registry that fits in ~24 KB; a multi-megabyte figure would mean the
    // wrong artifact was read.
    expect(art.sizeBytes).toBeGreaterThan(1000);
    expect(art.sizeBytes).toBeLessThan(24000);
    const names = (art.abi as { name?: string }[]).map((e) => e.name);
    for (const fn of ["publish", "onReport", "owner", "setPublisher", "publications"])
      expect(names).toContain(fn);
  });
});

describe("deployment preparation", () => {
  it("rejects an invalid owner address instead of defaulting one", async () => {
    await expect(prepareDeployment(11155111, "not-an-address")).rejects.toThrow();
  });

  it("refuses an unsupported chain", async () => {
    await expect(
      prepareDeployment(999999, "0x0000000000000000000000000000000000000001"),
    ).rejects.toThrow();
  });

  it("requires one explicit owner argument", async () => {
    const p = await prepareDeployment(
      31337,
      "0x0000000000000000000000000000000000000001",
    );
    expect(p.constructorArgs).toHaveLength(1);
    expect(p.constructorArgs[0].name).toBe("initialOwner");
    // The wallet is the signer; the server must never imply it can deploy.
    expect(p.requiresApproval).toBe(true);
    expect(p.deployable).toBe(true);
  });

  it("blocks automatic deployment to Ethereum mainnet", async () => {
    const p = await prepareDeployment(
      1,
      "0x0000000000000000000000000000000000000001",
    );
    expect(p.deployable).toBe(false);
  });
});

describe("stored records", () => {
  it("starts empty and never invents a deployment", () => {
    expect(listDeployments()).toEqual([]);
  });
});

describe("explorer links", () => {
  it("maps only known chains", () => {
    expect(explorerBase(11155111)).toBe("https://sepolia.etherscan.io");
    expect(explorerBase(8453)).toBe("https://basescan.org");
    expect(explorerBase(31337)).toBeNull();
  });
});

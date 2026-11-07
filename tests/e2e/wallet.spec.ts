import { test, expect, type Page } from "@playwright/test";

/**
 * Wallet interface checks.
 *
 * A real MetaMask extension cannot be driven from CI, so these tests install a
 * mock EIP-1193 provider that answers the same calls MetaMask answers. That is
 * enough to prove the app's own behaviour: detection, the account prompt, the
 * rejection path, account and network events, and disconnect. It proves nothing
 * about MetaMask itself, and no test claims a real signature happened.
 */

const ACCOUNT_A = "0x1111111111111111111111111111111111111111";
const ACCOUNT_B = "0x2222222222222222222222222222222222222222";

async function installWallet(
  page: Page,
  options: { reject?: boolean; chainId?: number } = {},
) {
  await page.addInitScript(
    ({ accountA, accountB, reject, chainId }) => {
      const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
      const state = {
        accounts: [] as string[],
        chainId: "0x" + (chainId ?? 1).toString(16),
        connected: false,
      };
      const emit = (event: string, ...args: unknown[]) =>
        (listeners[event] || []).forEach((fn) => fn(...args));
      const provider = {
        isMetaMask: true,
        async request({ method, params }: { method: string; params?: unknown[] }) {
          switch (method) {
            case "eth_requestAccounts":
              if (reject) {
                const error = new Error("User rejected the request.") as Error & {
                  code: number;
                };
                error.code = 4001;
                throw error;
              }
              state.connected = true;
              state.accounts = [accountA];
              emit("accountsChanged", state.accounts);
              return state.accounts;
            case "eth_accounts":
              return state.accounts;
            case "eth_chainId":
              return state.chainId;
            case "wallet_switchEthereumChain": {
              const next = (params?.[0] as { chainId: string }).chainId;
              const known = ["0x1", "0xaa36a7", "0x2105", "0x7a69"];
              if (!known.includes(next)) {
                const error = new Error("Unrecognized chain") as Error & {
                  code: number;
                };
                error.code = 4902;
                throw error;
              }
              state.chainId = next;
              emit("chainChanged", next);
              return null;
            }
            case "eth_sendTransaction":
              return "0x" + "ab".repeat(32);
            default:
              return null;
          }
        },
        on(event: string, handler: (...args: unknown[]) => void) {
          listeners[event] = [...(listeners[event] || []), handler];
        },
        removeListener(event: string, handler: (...args: unknown[]) => void) {
          listeners[event] = (listeners[event] || []).filter((f) => f !== handler);
        },
        // Helpers the test uses to simulate the user acting inside the wallet.
        __emit(event: string, ...args: unknown[]) {
          emit(event, ...args);
        },
        __accountB: accountB,
      };
      (window as unknown as { ethereum: unknown }).ethereum = provider;
    },
    { accountA: ACCOUNT_A, accountB: ACCOUNT_B, reject: options.reject ?? false, chainId: options.chainId ?? 1 },
  );
}

test("the site loads and scans without any wallet installed", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app?view=scanner");
  // No provider was installed: the control must still be a real button, and it
  // must not pretend a wallet is connected.
  const connect = page
    .locator("header.app-topbar")
    .getByRole("button", { name: /connect wallet/i });
  await expect(connect).toBeVisible();
  await expect(page.getByLabel("Hook address")).toBeVisible();
  await expect(page.getByRole("button", { name: /Scan a hook/ })).toBeEnabled();

  await connect.click();
  await expect(
    page.getByRole("link", { name: /Install MetaMask/i }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("connect shows the shortened address and the current network", async ({ page }) => {
  await installWallet(page, { chainId: 1 });
  await page.goto("/app?view=scanner");
  await page.locator("header.app-topbar").getByRole("button", { name: /connect wallet/i }).click();
  await expect(page.locator("header.app-topbar .wallet-chip")).toHaveText("0x1111…1111");
  await expect(page.locator("header.app-topbar .wallet-net")).toContainText("Ethereum");
});

test("an account switch in the wallet updates the header", async ({ page }) => {
  await installWallet(page);
  await page.goto("/app?view=scanner");
  await page.locator("header.app-topbar").getByRole("button", { name: /connect wallet/i }).click();
  await expect(page.locator("header.app-topbar .wallet-chip")).toContainText("0x1111");
  await page.evaluate(() => {
    const provider = (window as unknown as { ethereum: { __emit(e: string, ...a: unknown[]): void; __accountB: string } }).ethereum;
    provider.__emit("accountsChanged", [provider.__accountB]);
  });
  await expect(page.locator("header.app-topbar .wallet-chip")).toContainText("0x2222");
});

test("a network change in the wallet updates the header label", async ({ page }) => {
  await installWallet(page);
  await page.goto("/app?view=scanner");
  await page.locator("header.app-topbar").getByRole("button", { name: /connect wallet/i }).click();
  await expect(page.locator("header.app-topbar .wallet-net")).toContainText("Ethereum");
  await page.evaluate(() => {
    (window as unknown as { ethereum: { __emit(e: string, ...a: unknown[]): void } }).ethereum.__emit(
      "chainChanged",
      "0xaa36a7",
    );
  });
  await expect(page.locator("header.app-topbar .wallet-net")).toContainText("Sepolia");
});

test("the network menu switches only after the operator clicks a network", async ({ page }) => {
  await installWallet(page);
  await page.goto("/app?view=scanner");
  await page.locator("header.app-topbar").getByRole("button", { name: /connect wallet/i }).click();
  // Nothing is switched on connect: the wallet's own chain is shown as-is.
  await expect(page.locator("header.app-topbar .wallet-net")).toContainText("Ethereum");
  await page.locator("header.app-topbar .wallet-net").click();
  const menu = page.getByRole("menu", { name: "Switch network" });
  await expect(menu).toBeVisible();
  for (const name of ["Ethereum Mainnet", "Sepolia", "Base Mainnet"])
    await expect(menu.getByText(name, { exact: true })).toBeVisible();
  await expect(menu.getByText("Local Anvil", { exact: true })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: /Base Mainnet/ }).click();
  await expect(page.locator("header.app-topbar .wallet-net")).toContainText("Base");
});

test("a rejected connection is reported and nothing is connected", async ({ page }) => {
  await installWallet(page, { reject: true });
  await page.goto("/app?view=scanner");
  await page.locator("header.app-topbar").getByRole("button", { name: /connect wallet/i }).click();
  await expect(page.locator("header.app-topbar .wallet-error")).toContainText(
    /rejected the connection/i,
  );
  await expect(page.locator("header.app-topbar .wallet-chip")).toHaveCount(0);
});

test("disconnect clears the connected address", async ({ page }) => {
  await installWallet(page);
  await page.goto("/app?view=scanner");
  await page.locator("header.app-topbar").getByRole("button", { name: /connect wallet/i }).click();
  await expect(page.locator("header.app-topbar .wallet-chip")).toBeVisible();
  await page.locator("header.app-topbar").getByRole("button", { name: "Disconnect wallet" }).click();
  await expect(page.locator("header.app-topbar .wallet-chip")).toHaveCount(0);
  await expect(
    page.locator("header.app-topbar").getByRole("button", { name: /connect wallet/i }),
  ).toBeVisible();
});

test("API health and scan history answer with a status, not a silent failure", async ({
  request,
}) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  const payload = await health.json();
  expect(payload.status).toBe("ok");
  expect(payload.database).toBe(true);
  expect(Array.isArray(payload.networks)).toBe(true);

  const scans = await request.get("/api/scans");
  expect(scans.status()).toBe(200);
  const history = await scans.json();
  expect(Array.isArray(history.scans)).toBe(true);
});

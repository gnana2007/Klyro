import { test, expect } from "@playwright/test";

/**
 * Operator-page checks.
 *
 * The wallet cannot be exercised in CI (no extension), so these tests verify
 * the two states that matter for correctness: the page works with no wallet,
 * and the wallet button exists in the header on every page. Anything that needs
 * a real signature is verified by scripts/deploy-e2e.ts against a live chain.
 */
test("operator page explains what it does with no wallet installed", async ({
  page,
}) => {
  await page.goto("/app?view=deploy");
  await expect(page.getByRole("heading", { name: "Registry deployment and publication" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "1. Deploy HookRiskRegistry" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "2. What is deployed right now" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "3. Publish a saved passport" }),
  ).toBeVisible();
  // Nothing is deployable without a wallet, and the page says so.
  await expect(page.getByRole("button", { name: /Deploy with wallet/ })).toBeDisabled();
  await expect(
    page.getByText("Connect a wallet to prepare a deployment"),
  ).toBeVisible();
});

test("a wallet control is present in the header and analysis needs no wallet", async ({
  page,
}) => {
  await page.goto("/app?view=scanner");
  const header = page.locator("header.app-topbar");
  await expect(
    header.getByText(/Connect wallet|No wallet/),
  ).toBeVisible();
  // The scanner itself is usable without connecting anything.
  await expect(page.getByLabel("Hook address")).toBeVisible();
  await expect(page.getByRole("button", { name: /Scan a hook/ })).toBeEnabled();
});

test("registry publication states that publishing is not a safety verdict", async ({
  page,
}) => {
  await page.goto("/app?view=deploy");
  await expect(
    page.getByText(/not that the hook\s+is safe|not that the hook is safe/i),
  ).toBeVisible();
});

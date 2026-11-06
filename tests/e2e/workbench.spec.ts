import { test, expect } from "@playwright/test";
test("scanner, validation, history and responsive layout", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Know what your hook does." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Scan a hook", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Hook address", { exact: true }).fill("invalid");
  expect(
    await page
      .getByLabel("Hook address", { exact: true })
      .evaluate((el: HTMLInputElement) => el.checkValidity()),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Scan history", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Scan history", exact: true }),
  ).toBeVisible();
});
test("API rejects invalid addresses and fabricated scan IDs", async ({
  request,
}) => {
  const response = await request.post("/api/scans", {
    data: { address: "garbage", chainId: 1 },
  });
  expect(response.status()).toBe(400);
  expect((await request.get("/api/scans/does-not-exist")).status()).toBe(404);
});
test("real scan evidence trail and public passport", async ({
  page,
  request,
}) => {
  const fixture = await request.get("/api/fixture");
  test.skip(
    !fixture.ok(),
    "Run npm run simulation to create the actual local fixture",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Load local test hook" }).click();
  await expect(page.getByLabel("Hook address", { exact: true })).toHaveValue(
    /0x[0-9a-fA-F]{40}/,
  );
  await page.getByRole("button", { name: "Scan a hook", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Observed contract" }),
  ).toBeVisible({ timeout: 45000 });
  const finding = page.locator(".finding-list button").last();
  const title = await finding.locator("span").nth(1).innerText();
  await finding.click();
  await expect(
    page.getByRole("heading", { name: "Follow a finding to its evidence" }),
  ).toBeVisible();
  await expect(
    page.locator(".graph-column .node.selected").first(),
  ).toContainText(title.split("\n")[0]);
  await page.screenshot({
    path: "evidence/screenshots/evidence-" + test.info().project.name + ".png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save passport", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Hook passport", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("MATCH", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Verify registry and current contract" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Does the current contract match?" }),
  ).toBeVisible({ timeout: 45000 });
  await page.screenshot({
    path: "evidence/screenshots/passport-" + test.info().project.name + ".png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

import { test, expect } from "@playwright/test";
test("marketing page leads to the real investigation workbench", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Know what your hooks are capable of." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Investigate a hook" }).click();
  await expect(
    page.getByRole("heading", { name: "Know what your hook does." }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/app");
});
test("scanner, validation, history and responsive layout", async ({ page }) => {
  await page.goto("/app?view=scanner");
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
  if (test.info().project.name === "mobile")
    await page
      .getByRole("button", { name: "Open workspace navigation" })
      .click();
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
  await page.goto("/app?view=scanner");
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
test("saved observations open in the comparison workspace with evidence links", async ({
  page,
  request,
}) => {
  const fixture = await request.get("/api/fixture");
  test.skip(
    !fixture.ok(),
    "Run npm run simulation for the actual local fixture",
  );
  const { hook } = await fixture.json();
  let latest = "";
  for (let i = 0; i < 2; i++) {
    const queued = await request.post("/api/scans", {
      data: { address: hook, chainId: 31337, explain: false },
    });
    expect(queued.status()).toBe(202);
    latest = (await queued.json()).id;
    await expect
      .poll(
        async () =>
          (await (await request.get("/api/scans/" + latest)).json()).status,
        { timeout: 45000 },
      )
      .toBe("complete");
  }
  await page.goto("/app?view=comparisons");
  await page.getByLabel("Current snapshot").selectOption(latest);
  await expect(
    page.getByText("Previous snapshot", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Compare versions" }).click();
  await expect(page.getByText(/confirmed observation changes/)).toBeVisible();
  await page
    .getByRole("link", { name: /Inspect bytecode evidence/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Follow a finding to its evidence" }),
  ).toBeVisible();
});

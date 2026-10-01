import { test, expect } from "@playwright/test";

test("real database search, explanations, clarification, empty results and Spanish", async ({ page, request }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(10);
  const query = await page.getByLabel("Search request").inputValue();
  const response = await request.post("/api/search", { data: { query } });
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  await expect(page.locator("tbody tr").first()).toContainText(data.players[0].display_name);
  const imageResponse = await request.get("/pitch.jpg");
  expect(imageResponse.ok()).toBeTruthy();
  expect(imageResponse.headers()["content-type"]).toContain("image");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("search.png"), fullPage: true });
  await page.getByRole("button", { name: `Calculation: ${data.players[0].display_name}`, exact: true }).click();
  await expect(page.locator(".calculation")).toContainText(data.players[0].explanation);
  await expect(page.locator(".calculation")).toContainText(String(data.players[0].peer_count));

  await page.getByLabel("Search request").fill("Find the best creative young players");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Clarification needed" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);

  await page.getByLabel("Search request").fill("Find players with at least 100000 minutes");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No players match these conditions.")).toBeVisible();
  await expect(page.getByText("No constraints were relaxed.")).toBeVisible();

  await page.getByRole("button", { name: "ES", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await expect(page.getByRole("heading", { name: "Solicitud interpretada" })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toContainText("Pares insuficientes");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("search-spanish.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("unavailable API clears old results and offers retry", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await page.route("**/api/search", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Search unavailable" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page.unroute("**/api/search");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(10);
});
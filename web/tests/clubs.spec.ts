import { test, expect } from "@playwright/test";

const testApi = process.env.CANTERA_CLUB_TEST_API;
test.beforeEach(async ({ page }) => {
  if (testApi) await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${testApi}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
});

test("historical clubs, squad filters and exact player statistics in both languages", async ({ page, request }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const clubs = (await (await request.get("/api/clubs")).json()).clubs;
  expect(clubs).toHaveLength(20);
  const club = clubs[0];
  const squad = (await (await request.get(`/api/clubs/${club.team_id}/players`)).json()).players;
  const player = squad.find((item: { minutes: number; position: string }) => item.minutes > 180 && item.position !== "GK");
  await page.goto("/clubs?lang=en&q=Find+wingers");
  await expect(page.locator(".club-list li")).toHaveCount(20);
  await page.screenshot({ path: testInfo.outputPath("clubs.png"), fullPage: true });
  await page.getByRole("link", { name: new RegExp(club.name) }).click();
  await expect(page.getByRole("heading", { name: club.name, exact: true })).toBeVisible();
  await expect(page.locator(".club-table tbody tr")).toHaveCount(squad.length);
  await page.getByLabel("Filter players", { exact: true }).fill(player.display_name);
  await expect(page.locator(".club-table tbody tr")).toHaveCount(1);
  for (const metric of player.metrics) {
    const format = (value: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
    await expect(page.locator(`.club-table [data-metric="${metric.metric}"]`)).toHaveText(format(metric.per90));
  }
  await page.getByRole("button", { name: "Total", exact: true }).click();
  await expect(page.locator('.club-table [data-metric="shots"]')).toHaveText(String(player.metrics.find((item: { metric: string }) => item.metric === "shots").total));
  await page.screenshot({ path: testInfo.outputPath("club-squad.png"), fullPage: true });
  await page.getByRole("link", { name: player.display_name, exact: true }).click();
  await expect(page.getByRole("heading", { name: player.display_name, exact: true })).toBeVisible();
  await expect(page.locator(".club-detail-table tbody tr")).toHaveCount(6);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator(".profile-warning").first()).toContainText("birth-date coverage");
  await page.locator(".profile-methodology summary").click();
  await expect(page.locator(".source-list li").first()).toContainText("SHA-256");
  await page.getByRole("button", { name: "ES", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Definiciones y calculos" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("club-player-es.png"), fullPage: true });
  await page.getByRole("link", { name: "Volver al club", exact: true }).click();
  await expect(page.getByLabel("Filtrar jugadores", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Buscar jugadores", exact: true }).click();
  await expect(page.getByLabel("Solicitud de busqueda")).toHaveValue("Find wingers");
  expect(errors).toEqual([]);
});

test("club preferences save, isolation, conflict, reset and World Cup index", async ({ page, request }, testInfo) => {
  test.skip(!testApi, "Run with an isolated CANTERA_CLUB_TEST_API for mutation tests");
  const clubs = (await (await request.get(`${testApi}/api/clubs`)).json()).clubs;
  const club = clubs[testInfo.project.name === "desktop" ? 0 : 2];
  const other = clubs[testInfo.project.name === "desktop" ? 1 : 3];
  const otherBefore = await (await request.get(`${testApi}/api/clubs/${other.team_id}/profile`)).json();
  await page.goto(`/clubs/${club.team_id}`);
  const editor = page.getByRole("region", { name: "Club preferences", exact: true });
  const weight = editor.getByRole("spinbutton", { name: "Non-penalty shots Weight", exact: true });
  await expect(weight).toBeVisible();
  const changedWeight = await weight.inputValue() === "73" ? "74" : "73";
  await weight.fill(changedWeight);
  await expect(editor.getByRole("status")).toHaveText("Unsaved changes");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "ES", exact: true }).click();
  await expect(weight).toHaveValue(changedWeight);
  await editor.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(editor.getByRole("status")).toHaveText("Preferences saved");
  await page.reload();
  await expect(weight).toHaveValue(changedWeight);
  const current = await (await request.get(`${testApi}/api/clubs/${club.team_id}/profile`)).json();
  expect(current.weights.CB.shots).toBe(Number(changedWeight));
  expect(await (await request.get(`${testApi}/api/clubs/${other.team_id}/profile`)).json()).toEqual(otherBefore);
  await request.put(`${testApi}/api/clubs/${club.team_id}/profile`, { headers: { Origin: "http://127.0.0.1:3002" }, data: { revision: current.revision, weights: current.weights } });
  await weight.fill("66");
  await editor.getByRole("button", { name: "Save preferences", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("Preferences changed elsewhere");
  page.once("dialog", dialog => dialog.accept());
  await editor.getByRole("button", { name: "Reload preferences", exact: true }).click();
  await expect(weight).toHaveValue(changedWeight);
  await editor.getByRole("button", { name: "Reset draft", exact: true }).click();
  await expect(weight).toHaveValue("1");
  expect((await (await request.get(`${testApi}/api/clubs/${club.team_id}/profile`)).json()).weights.CB.shots).toBe(Number(changedWeight));
  await page.screenshot({ path: testInfo.outputPath("club-settings.png"), fullPage: true });
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("link", { name: "Player search", exact: true }).click();
  const candidate = (await (await request.get("/api/players?limit=1")).json()).players[0];
  await page.goto(`/players/${candidate.player_id}`);
  const fit = page.getByRole("region", { name: "Club preference index", exact: true });
  await fit.getByRole("combobox").selectOption(String(club.team_id));
  await expect(fit.getByRole("status")).toContainText("Club preference index:");
  await expect(fit.locator("tbody tr")).toHaveCount(6);
  await fit.getByRole("combobox").selectOption(String(other.team_id));
  await expect(fit.getByRole("status")).toContainText("Save this club's preferences first");
});

test("club missing records and service retry remain distinct", async ({ page }) => {
  await page.goto("/clubs/999999/players/1?lang=es");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Registro no encontrado");
  await page.route("**/api/clubs?lang=en", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/clubs");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Club data unavailable");
  await page.unroute("**/api/clubs?lang=en");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".club-list li")).toHaveCount(20);
});
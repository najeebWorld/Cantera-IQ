import { test, expect } from "@playwright/test";

test("search to profile, exact metrics, rendered radar, language and return", async ({ page, request }, testInfo) => {
  const query = "Find wingers aged 23 or younger sorted by percentile for successful dribbles";
  const searchResponse = await request.post("/api/search", { data: { query } });
  expect(searchResponse.ok()).toBeTruthy();
  const candidate = (await searchResponse.json()).players[0];
  const response = await request.get(`/api/players/${candidate.player_id}`);
  expect(response.ok()).toBeTruthy();
  const profile = await response.json();
  expect(profile.radar_available).toBeTruthy();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/?${new URLSearchParams({ q: query, lang: "en" })}`);
  await expect(page.getByLabel("Search request")).toHaveValue(query);
  await page.getByRole("link", { name: candidate.display_name, exact: true }).click();
  await expect(page.getByRole("heading", { name: candidate.display_name, exact: true })).toBeVisible();
  const canvas = page.getByRole("img", { name: `Percentile radar: ${candidate.display_name}` });
  await expect(canvas).toBeVisible();
  await expect(page.locator(".metric-table tbody tr")).toHaveCount(6);
  for (const metric of profile.player.metrics) {
    const row = page.locator(`[data-metric="${metric.metric}"]`);
    await expect(row.locator("td").nth(2)).toHaveText(new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(metric.per90));
    await expect(row.locator("td").nth(3)).toHaveText(new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(metric.percentile));
  }
  const pixels = await canvas.evaluate(element => {
    const chart = element as HTMLCanvasElement;
    const context = chart.getContext("2d")!;
    const values = context.getImageData(0, 0, chart.width, chart.height).data;
    let green = 0;
    for (let offset = 0; offset < values.length; offset += 4) {
      if (values[offset + 1] > values[offset] * 1.3 && values[offset + 1] > values[offset + 2] * 1.15 && values[offset + 3] > 100) green++;
    }
    return { width: chart.width, height: chart.height, green };
  });
  expect(pixels.width).toBeGreaterThan(200);
  expect(pixels.height).toBeGreaterThan(200);
  expect(pixels.green).toBeGreaterThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("profile.png"), fullPage: true });
  await page.locator(".metric-table summary").first().click();
  await expect(page.locator(".metric-table details").first()).toContainText(profile.player.metrics[0].definition);
  await expect(page.locator(".metric-table details").first()).toContainText(profile.player.metrics[0].evidence_explanation);
  await page.getByRole("button", { name: "ES", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Detalle de metricas" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("img", { name: `Radar de percentiles: ${candidate.display_name}` })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("profile-spanish.png"), fullPage: true });
  await page.getByRole("link", { name: "Volver a la busqueda", exact: true }).click();
  await expect(page.getByLabel("Solicitud de busqueda")).toHaveValue(query);
  await expect(page.locator("tbody tr").first()).toContainText(candidate.display_name);
  expect(errors).toEqual([]);
});

test("missing percentile has no radar or fabricated zero", async ({ page, request }, testInfo) => {
  const response = await request.post("/api/search", { data: { query: "Find wingers aged 23 or younger sorted by successful dribbles" } });
  const result = await response.json();
  const candidate = result.players.find((player: { percentile: number | null }) => player.percentile === null);
  expect(candidate).toBeTruthy();
  await page.goto(`/players/${candidate.player_id}`);
  await expect(page.getByRole("heading", { name: "Radar unavailable", exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator(".metric-table tbody tr")).toHaveCount(6);
  for (const row of await page.locator(".metric-table tbody tr").all()) {
    await expect(row.locator("td").nth(3)).toHaveText("--");
  }
  await page.screenshot({ path: testInfo.outputPath("profile-no-radar.png"), fullPage: true });
});

test("unknown player and unavailable service have distinct recoverable states", async ({ page, request }) => {
  await page.goto("/players/9007199254740991?lang=es");
  await expect(page.getByRole("heading", { name: "Jugador no encontrado", exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  const response = await request.post("/api/search", { data: { query: "Find players" } });
  const candidate = (await response.json()).players[0];
  await page.route("**/api/players/*", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto(`/players/${candidate.player_id}`);
  await expect(page.getByRole("heading", { name: "Player data unavailable", exact: true })).toBeVisible();
  await page.unroute("**/api/players/*");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: candidate.display_name, exact: true })).toBeVisible();
});

test("similarity details and historical snapshots agree with API in both languages", async ({ page, request }, testInfo) => {
  const query = "Find wingers aged 23 or younger sorted by percentile for successful dribbles";
  const search = await request.post("/api/search", { data: { query } });
  const candidate = (await search.json()).players[0];
  const similarityResponse = await request.get(`/api/players/${candidate.player_id}/similar`);
  const historyResponse = await request.get(`/api/players/${candidate.player_id}/history`);
  expect(similarityResponse.ok()).toBeTruthy();
  expect(historyResponse.ok()).toBeTruthy();
  const similar = await similarityResponse.json();
  const historical = await historyResponse.json();
  expect(similar.status).toBe("available");
  expect(historical.status).toBe("available");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/players/${candidate.player_id}?${new URLSearchParams({ q: query, lang: "en" })}`);
  const section = page.getByRole("region", { name: "Similar players", exact: true });
  await expect(section.locator(".similarity-list > li")).toHaveCount(similar.comparisons.length);
  const first = section.locator(".similarity-list > li").first();
  await expect(first.locator(".distance-value strong")).toHaveText(new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(similar.comparisons[0].distance));
  await first.locator("summary").click();
  await expect(first.locator("tbody tr")).toHaveCount(6);
  await expect(page.locator(".history-table tbody tr")).toHaveCount(6);
  for (const metric of historical.historical.metrics) {
    const latest = historical.current.metrics.find((item: { metric: string }) => item.metric === metric.metric);
    const format = (value: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
    const row = page.locator(`[data-history-metric="${metric.metric}"]`);
    await expect(row.locator("td").nth(1)).toHaveText(`${format(metric.total)} / ${format(metric.per90)}`);
    await expect(row.locator("td").nth(2)).toHaveText(`${format(latest.total)} / ${format(latest.per90)}`);
    expect(metric.percentile).toBeNull();
  }
  await expect(page.getByText("Historical percentiles unavailable: incomplete birth-date coverage.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("comparison.png"), fullPage: true });
  await page.getByRole("button", { name: "ES", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Jugadores similares", exact: true })).toBeVisible();
  await expect(page.locator(".history-table tbody tr")).toHaveCount(6);
  await expect(page.getByRole("heading", { name: "Muestras historicas", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("comparison-spanish.png"), fullPage: true });
  await page.getByRole("link", { name: similar.comparisons[0].player.display_name, exact: true }).click();
  await expect(page.getByRole("heading", { name: similar.comparisons[0].player.display_name, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Volver a la busqueda", exact: true }).click();
  await expect(page.getByLabel("Solicitud de busqueda")).toHaveValue(query);
  expect(errors).toEqual([]);
});

test("comparison errors retry independently and insufficient evidence stays empty", async ({ page, request }) => {
  const search = await request.post("/api/search", { data: { query: "Find wingers aged 23 or younger sorted by successful dribbles" } });
  const candidate = (await search.json()).players.find((player: { percentile: number | null }) => player.percentile === null);
  await page.route("**/api/players/*/history?*", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto(`/players/${candidate.player_id}`);
  const similarity = page.getByRole("region", { name: "Similar players", exact: true });
  await expect(similarity.getByRole("status")).toContainText("Too few qualified players");
  await expect(similarity.locator(".similarity-list > li")).toHaveCount(0);
  const history = page.getByRole("region", { name: "Historical snapshots", exact: true });
  await expect(history.getByRole("alert")).toContainText("Comparison data unavailable");
  await page.unroute("**/api/players/*/history?*");
  await history.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(history.getByRole("status")).toContainText("No 2018 record");
  await expect(history.locator(".history-table")).toHaveCount(0);
  await expect(page.locator(".metric-table tbody tr")).toHaveCount(6);
});
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import type { Profile } from "../app/players/[playerId]/profile";
import type { Similarity, History } from "../app/players/[playerId]/comparisons";
import type { Fit } from "../app/clubs/fit";
import type { Club, Preferences } from "../app/clubs/shared";

const testApi = process.env.CANTERA_CLUB_TEST_API;
test.beforeEach(async ({ page }) => {
  if (testApi) await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${testApi}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

function checkPdf(path: string, required: string[]) {
  execFileSync("../.venv/bin/python", ["-c", "import sys,json; from pypdf import PdfReader; document=PdfReader(sys.argv[1]); assert len(document.pages)==1, len(document.pages); page=document.pages[0]; assert abs(float(page.mediabox.width)-595.28)<2; assert abs(float(page.mediabox.height)-841.89)<2; text=page.extract_text(); assert all(value in text for value in json.loads(sys.argv[2])), text", path, JSON.stringify(required)]);
}

test("report base profile prints one A4 page and blocks missing players", async ({ page, request }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const profile: Profile = await (await request.get("/api/players/3009")).json();
  const history: History = await (await request.get("/api/players/3009/history")).json();
  const similar: Similarity = await (await request.get("/api/players/3009/similar?limit=3")).json();
  await page.goto("/players/3009/report?lang=en");
  await expect(page.getByTestId("player-report")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeEnabled();
  await expect(page.locator("[data-metric]")).toHaveCount(6);
  const format = (value: number | null) => value === null ? "--" : new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
  for (const metric of profile.player.metrics) await expect(page.locator(`[data-metric="${metric.metric}"] td`)).toHaveText([format(metric.total), format(metric.per90), format(metric.percentile)]);
  for (const metric of history.historical!.metrics) {
    const current = history.current!.metrics.find(item => item.metric === metric.metric)!;
    await expect(page.locator(`[data-history-metric="${metric.metric}"] td`)).toHaveText([format(metric.per90), format(current.per90), format(current.per90! - metric.per90!)]);
  }
  await expect(page.getByRole("region", { name: "Similar players", exact: true }).locator("li strong")).toHaveText(similar.comparisons.map(item => format(item.distance)));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
  expect(await page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels.some((value, index) => index % 4 === 3 && value > 0);
  })).toBeTruthy();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath("report.png"), fullPage: true });
  const pdf = testInfo.outputPath("report.pdf");
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  checkPdf(pdf, ["StatsBomb", "Sources & limitations", "Report loaded", "World Cup snapshots", "Similar players"]);
  await page.getByRole("button", { name: "ES", exact: true }).click();
  await expect(page.getByRole("button", { name: "Imprimir", exact: true })).toBeEnabled();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await page.screenshot({ path: testInfo.outputPath("report-es.png"), fullPage: true });
  const spanishPdf = testInfo.outputPath("report-es.pdf");
  await page.pdf({ path: spanishPdf, preferCSSPageSize: true, printBackground: true });
  checkPdf(spanishPdf, ["Fuentes y limites", "Informe cargado", "StatsBomb"]);
  await page.goto("/players/9223372036854775807/report");
  await expect(page.locator('p[role="alert"]')).toContainText("Player not found");
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("search to profile to report preserves context and invokes print", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(10);
  const query = await page.getByLabel("Search request").inputValue();
  await page.locator("tbody tr").first().getByRole("link").click();
  await page.getByRole("link", { name: "Player report", exact: true }).click();
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeEnabled();
  expect(new URL(page.url()).searchParams.get("q")).toBe(query);
  await page.evaluate(() => { window.print = () => { document.documentElement.dataset.printInvoked = "yes"; }; });
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-invoked", "yes");
  await page.getByRole("button", { name: "ES", exact: true }).click();
  await expect(page.getByRole("button", { name: "Imprimir", exact: true })).toBeEnabled();
  await page.getByRole("link", { name: "Perfil", exact: true }).click();
  await page.getByRole("link", { name: "Volver a la busqueda", exact: true }).click();
  await expect(page.getByLabel("Solicitud de busqueda")).toHaveValue(query);
});

test("report errors block printing while legitimate missing history does not", async ({ page }) => {
  await page.route("**/api/players/3009/history?*", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/players/3009/report");
  await expect(page.getByTestId("player-report").getByRole("alert")).toContainText("Data unavailable");
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeDisabled();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("player-report")).toBeHidden();
  await expect(page.getByText("Report is not ready to print.", { exact: false })).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.unroute("**/api/players/3009/history?*");
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeEnabled();
  await page.route("**/api/players/3009/history?*", route => route.fulfill({ json: { status: "unavailable", historical: null, explanation: "No 2018 record for this player.", methodology: "Snapshots only." } }));
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(page.getByText("No 2018 record for this player.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeEnabled();
  await page.goto("/players/3009/report?club_id=not-a-club");
  await expect(page.getByTestId("player-report").getByRole("alert")).toContainText("Club unavailable");
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Clear club", exact: true }).click();
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeEnabled();
  await page.route("**/api/clubs?*", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeEnabled();
  await expect(page.getByRole("navigation").getByRole("alert")).toContainText("Data unavailable");
});

test("report preserves real zeros, missing ranks, ties and unsupported scopes", async ({ page, request }, testInfo) => {
  const original: Profile = await (await request.get("/api/players/3009")).json();
  let fixture = structuredClone(original);
  fixture.player.display_name = "Long Player Name For Print Layout Verification With Multiple Family Names";
  fixture.player.metrics[0].percentile = null;
  fixture.player.metrics[0].per90 = null;
  fixture.player.metrics[0].total = 0;
  fixture.player.metrics[0].evidence_explanation = "Missing verified evidence.";
  fixture.radar_available = false;
  await page.route(/\/api\/players\/3009\?/, route => route.fulfill({ json: fixture }));
  await page.goto("/players/3009/report");
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeEnabled();
  await expect(page.locator(`[data-metric="${fixture.player.metrics[0].metric}"] td`)).toHaveText(["0", "--", "--"]);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Observed profile summary" })).toContainText("Insufficient eligible percentile evidence");
  const pdf = testInfo.outputPath("missing-evidence.pdf");
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  checkPdf(pdf, ["Missing verified evidence", "Sources & limitations", "Report loaded"]);
  fixture = structuredClone(original);
  fixture.player.metrics.forEach(metric => { metric.percentile = 0; });
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(page.getByRole("region", { name: "Observed profile summary" })).toContainText("All six observed percentiles are equal");
  fixture.player.position = "GK";
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(page.getByText("General event metrics only; goalkeeper-specific evaluation is unavailable.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Observed profile summary" })).toContainText("Insufficient eligible percentile evidence");
  fixture.scope[0].season = "2018";
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toHaveText("Unsupported dataset");
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeDisabled();
  expect((await page.goto("/players/9223372036854775808/report"))?.status()).toBe(404);
});

test("superseded club responses cannot replace the selected report", async ({ page, request }) => {
  const clubs: Club[] = (await (await request.get("/api/clubs")).json()).clubs;
  let release: () => void = () => {};
  let started: () => void = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { started = resolve; });
  await page.route(`**/api/players/3009/club-fit?*club_id=${clubs[0].team_id}`, async route => {
    started();
    await waiting;
    await route.fulfill({ json: { club: clubs[0], score: null, revision: 99, explanation: "Superseded club response", methodology: "Old selection", contributions: [] } });
  });
  await page.goto("/players/3009/report");
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeEnabled();
  await page.getByLabel("Club preferences", { exact: true }).selectOption(String(clubs[0].team_id));
  await requested;
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeDisabled();
  await page.getByLabel("Club preferences", { exact: true }).selectOption(String(clubs[1].team_id));
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeEnabled();
  release();
  await expect(page.getByRole("heading", { name: `Club preference index / ${clubs[1].name}`, exact: true })).toBeVisible();
  await expect(page.getByTestId("player-report")).not.toContainText("Superseded club response");
  expect(new URL(page.url()).searchParams.get("club_id")).toBe(String(clubs[1].team_id));
  await page.getByRole("button", { name: "ES", exact: true }).click();
  await expect(page.getByRole("button", { name: "Imprimir", exact: true })).toBeEnabled();
  await expect(page.getByRole("heading", { name: `Indice de preferencia del club / ${clubs[1].name}`, exact: true })).toBeVisible();
});

test("real goalkeeper and low-minute player retain unavailable evidence in printable reports", async ({ page, request }, testInfo) => {
  const players: { player_id: number; position: string | null; minutes: number }[] = (await (await request.get("/api/players?max_age=60&min_minutes=0&limit=1000")).json()).players;
  const clubs: Club[] = (await (await request.get("/api/clubs")).json()).clubs;
  const candidates = [players.find(player => player.position === "GK" && player.minutes >= 180), players.find(player => player.minutes > 0 && player.minutes < 180)];
  for (const candidate of candidates) {
    expect(candidate).toBeTruthy();
    const base = `${testApi || ""}/api/players/${candidate!.player_id}`;
    const similar: Similarity = await (await request.get(`${base}/similar`)).json();
    const fit: Fit = await (await request.get(`${base}/club-fit?club_id=${clubs[0].team_id}`)).json();
    expect(similar.status).toBe("unavailable");
    expect(fit.score).toBeNull();
    await page.goto(`/players/${candidate!.player_id}/report?club_id=${clubs[0].team_id}`);
    await expect(page.getByRole("button", { name: "Print", exact: true })).toBeEnabled();
    await expect(page.getByTestId("report-fit")).toHaveText(fit.explanation!);
    await expect(page.getByRole("region", { name: "Similar players", exact: true })).toContainText(similar.explanation!);
    await expect(page.getByRole("region", { name: "Observed profile summary" })).toContainText("Insufficient eligible percentile evidence");
    if (candidate!.minutes < 180) {
      await expect(page.locator("canvas")).toHaveCount(0);
      await expect(page.locator("[data-metric] td:nth-child(4)")).toHaveText(Array(6).fill("--"));
    }
    const pdf = testInfo.outputPath(`unavailable-${candidate!.player_id}.pdf`);
    await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
    checkPdf(pdf, ["Sources & limitations", "Report loaded", "Insufficient eligible percentile evidence"]);
  }
});

test("saved club report matches API contributions and prints full bilingual evidence", async ({ page, request }, testInfo) => {
  test.skip(!testApi, "Requires an isolated CANTERA_CLUB_TEST_API; never write normal preferences");
  const clubs: Club[] = (await (await request.get(`${testApi}/api/clubs`)).json()).clubs;
  const club = clubs[testInfo.project.name === "desktop" ? 4 : 5];
  const preferences: Preferences = await (await request.get(`${testApi}/api/clubs/${club.team_id}/profile`)).json();
  preferences.weights.W.shots = 4;
  preferences.weights.W.tackles_won = 0;
  const save = await request.put(`${testApi}/api/clubs/${club.team_id}/profile`, { headers: { Origin: "http://127.0.0.1:3002" }, data: { revision: preferences.revision, weights: preferences.weights } });
  expect(save.ok()).toBeTruthy();
  for (const language of ["en", "es"]) {
    const fit: Fit = await (await request.get(`${testApi}/api/players/3009/club-fit?club_id=${club.team_id}&lang=${language}`)).json();
    const format = (value: number | null) => value === null ? "--" : new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);
    await page.goto(`/players/3009/report?lang=${language}&club_id=${club.team_id}`);
    await expect(page.getByRole("button", { name: language === "en" ? "Print" : "Imprimir", exact: true })).toBeEnabled();
    await expect(page.getByTestId("report-fit")).toHaveText(`${format(fit.score)} / 100`);
    for (const metric of fit.contributions) await expect(page.locator(`[data-fit-metric="${metric.metric}"] td`)).toHaveText([`${format(metric.share * 100)}%`, format(metric.percentile), format(metric.contribution)]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: testInfo.outputPath(`club-report-${language}.png`), fullPage: true });
    const pdf = testInfo.outputPath(`club-report-${language}.pdf`);
    await page.emulateMedia({ media: "print" });
    await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
    checkPdf(pdf, [club.name, language === "en" ? "Contribution" : "Contribucion", language === "en" ? "Report loaded" : "Informe cargado", "StatsBomb"]);
    const canvas = await page.locator("canvas").boundingBox();
    const note = await page.locator("#radar-note").boundingBox();
    expect(canvas!.y + canvas!.height).toBeLessThanOrEqual(note!.y);
    await page.emulateMedia({ media: "print" });
    await page.screenshot({ path: testInfo.outputPath(`club-report-print-${language}.png`), fullPage: true });
    await page.emulateMedia({ media: "screen" });
  }
});
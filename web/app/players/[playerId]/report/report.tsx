"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Printer, RefreshCw } from "lucide-react";
import { METRICS, type Language, type Metric } from "../../../labels";
import { useClubData, type Club } from "../../../clubs/shared";
import type { Fit } from "../../../clubs/fit";
import type { Profile } from "../profile";
import type { History, Similarity } from "../comparisons";
import PlayerRadar from "../radar";
import styles from "./report.module.css";

const COPY = {
  en: { title: "Player evidence report", profile: "Profile", reload: "Reload", print: "Print", language: "Language", club: "Club preferences", none: "No club selected", clear: "Clear club", loading: "Loading...", error: "Data unavailable. Reload to retry.", notFound: "Player not found", clubError: "Club unavailable. Clear selection or reload.", unsupported: "Unsupported dataset", age: "Age at sample start", appearances: "appearances", metrics: "Observed metrics", metric: "Metric", percentile: "Percentile", peers: "qualified peers", minimum: "Minimum", minutes: "minutes", positionShare: "Minutes in primary position", relative: "Relative volume, not talent. Rates include all playing roles.", radar: "Radar unavailable", history: "World Cup snapshots", change: "Difference /90", historicalNote: "Snapshots, not continuous development. Opponents, roles and samples differ; xG model equivalence is unverified. Differences do not prove improved ability. Historical percentiles are unavailable: incomplete birth-date coverage.", similar: "Similar players", distance: "Distance (percentile points)", similarityNote: "Same tournament, position and age band. Mean absolute difference across six equally weighted percentiles. Lower means a closer observed profile, not greater talent.", summary: "Observed profile summary", highest: "Highest observed percentile", lowest: "Lowest observed percentile", tied: "All six observed percentiles are equal; no highest/lowest distinction.", noSummary: "Insufficient eligible percentile evidence for a relative profile summary.", summaryNote: "Relative metric volume within this cohort, not a strength or weakness assessment.", fit: "Club preference index", revision: "Revision", share: "Effective share", contribution: "Contribution", source: "Sources & limitations", loaded: "Report loaded", missing: "-- = unavailable, never assumed zero.", printBlocked: "Report is not ready to print. Resolve loading or service errors first.", goalkeeper: "General event metrics only; goalkeeper-specific evaluation is unavailable.", methods: "Full profile and methodology", formula: "Per 90 = total * 90 / minutes", ranks: "Percentiles: midrank among eligible peers; 0-100, ties shared." },
  es: { title: "Informe de evidencia", profile: "Perfil", reload: "Recargar", print: "Imprimir", language: "Idioma", club: "Preferencias del club", none: "Sin club seleccionado", clear: "Quitar club", loading: "Cargando...", error: "Datos no disponibles. Recarga para reintentar.", notFound: "Jugador no encontrado", clubError: "Club no disponible. Quita la seleccion o recarga.", unsupported: "Muestra no compatible", age: "Edad al inicio de la muestra", appearances: "partidos", metrics: "Metricas observadas", metric: "Metrica", percentile: "Percentil", peers: "pares elegibles", minimum: "Minimo", minutes: "minutos", positionShare: "Minutos en la posicion principal", relative: "Volumen relativo, no talento. Tasas de todos los roles jugados.", radar: "Radar no disponible", history: "Muestras de Mundiales", change: "Diferencia /90", historicalNote: "Muestras, no desarrollo continuo. Cambian rivales, roles y muestras; equivalencia de modelos xG no verificada. Las diferencias no prueban mejora de capacidad. Percentiles historicos ausentes: cobertura incompleta de nacimientos.", similar: "Jugadores similares", distance: "Distancia (puntos percentiles)", similarityNote: "Mismo torneo, posicion y edad. Diferencia absoluta media de seis percentiles con pesos iguales. Menor distancia indica un perfil observado mas cercano, no mayor talento.", summary: "Resumen del perfil observado", highest: "Mayor percentil observado", lowest: "Menor percentil observado", tied: "Los seis percentiles son iguales; sin distincion entre mayor y menor.", noSummary: "Evidencia de percentiles elegibles insuficiente para un resumen relativo.", summaryNote: "Volumen relativo dentro de este grupo, no evaluacion de fortalezas o debilidades.", fit: "Indice de preferencia del club", revision: "Revision", share: "Proporcion efectiva", contribution: "Contribucion", source: "Fuentes y limites", loaded: "Informe cargado", missing: "-- = no disponible, nunca cero supuesto.", printBlocked: "Informe no listo para imprimir. Resuelve la carga o los errores del servicio.", goalkeeper: "Solo metricas generales; evaluacion especifica de porteros no disponible.", methods: "Perfil completo y metodologia", formula: "Por 90 = total * 90 / minutos", ranks: "Percentiles: rango medio entre pares elegibles; 0-100, empates compartidos." },
};

type Resource<Data> = { data?: Data; error?: number };
type ReportData = { profile: Resource<Profile>; history: Resource<History>; similar: Resource<Similarity>; fit: Resource<Fit>; loaded: string };

function useReport(playerId: string, language: Language, clubId: string) {
  const [data, setData] = useState<ReportData>();
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]);
    async function load<Data>(url: string): Promise<Resource<Data>> {
      try {
        const response = await fetch(url, { signal, cache: "no-store" });
        return response.ok ? { data: await response.json() } : { error: response.status };
      } catch { return { error: 503 }; }
    }
    const base = `/api/players/${playerId}`;
    const validClub = /^\d+$/.test(clubId) && BigInt(clubId) > 0 && BigInt(clubId) <= BigInt("9223372036854775807");
    Promise.all([
      load<Profile>(`${base}?lang=${language}`),
      load<History>(`${base}/history?lang=${language}`),
      load<Similarity>(`${base}/similar?lang=${language}&limit=3`),
      clubId ? validClub ? load<Fit>(`${base}/club-fit?${new URLSearchParams({ lang: language, club_id: clubId })}`) : Promise.resolve<Resource<Fit>>({ error: 404 }) : Promise.resolve<Resource<Fit>>({}),
    ]).then(([profile, history, similar, fit]) => {
      if (!controller.signal.aborted) setData({ profile, history, similar, fit, loaded: new Date().toISOString() });
    });
    return () => controller.abort();
  }, [playerId, language, clubId]);
  return data;
}

function ClubSelector({ language, clubId, onChange }: { language: Language; clubId: string; onChange: (value: string) => void }) {
  const resource = useClubData<{ clubs: Club[] }>(`/api/clubs?lang=${language}`);
  const text = COPY[language];
  return <label>{text.club}<select aria-label={text.club} value={clubId} onChange={event => onChange(event.target.value)}>
    <option value="">{text.none}</option>
    {clubId && !resource.data?.clubs.some(club => String(club.team_id) === clubId) && <option value={clubId}>{clubId}</option>}
    {resource.data?.clubs.map(club => <option key={club.team_id} value={club.team_id}>{club.name}</option>)}
  </select>{!resource.data && <span role={resource.error ? "alert" : "status"}>{resource.error ? text.error : text.loading}</span>}</label>;
}

export default function PlayerReport({ playerId, language: initialLanguage, searchQuery, initialClubId }: {
  playerId: string; language: Language; searchQuery: string; initialClubId: string;
}) {
  const [language, setLanguage] = useState(initialLanguage);
  const [clubId, setClubId] = useState(initialClubId);
  const [generation, setGeneration] = useState(0);
  const parameters = (lang: Language, club: string) => new URLSearchParams({ lang, ...(searchQuery ? { q: searchQuery } : {}), ...(club ? { club_id: club } : {}) });
  function select(lang: Language, club: string) {
    setLanguage(lang);
    setClubId(club);
    window.history.replaceState(null, "", `/players/${playerId}/report?${parameters(lang, club)}`);
  }
  return <ReportView key={`${playerId}:${language}:${clubId}:${generation}`} playerId={playerId} language={language} searchQuery={searchQuery} clubId={clubId}
    reload={() => setGeneration(generation + 1)} controls={<>
      <div role="group" aria-label={COPY[language].language}>{(["en", "es"] as const).map(lang => <button key={lang} aria-pressed={language === lang} onClick={() => select(lang, clubId)}>{lang.toUpperCase()}</button>)}</div>
      <ClubSelector language={language} clubId={clubId} onChange={club => select(language, club)} />
      {clubId && <button onClick={() => select(language, "")}>{COPY[language].clear}</button>}
    </>} />;
}

function ReportView({ playerId, language, searchQuery, clubId, reload, controls }: {
  playerId: string; language: Language; searchQuery: string; clubId: string; reload: () => void; controls: React.ReactNode;
}) {
  const result = useReport(playerId, language, clubId);
  const data = result?.profile.data;
  const error = result?.profile.error;
  const text = COPY[language];
  const spanish = language === "es";
  const format = (value: number | null, digits = 2) => value === null ? "--" : new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);
  const href = `/players/${playerId}?${new URLSearchParams({ lang: language, ...(searchQuery ? { q: searchQuery } : {}) })}`;
  const supported = data?.scope.length === 1 && data.scope[0].competition === "FIFA World Cup" && data.scope[0].season === "2022";
  const ready = Boolean(supported && result?.history.data && result?.similar.data && (!clubId || result?.fit.data));
  const previous = result?.history.data?.historical;
  const current = result?.history.data?.current;
  const fit = result?.fit.data;
  const metricOrder = Object.keys(METRICS.en) as Metric[];
  const metrics = metricOrder.flatMap(name => data?.player.metrics.filter(metric => metric.metric === name) || []);
  const complete = metrics.length === 6 && metrics.every(metric => metric.percentile !== null);
  const eligible = complete && data?.player.position !== "GK" && data?.player.age !== null && data !== undefined && data.player.minutes >= data.methodology.settings.min_minutes && metrics.every(metric => metric.peer_count >= data.methodology.settings.min_peers);
  const ranked = eligible ? [...metrics].sort((first, second) => second.percentile! - first.percentile!) : [];
  const highest = ranked[0];
  const lowest = ranked.length ? metrics.find(metric => metric.percentile === ranked[ranked.length - 1].percentile) : undefined;
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = `${data?.player.display_name || "Cantera IQ"} | ${COPY[language].title}`;
  }, [language, data]);
  async function print() {
    if (!ready) return;
    await document.fonts.ready;
    window.print();
  }
  return <div className={`${styles.workspace} ${ready ? "" : styles.blocked}`}>
    <nav className={styles.toolbar} aria-label={text.title}>
      <Link href={href}><ArrowLeft size={16} />{text.profile}</Link>
      <button onClick={reload}><RefreshCw size={16} />{text.reload}</button>
      <button disabled={!ready} onClick={print}><Printer size={16} />{text.print}</button>
      {controls}
    </nav>
    <p className={styles.printWarning}>{text.printBlocked}</p>
    {!data && <p role={error ? "alert" : "status"}>{error ? error === 404 ? text.notFound : text.error : text.loading}</p>}
    {data && !supported && <p role="alert">{text.unsupported}</p>}
    {data && supported && result && <main className={styles.sheet} data-testid="player-report">
      <header className={styles.heading}><p>Cantera IQ / {text.title}</p>
        <h1>{data.player.display_name}</h1><p>{data.player.team} / FIFA World Cup 2022 / {data.player.position || "--"}</p>
        <p>{data.dataset.start_date} - {data.dataset.end_date} | {text.age}: {format(data.player.age, 0)} ({data.player.reference_date}) | {format(data.player.minutes)} min | {data.player.appearances} {text.appearances}</p>
      </header>
      {data.player.position === "GK" && <p className={styles.warning}>{text.goalkeeper}</p>}
      <section className={styles.analysis}>
        <div><h2 id="metric-heading">{text.metrics}</h2>
          <table><thead><tr><th>{text.metric}</th><th>Total</th><th>/90</th><th>{text.percentile}</th></tr></thead>
            <tbody>{metrics.map(metric => <tr key={metric.metric} data-metric={metric.metric}><th>{METRICS[language][metric.metric]}</th><td>{format(metric.total)}</td><td>{format(metric.per90)}</td><td>{format(metric.percentile)}</td></tr>)}</tbody></table>
          <p>{data.player.position || "--"} / {data.player.age_band || "--"} | {metrics[0]?.peer_count ?? "--"} {text.peers} | {text.minimum}: {data.methodology.settings.min_minutes} {text.minutes}, {data.methodology.settings.min_peers} {text.peers}</p>
          <p>{text.positionShare}: {data.player.main_position_share === null ? "--" : `${format(data.player.main_position_share * 100)}%`}</p>
          <p>{metrics[0]?.evidence_explanation}</p>
        </div>
        <div>{data.radar_available && complete ? <PlayerRadar name={data.player.display_name} language={language} metrics={metrics} /> : <p>{text.radar}: {metrics.find(metric => metric.percentile === null)?.evidence_explanation || text.noSummary}</p>}
          <p id="radar-note">{text.relative}</p></div>
      </section>
      <section aria-label={text.summary}><h2>{text.summary}</h2>
        <p>{!highest || !lowest ? text.noSummary : highest.percentile === lowest.percentile ? text.tied : <>{text.highest}: {METRICS[language][highest.metric]} ({format(highest.percentile)}). {text.lowest}: {METRICS[language][lowest.metric]} ({format(lowest.percentile)}).</>}</p>
        <p>{text.summaryNote}</p>
      </section>
      <div className={styles.comparisons}>
        <section aria-label={text.history}><h2>{text.history}</h2>
          {result.history.error && <p role="alert">{text.error}</p>}
          {result.history.data?.explanation && <p>{result.history.data.explanation}</p>}
          {result.history.data?.status === "available" && previous && current && <>
            <p>2018: {format(previous.minutes)} min / {previous.position || "--"} | 2022: {format(current.minutes)} min / {current.position || "--"}</p>
            <table><thead><tr><th>{text.metric}</th><th>2018 /90</th><th>2022 /90</th><th>{text.change}</th></tr></thead><tbody>{metricOrder.map(name => {
              const before = previous.metrics.find(metric => metric.metric === name)?.per90 ?? null;
              const after = current.metrics.find(metric => metric.metric === name)?.per90 ?? null;
              return <tr key={name} data-history-metric={name}><th>{METRICS[language][name]}</th><td>{format(before)}</td><td>{format(after)}</td><td>{format(before !== null && after !== null ? after - before : null)}</td></tr>;
            })}</tbody></table>
          </>}
          <p>{text.historicalNote}</p>
        </section>
        <section aria-label={text.similar}><h2>{text.similar}</h2>
          {result.similar.error && <p role="alert">{text.error}</p>}
          {result.similar.data?.explanation && <p>{result.similar.data.explanation}</p>}
          {result.similar.data?.status === "available" && <><p>{text.distance}</p><ol className={styles.similar}>{result.similar.data.comparisons.slice(0, 3).map(item => <li key={item.player.player_id}>
            <Link href={`/players/${item.player.player_id}?${new URLSearchParams({ lang: language, ...(searchQuery ? { q: searchQuery } : {}) })}`}>{item.player.display_name}</Link><strong>{format(item.distance)}</strong>
            <small>{item.player.position} / {data.player.age_band} / {format(item.player.minutes)} min</small>
          </li>)}</ol></>}
          <p>{text.similarityNote}</p>
        </section>
      </div>
      {clubId && <section aria-label={text.fit}><h2>{text.fit}{fit ? ` / ${fit.club.name}` : ""}</h2>
        {result.fit.error && <p role="alert">{text.clubError}</p>}
        {fit && <><p>{text.revision} {fit.revision} / {fit.position || "--"} / WC2022 | <strong data-testid="report-fit">{fit.score === null ? fit.explanation : `${format(fit.score)} / 100`}</strong></p>
          {fit.score !== null && <table className={styles.weights}><thead><tr><th>{text.metric}</th><th>{text.share}</th><th>{text.percentile}</th><th>{text.contribution}</th></tr></thead><tbody>{fit.contributions.map(item => <tr key={item.metric} data-fit-metric={item.metric}><th>{METRICS[language][item.metric]}</th><td>{format(item.share * 100)}%</td><td>{format(item.percentile)}</td><td>{format(item.contribution)}</td></tr>)}</tbody></table>}
          <p>{fit.methodology}</p></>}
      </section>}
      <section className={styles.sources}><h2>{text.source}</h2><p>{data.methodology.warning} {text.missing}</p>
        <p>{text.formula} | {text.ranks} | {data.methodology.settings.methodology_version}</p>
        <p><a href="https://github.com/statsbomb/open-data/tree/4b73468fc5b0f1950f9f66fada70ad3a4f9327cb">StatsBomb Open Data / 4b73468fc5b0</a>{data.player.birth_source_url && <> / <a href={data.player.birth_source_url}>FIFA 2022 / {spanish ? "Nacimiento" : "Birth date"}: {data.player.birth_date}</a></>} / <Link href={href}>{text.methods}</Link></p>
        <p>{text.loaded}: <time dateTime={result.loaded}>{result.loaded}</time></p>
      </section>
    </main>}
  </div>;
}
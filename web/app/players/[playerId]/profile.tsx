"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CircleAlert, Database, FileText, LoaderCircle, RefreshCw, UserRound } from "lucide-react";
import { EVIDENCE, METRICS, type Language, type Metric, type Evidence } from "../../labels";
import PlayerRadar from "./radar";
import PlayerComparisons from "./comparisons";
import ClubFit from "../../clubs/fit";

type PlayerMetric = {
  metric: Metric; total: number; per90: number | null; percentile: number | null;
  peer_count: number; evidence_status: Evidence; definition: string; evidence_explanation: string;
};
export type Profile = {
  language: Language; radar_available: boolean;
  player: { player_id: number; name: string; display_name: string; age: number | null; birth_date: string | null;
    team: string; shirt_number: number | null; position: string | null; minutes: number; appearances: number;
    main_position_share: number | null; age_band: string | null; reference_date: string;
    birth_source_name: string | null; birth_source_url: string | null; metrics: PlayerMetric[] };
  dataset: { start_date: string; end_date: string; matches: number };
  scope: { competition: string; season: string }[];
  methodology: { per90_formula: string; percentile_formula: string; warning: string;
    settings: { min_minutes: number; min_peers: number; methodology_version: string } };
};
const COPY = {
  en: {
    title: "Player profile", back: "Back to search", language: "Language", loading: "Loading player",
    notFound: "Player not found", notFoundDetail: "This player ID is not present in the current dataset.",
    unavailable: "Player data unavailable", unavailableDetail: "The API or dataset is unavailable. Try again.", retry: "Retry",
    age: "Age at tournament start", position: "Primary position", team: "National team", minutes: "Minutes", appearances: "Appearances",
    historical: "Historical tournament sample", radar: "Percentile radar", radarNote: "Same primary position and age band. Higher volume is not necessarily better; this is not a talent score.",
    noRadar: "Radar unavailable", noRadarDetail: "Insufficient evidence for a complete percentile profile. Missing values are not plotted as zero.",
    cohort: "Comparison group", peers: "Qualified players", minMinutes: "Cohort minimum minutes", minPeers: "Minimum peer count",
    share: "Minutes in primary position", data: "Observed sample", dates: "Match dates", asOf: "Age reference date", matches: "Dataset matches",
    metrics: "Metric breakdown", metric: "Metric", total: "Total", per90: "Per 90", percentile: "Percentile", evidence: "Evidence",
    calculation: "Calculation and definition", missing: "Not available", methodology: "Methodology & sources", formula: "Rate formula",
    percentileFormula: "Percentile formula", born: "Birth date", birthSource: "Birth-date source record", eventSource: "Event data",
    qualified: "Qualified cohort", goalkeeper: "These are general event metrics, not a goalkeeper evaluation. Goalkeeping-specific metrics are not included.",
    mixed: "Rates include events in all roles; the cohort uses the role with the most playing minutes.",
  },
  es: {
    title: "Perfil del jugador", back: "Volver a la busqueda", language: "Idioma", loading: "Cargando jugador",
    notFound: "Jugador no encontrado", notFoundDetail: "Este identificador no esta presente en los datos actuales.",
    unavailable: "Datos del jugador no disponibles", unavailableDetail: "La API o los datos no estan disponibles. Intentalo de nuevo.", retry: "Reintentar",
    age: "Edad al inicio del torneo", position: "Posicion principal", team: "Seleccion", minutes: "Minutos", appearances: "Partidos jugados",
    historical: "Muestra historica del torneo", radar: "Radar de percentiles", radarNote: "Misma posicion principal y grupo de edad. Un mayor volumen no implica mejor rendimiento; no es una puntuacion de talento.",
    noRadar: "Radar no disponible", noRadarDetail: "Evidencia insuficiente para un perfil completo de percentiles. Los valores ausentes no se representan como cero.",
    cohort: "Grupo de comparacion", peers: "Jugadores elegibles", minMinutes: "Minutos minimos del grupo", minPeers: "Minimo de pares",
    share: "Minutos en la posicion principal", data: "Muestra observada", dates: "Fechas de partidos", asOf: "Fecha de referencia de edad", matches: "Partidos del conjunto",
    metrics: "Detalle de metricas", metric: "Metrica", total: "Total", per90: "Por 90", percentile: "Percentil", evidence: "Evidencia",
    calculation: "Calculo y definicion", missing: "No disponible", methodology: "Metodologia y fuentes", formula: "Formula de tasa",
    percentileFormula: "Formula del percentil", born: "Fecha de nacimiento", birthSource: "Registro de nacimiento", eventSource: "Datos de eventos",
    qualified: "Grupo elegible", goalkeeper: "Son metricas generales de eventos, no una evaluacion de porteros. No se incluyen metricas especificas de porteria.",
    mixed: "Las tasas incluyen eventos en todos los roles; el grupo usa el rol con mas minutos jugados.",
  },
};

export default function PlayerProfile({ playerId, initialLanguage, searchQuery }: {
  playerId: string; initialLanguage: Language; searchQuery: string;
}) {
  const [language, setLanguage] = useState(initialLanguage);
  const [data, setData] = useState<Profile | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "not_found" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const text = COPY[language];
  const backHref = `/?${new URLSearchParams({ lang: language, ...(searchQuery ? { q: searchQuery } : {}) })}`;
  const format = (value: number | null, digits = 1) => value === null ? "--" : new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);

  useEffect(() => {
    document.documentElement.lang = language;
    const controller = new AbortController();
    fetch(`/api/players/${playerId}?lang=${language}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) })
      .then(async response => {
        if (controller.signal.aborted) return;
        if (response.status === 404) { setStatus("not_found"); return; }
        if (!response.ok) throw new Error("Profile unavailable");
        const profile: Profile = await response.json();
        if (!controller.signal.aborted) { setData(profile); setStatus("ok"); document.title = `${profile.player.display_name} | Cantera IQ`; }
      })
      .catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  }, [playerId, language, attempt]);

  function changeLanguage(lang: Language) {
    if (lang === language) return;
    setData(null);
    setStatus("loading");
    setLanguage(lang);
    window.history.replaceState(null, "", `/players/${playerId}?${new URLSearchParams({ lang, ...(searchQuery ? { q: searchQuery } : {}) })}`);
  }

  const player = data?.player;
  const metrics = player?.metrics || [];
  const evidence = metrics[0];
  const radarAvailable = data?.radar_available && metrics.length === 6 && metrics.every(metric => metric.percentile !== null);
  return <div className="profile-shell">
    <header className="topbar">
      <Link href={backHref} className="brand" aria-label="Cantera IQ"><span className="brand-mark">C<span>IQ</span></span><span>Cantera <b>IQ</b></span></Link>
      <span className="workspace-label">{text.title}</span>
      <Link className="player-link" href={`/clubs?${new URLSearchParams({ lang: language, ...(searchQuery ? { q: searchQuery } : {}) })}`}>{language === "en" ? "Clubs" : "Clubes"}</Link>
      <div className="languages" role="group" aria-label={text.language}>{(["en", "es"] as const).map(lang =>
        <button type="button" key={lang} aria-pressed={language === lang} onClick={() => changeLanguage(lang)}>{lang.toUpperCase()}</button>)}</div>
    </header>
    <main className="profile-main">
      <Link className="back-link" href={backHref}><ArrowLeft size={16} />{text.back}</Link>
      {status === "ok" && <Link className="back-link" style={{ marginLeft: 24 }} href={`/players/${playerId}/report?${new URLSearchParams({ lang: language, ...(searchQuery ? { q: searchQuery } : {}) })}`}><FileText size={16} />{language === "en" ? "Player report" : "Informe del jugador"}</Link>}
      {status === "loading" && <div className="loading-state" role="status"><LoaderCircle className="spin" size={24} />{text.loading}...</div>}
      {(status === "not_found" || status === "error") && <section className="message" role="alert"><CircleAlert size={26} /><div>
        <h1>{status === "not_found" ? text.notFound : text.unavailable}</h1><p>{status === "not_found" ? text.notFoundDetail : text.unavailableDetail}</p>
        {status === "error" && <button className="text-button" onClick={() => { setStatus("loading"); setAttempt(attempt + 1); }}><RefreshCw size={16} />{text.retry}</button>}
      </div></section>}
      {status === "ok" && data && player && <>
        <section className="player-heading" aria-label={text.title}>
          <div className="player-heading-top"><div><p className="eyebrow"><UserRound size={14} />{text.title}</p><h1>{player.display_name}</h1><p className="player-subtitle">{player.team} <span>/</span> {data.scope.map(scope => `${scope.competition} ${scope.season}`).join(", ")}</p></div>
            <span className="historical-marker">{text.historical}</span></div>
          <dl className="player-stats">
            <div><dt>{text.age}</dt><dd>{format(player.age, 0)}</dd></div><div><dt>{text.position}</dt><dd>{player.position || "--"}</dd></div>
            <div><dt>{text.minutes}</dt><dd>{format(player.minutes)}</dd></div><div><dt>{text.appearances}</dt><dd>{format(player.appearances, 0)}</dd></div>
          </dl>
        </section>

        {player.position === "GK" && <p className="profile-warning"><CircleAlert size={17} />{text.goalkeeper}</p>}
        <div className="profile-analysis">
          <section className="radar-section" aria-labelledby="radar-heading">
            <div className="section-heading"><h2 id="radar-heading">{text.radar}</h2><span className="scale-label">0 - 100</span></div>
            {radarAvailable ? <PlayerRadar name={player.display_name} language={language} metrics={metrics} /> :
              <div className="radar-unavailable" role="status"><CircleAlert size={28} /><h3>{text.noRadar}</h3><p>{text.noRadarDetail}</p>{evidence && <p>{evidence.evidence_explanation}</p>}</div>}
            <p className="data-notice" id="radar-note">{text.radarNote}</p>
          </section>
          <aside className="cohort-section">
            <h2>{text.cohort}</h2>
            <p className="cohort-title">{player.position || "--"} <span>/</span> {player.age_band || "--"}</p>
            <dl className="profile-facts"><div><dt>{text.peers}</dt><dd>{evidence?.peer_count ?? "--"}</dd></div>
              <div><dt>{text.minMinutes}</dt><dd>{data.methodology.settings.min_minutes}</dd></div>
              <div><dt>{text.minPeers}</dt><dd>{data.methodology.settings.min_peers}</dd></div>
              <div><dt>{text.share}</dt><dd>{player.main_position_share === null ? "--" : `${format(player.main_position_share * 100)}%`}</dd></div></dl>
            {evidence && <div className="evidence-note"><span className={`evidence ${evidence.evidence_status === "moderate_sample" ? "moderate" : "limited"}`}><CircleAlert size={14} />{EVIDENCE[language][evidence.evidence_status]}</span><p>{evidence.evidence_explanation}</p></div>}
            <p className="subtle-note">{text.mixed}</p>
            <h3><Database size={15} />{text.data}</h3>
            <dl className="profile-facts"><div><dt>{text.dates}</dt><dd>{data.dataset.start_date} / {data.dataset.end_date}</dd></div>
              <div><dt>{text.asOf}</dt><dd>{player.reference_date || "--"}</dd></div>
              <div><dt>{text.matches}</dt><dd>{data.dataset.matches}</dd></div></dl>
          </aside>
        </div>

        <section className="profile-metrics" aria-labelledby="metric-heading">
          <div className="section-heading"><h2 id="metric-heading">{text.metrics}</h2><span className="scale-label">{player.position || "--"} / {player.age_band || "--"}</span></div>
          <div className="table-scroll" tabIndex={0} role="region" aria-label={text.metrics}>
            <table className="metric-table"><thead><tr><th>{text.metric}</th><th>{text.total}</th><th>{text.per90}</th><th>{text.percentile}</th><th>{text.evidence}</th></tr></thead>
              <tbody>{metrics.map(metric => <tr key={metric.metric} data-metric={metric.metric}>
                <td><strong>{METRICS[language][metric.metric]}</strong><details><summary>{text.calculation}</summary><p>{metric.definition}</p>
                  <p>{metric.per90 === null ? text.missing : `${format(metric.total, 4)} * 90 / ${format(player.minutes, 4)} = ${format(metric.per90, 4)}`}</p><p>{metric.evidence_explanation}</p></details></td>
                <td>{format(metric.total, 2)}</td><td className="metric-value">{format(metric.per90, 2)}</td>
                <td><div className="percentile-value"><span>{format(metric.percentile)}</span>{metric.percentile !== null && <span className="percentile-track"><span style={{ width: `${metric.percentile}%` }} /></span>}</div></td>
                <td><span className={`evidence ${metric.evidence_status === "moderate_sample" ? "moderate" : "limited"}`}>{EVIDENCE[language][metric.evidence_status]}</span></td>
              </tr>)}</tbody></table>
          </div>
        </section>

        <PlayerComparisons playerId={playerId} language={language} searchQuery={searchQuery} />
        <ClubFit playerId={playerId} language={language} searchQuery={searchQuery} />

        <section className="profile-methodology"><h2>{text.methodology}</h2><p className="data-notice"><CircleAlert size={16} />{data.methodology.warning}</p>
          <dl className="profile-facts"><div><dt>{text.formula}</dt><dd><code>{data.methodology.per90_formula}</code></dd></div>
            <div><dt>{text.percentileFormula}</dt><dd><code>{data.methodology.percentile_formula}</code></dd></div>
            <div><dt>{text.born}</dt><dd>{player.birth_date || text.missing}</dd></div>
            <div><dt>{text.birthSource}</dt><dd>{player.birth_source_url ? <a href={player.birth_source_url} target="_blank" rel="noreferrer">{player.birth_source_name || "FIFA"}<ArrowUpRight size={13} /></a> : text.missing}</dd></div>
            <div><dt>{text.eventSource}</dt><dd><a href="https://github.com/statsbomb/open-data/tree/4b73468fc5b0f1950f9f66fada70ad3a4f9327cb" target="_blank" rel="noreferrer">StatsBomb Open Data<ArrowUpRight size={13} /></a></dd></div></dl>
        </section>
      </>}
      <footer><span>Cantera IQ</span><span>StatsBomb Open Data / FIFA</span></footer>
    </main>
  </div>;
}
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, Check, ChevronDown, CircleAlert, Database, LoaderCircle, Search, SlidersHorizontal } from "lucide-react";
import { EVIDENCE, METRICS, type Evidence, type Language, type Metric } from "./labels";

type Player = {
  player_id: number; display_name: string; team: string; position: string; age: number | null;
  minutes: number; per90: number | null; percentile: number | null; total: number | null;
  metric: Metric | null; peer_count: number; evidence_status: Evidence; explanation: string;
  reference_date: string; age_band: string | null;
};
type SearchResult = {
  status: "ok"; interpretation: { min_age: number | null; max_age: number | null; position: string | null;
    team: string | null; metric: Metric | null; sort_by: "minutes" | "per90" | "percentile";
    min_per90: number | null; min_percentile: number | null; limit: number };
  effective_min_minutes: number; default_minutes_applied: boolean; total_matches: number; returned: number;
  dataset: { matches: number; active_players: number; reference_date: string; start_date: string; end_date: string };
  players: Player[]; notice: string;
};
type Clarification = { status: "needs_clarification"; message: string; examples: string[] };
type ResponseData = SearchResult | Clarification;

const DEFAULT_QUERY = {
  en: "Find wingers aged 23 or younger with at least 180 minutes sorted by successful dribbles per 90",
  es: "Busca extremos hasta 23 anos con al menos 180 minutos ordenados por regates por 90",
};
const COPY = {
  en: {
    search: "Player search", workspace: "SCOUTING WORKSPACE", title: "Find the evidence.",
    query: "Search request", submit: "Search", searching: "Searching", examples: "Search examples",
    results: "Results", matches: "matches", players: "players with minutes", dataset: "DATASET",
    tournament: "World Cup 2022", historical: "Historical sample", source: "Event data", births: "Birth dates",
    sourceValue: "StatsBomb Open Data", birthsValue: "FIFA squad lists", language: "Language",
    interpretation: "Interpreted request", allAges: "All ages", allPositions: "All positions", allTeams: "All national teams",
    age: "Age", minutes: "Minutes", player: "Player", position: "Position", team: "National team",
    percentile: "Percentile", evidence: "Evidence", per90: "Per 90", sort: "Order", limit: "Limit",
    default: "default", matched: "matching players", showing: "Showing", of: "of", details: "Calculation",
    clarification: "Clarification needed", error: "Search unavailable. Check that the API and dataset are available, then retry.",
    noResults: "No players match these conditions.", noResultsSub: "No constraints were relaxed.",
    retry: "Retry", sample: "Sample evidence, not a prediction", asOf: "Ages on", peers: "Qualified peers",
    cohort: "Cohort", minimum: "Minimum", unavailable: "Unavailable", finished: "Search complete",
    presets: ["Wingers / dribbles", "Strikers / expected goals", "France / key passes"],
    queries: [DEFAULT_QUERY.en, "Find strikers aged 23 or younger sorted by npxg", "Find players from France sorted by key passes"],
  },
  es: {
    search: "Buscar jugadores", workspace: "ESPACIO DE SCOUTING", title: "Encuentra la evidencia.",
    query: "Solicitud de busqueda", submit: "Buscar", searching: "Buscando", examples: "Ejemplos de busqueda",
    results: "Resultados", matches: "partidos", players: "jugadores con minutos", dataset: "DATOS",
    tournament: "Mundial 2022", historical: "Muestra historica", source: "Datos de eventos", births: "Fechas de nacimiento",
    sourceValue: "StatsBomb Open Data", birthsValue: "Listas de FIFA", language: "Idioma",
    interpretation: "Solicitud interpretada", allAges: "Todas las edades", allPositions: "Todas las posiciones", allTeams: "Todas las selecciones",
    age: "Edad", minutes: "Minutos", player: "Jugador", position: "Posicion", team: "Seleccion",
    percentile: "Percentil", evidence: "Evidencia", per90: "Por 90", sort: "Orden", limit: "Limite",
    default: "por defecto", matched: "jugadores coincidentes", showing: "Mostrando", of: "de", details: "Calculo",
    clarification: "Se necesita aclaracion", error: "Busqueda no disponible. Comprueba la API y los datos, e intentalo de nuevo.",
    noResults: "Ningun jugador cumple estas condiciones.", noResultsSub: "No se relajaron los filtros.",
    retry: "Reintentar", sample: "Evidencia de la muestra, no una prediccion", asOf: "Edades al", peers: "Pares elegibles",
    cohort: "Grupo", minimum: "Minimo", unavailable: "No disponible", finished: "Busqueda completada",
    presets: ["Extremos / regates", "Delanteros / goles esperados", "Francia / pases clave"],
    queries: [DEFAULT_QUERY.es, "Busca delanteros hasta 23 anos ordenados por npxg", "Busca jugadores de Francia ordenados por pases clave"],
  },
};

async function requestSearch(query: string, lang: Language, signal: AbortSignal): Promise<ResponseData> {
  const response = await fetch("/api/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, lang }), signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  });
  if (!response.ok) throw new Error("Search failed");
  return response.json();
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("en");
  const [query, setQuery] = useState(DEFAULT_QUERY.en);
  const [submitted, setSubmitted] = useState(DEFAULT_QUERY.en);
  const [result, setResult] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const active = useRef<AbortController | null>(null);
  const text = COPY[language];

  async function performSearch(request: string, lang: Language) {
    window.history.replaceState(null, "", `/?${new URLSearchParams({ q: request, lang })}`);
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    try {
      const data = await requestSearch(request, lang, controller.signal);
      if (!controller.signal.aborted) setResult(data);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function prepareSearch(request: string) {
    setSubmitted(request);
    setLoading(true);
    setFailed(false);
    setResult(null);
    setExpanded(null);
  }

  function startSearch(request: string) {
    prepareSearch(request);
    void performSearch(request, language);
  }

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const initialLanguage = parameters.get("lang") === "es" ? "es" : "en";
    const initialQuery = parameters.get("q") || DEFAULT_QUERY[initialLanguage];
    const controller = new AbortController();
    active.current = controller;
    requestSearch(initialQuery, initialLanguage, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult(data); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLanguage(initialLanguage);
          setQuery(initialQuery);
          setSubmitted(initialQuery);
          setLoading(false);
        }
      });
    return () => active.current?.abort();
  }, []);

  const data = result?.status === "ok" ? result : null;
  const plan = data?.interpretation;
  const format = (value: number | null, digits = 1) => value === null ? "--" : new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);
  const sortName = plan?.sort_by === "minutes" ? text.minutes : plan?.sort_by === "percentile" ? text.percentile : text.per90;

  return <div className="app-shell">
    <header className="topbar">
      <Link href="/" className="brand" aria-label="Cantera IQ"><span className="brand-mark">C<span>IQ</span></span><span>Cantera <b>IQ</b></span></Link>
      <span className="workspace-label">{text.workspace}</span>
      <div className="languages" role="group" aria-label={text.language}>
        {(["en", "es"] as const).map(lang => <button key={lang} type="button" aria-pressed={language === lang}
          onClick={() => { if (lang !== language) { prepareSearch(DEFAULT_QUERY[lang]); setQuery(DEFAULT_QUERY[lang]); setLanguage(lang); void performSearch(DEFAULT_QUERY[lang], lang); } }}> {lang.toUpperCase()} </button>)}
      </div>
    </header>

    <aside className="sidebar">
      <div className="current-view"><Search size={18} />{text.search}<ArrowRight size={16} /></div>
      <section className="dataset">
        <div className="eyebrow"><Database size={14} />{text.dataset}</div>
        <div className="pitch-photo" role="img" aria-label={language === "en" ? "Football pitch" : "Campo de futbol"} />
        <h2>{text.tournament}</h2>
        <span className="sample-tag">{text.historical}</span>
        <dl className="source-list">
          <div><dt>{text.source}</dt><dd><a href="https://github.com/statsbomb/open-data" target="_blank" rel="noreferrer">{text.sourceValue}</a></dd></div>
          <div><dt>{text.births}</dt><dd><a href="https://fdp.fifa.org/assetspublic/ce44/pdf/SquadLists-English.pdf" target="_blank" rel="noreferrer">{text.birthsValue}</a></dd></div>
          {data && <><div><dt>{text.matches}</dt><dd>{format(data.dataset.matches, 0)}</dd></div>
            <div><dt>{text.players}</dt><dd>{format(data.dataset.active_players, 0)}</dd></div>
            <div><dt>{text.asOf}</dt><dd>{data.dataset.reference_date}</dd></div></>}
        </dl>
      </section>
      <p className="sidebar-note"><CircleAlert size={16} />{text.sample}</p>
    </aside>

    <main>
      <div className="page-heading"><div><p className="eyebrow">{text.search}</p><h1>{text.title}</h1></div><span className="edition">CQ / 02</span></div>
      <form className="search-form" onSubmit={event => { event.preventDefault(); startSearch(query); }}>
        <label htmlFor="query">{text.query}</label>
        <div className="query-input"><Search size={20} aria-hidden="true" />
          <textarea id="query" value={query} maxLength={500} required rows={2} onChange={event => setQuery(event.target.value)} />
          <button type="submit" className="primary" disabled={loading || !query.trim()}>
            {loading ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}{loading ? text.searching : text.submit}
          </button>
        </div>
        <div className="query-options"><label htmlFor="examples">{text.examples}</label><select id="examples" value="" onChange={event => setQuery(event.target.value)}>
          <option value="" disabled>{text.examples}</option>{text.queries.map((example, index) => <option value={example} key={example}>{text.presets[index]}</option>)}
        </select><span>{query.length}/500</span></div>
      </form>

      <div className="status-announcement" role="status" aria-live="polite">{loading ? text.searching : failed ? text.error : result?.status === "needs_clarification" ? text.clarification : text.finished}</div>
      {loading && <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>{text.searching}...</span></div>}
      {failed && <div className="message error" role="alert"><CircleAlert size={22} /><div><p>{text.error}</p><button className="text-button" onClick={() => startSearch(submitted)}>{text.retry}<ArrowRight size={16} /></button></div></div>}
      {result?.status === "needs_clarification" && <section className="message"><CircleAlert size={24} /><div><h2>{text.clarification}</h2><p>{result.message}</p>
        <ul className="clarification-examples">{result.examples.map(example => <li key={example}><button className="text-button" onClick={() => setQuery(example)}>{example}<ArrowRight size={16} /></button></li>)}</ul>
      </div></section>}

      {data && plan && <>
        <section className="interpretation" aria-label={text.interpretation}>
          <h2><SlidersHorizontal size={16} />{text.interpretation}</h2>
          <p className="submitted-query">{submitted}</p>
          <dl className="filters">
            <div><dt>{text.position}</dt><dd>{plan.position || text.allPositions}</dd></div>
            <div><dt>{text.age}</dt><dd>{plan.min_age !== null ? `${plan.min_age} - ${plan.max_age}` : plan.max_age !== null ? `<= ${plan.max_age}` : text.allAges}</dd></div>
            <div><dt>{text.team}</dt><dd>{plan.team || text.allTeams}</dd></div>
            <div><dt>{text.minutes}</dt><dd>&gt;= {format(data.effective_min_minutes, 0)}{data.default_minutes_applied && <small> ({text.default})</small>}</dd></div>
            <div><dt>{text.sort}</dt><dd>{plan.metric && `${METRICS[language][plan.metric]} / `}{sortName}<ArrowDown size={13} /></dd></div>
            <div><dt>{text.limit}</dt><dd>{plan.limit}</dd></div>
            {plan.min_per90 !== null && <div><dt>{text.minimum} / {text.per90}</dt><dd>{plan.min_per90}</dd></div>}
            {plan.min_percentile !== null && <div><dt>{text.minimum} / {text.percentile}</dt><dd>{plan.min_percentile}</dd></div>}
          </dl>
        </section>
        <section className="results" aria-label={text.results}>
          <div className="results-heading"><h2>{text.results}<span>{data.total_matches}</span></h2><p>{text.showing} {data.returned} {text.of} {data.total_matches}</p></div>
          {data.players.length === 0 ? <div className="empty-state"><Search size={28} /><h3>{text.noResults}</h3><p>{text.noResultsSub}</p></div> :
            <div className="table-scroll" tabIndex={0} role="region" aria-label={text.results}>
              <table><thead><tr><th>#</th><th>{text.player}</th><th>{text.age}</th><th>{text.position}</th><th>{text.minutes}</th>
                <th className={plan.sort_by === "per90" ? "sorted" : ""}>{text.per90}</th><th className={plan.sort_by === "percentile" ? "sorted" : ""}>{text.percentile}</th><th>{text.evidence}</th><th><span className="sr-only">{text.details}</span></th></tr></thead>
                <tbody>{data.players.map((player, index) => <PlayerRows key={player.player_id} player={player} index={index} language={language} format={format} query={submitted}
                  expanded={expanded === player.player_id} toggle={() => setExpanded(expanded === player.player_id ? null : player.player_id)} />)}</tbody>
              </table>
            </div>}
          <p className="data-notice"><CircleAlert size={16} />{data.notice}</p>
        </section>
      </>}
      <footer><span>Cantera IQ</span><span>StatsBomb Open Data / FIFA</span></footer>
    </main>
  </div>;
}

function PlayerRows({ player, index, language, format, expanded, toggle, query }: {
  player: Player; index: number; language: Language; format: (value: number | null, digits?: number) => string;
  expanded: boolean; toggle: () => void; query: string;
}) {
  const text = COPY[language];
  return <><tr className={expanded ? "expanded" : ""}>
    <td className="row-number">{String(index + 1).padStart(2, "0")}</td><td><Link className="player-link" href={`/players/${player.player_id}?${new URLSearchParams({ lang: language, q: query })}`}><strong>{player.display_name}</strong></Link><span className="team-name">{player.team}</span></td>
    <td>{format(player.age, 0)}</td><td><span className="position">{player.position}</span></td><td>{format(player.minutes)}</td>
    <td className="metric-value">{format(player.per90, 2)}</td><td><div className="percentile-value" title={player.percentile === null ? text.unavailable : `${player.peer_count} ${text.peers}`}>
      <span>{format(player.percentile, 0)}</span>{player.percentile !== null && <span className="percentile-track"><span style={{ width: `${player.percentile}%` }} /></span>}
    </div></td><td><span className={`evidence ${player.evidence_status === "moderate_sample" ? "moderate" : "limited"}`}>
      {player.evidence_status === "moderate_sample" ? <Check size={13} /> : <CircleAlert size={13} />}{EVIDENCE[language][player.evidence_status]}</span></td>
    <td><button className="icon-button" title={`${text.details}: ${player.display_name}`} aria-label={`${text.details}: ${player.display_name}`} aria-expanded={expanded} aria-controls={`calculation-${player.player_id}`} onClick={toggle}><ChevronDown size={18} className={expanded ? "rotate" : ""} /></button></td>
  </tr>{expanded && <tr className="detail-row" id={`calculation-${player.player_id}`}><td colSpan={9}><div className="calculation"><h3>{text.details}</h3><p>{player.explanation}</p>
    <dl><div><dt>{text.cohort}</dt><dd>{player.position} / {player.age_band || "--"}</dd></div><div><dt>{text.peers}</dt><dd>{player.peer_count}</dd></div><div><dt>{text.evidence}</dt><dd>{EVIDENCE[language][player.evidence_status]}</dd></div></dl>
  </div></td></tr>}</>;
}

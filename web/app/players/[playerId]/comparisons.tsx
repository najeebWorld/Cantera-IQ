"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import { EVIDENCE, METRICS, type Evidence, type Language, type Metric } from "../../labels";

type Snapshot = {
  player_id: number; display_name: string; age: number | null; position: string | null;
  team: string; minutes: number; appearances: number; reference_date: string;
  metrics: { metric: Metric; total: number; per90: number | null; percentile: number | null; evidence_status: Evidence }[];
};
type BaseResponse = { status: "available" | "unavailable"; explanation: string | null; methodology: string };
type Similarity = BaseResponse & {
  candidate_count: number; player: Snapshot;
  comparisons: { player: Snapshot; distance: number; differences: { metric: Metric; source_per90: number;
    candidate_per90: number; source_percentile: number; candidate_percentile: number; difference: number }[] }[];
};
type History = BaseResponse & { current?: Snapshot; historical: Snapshot | null };

const COPY = {
  en: {
    similar: "Similar players", history: "Historical snapshots", loading: "Loading comparisons", error: "Comparison data unavailable",
    retry: "Retry", distance: "Distance (percentile points)", candidates: "eligible candidates", detail: "Metric comparison",
    metric: "Metric", source: "This player", candidate: "Comparison player", gap: "Absolute gap", per90: "Per 90",
    percentile: "Percentile", minutes: "Minutes", age: "Age at tournament start", position: "Primary position",
    team: "National team", appearances: "Appearances", total: "Total", delta: "Change per 90", born: "Age reference date",
    evidence: "Sample evidence", unavailable: "Historical percentiles unavailable: incomplete birth-date coverage.",
    years: "World Cup 2018 / 2022", qualified: "Both periods meet the minimum minutes threshold.",
  },
  es: {
    similar: "Jugadores similares", history: "Muestras historicas", loading: "Cargando comparaciones", error: "Comparaciones no disponibles",
    retry: "Reintentar", distance: "Distancia (puntos percentiles)", candidates: "candidatos elegibles", detail: "Comparacion de metricas",
    metric: "Metrica", source: "Este jugador", candidate: "Jugador comparado", gap: "Diferencia absoluta", per90: "Por 90",
    percentile: "Percentil", minutes: "Minutos", age: "Edad al inicio del torneo", position: "Posicion principal",
    team: "Seleccion", appearances: "Partidos jugados", total: "Total", delta: "Cambio por 90", born: "Fecha de referencia de edad",
    evidence: "Evidencia de muestra", unavailable: "Percentiles historicos no disponibles: cobertura incompleta de fechas de nacimiento.",
    years: "Mundial 2018 / 2022", qualified: "Ambos periodos cumplen el minimo de minutos.",
  },
};

function ComparisonSection({ playerId, language, searchQuery, kind }: {
  playerId: string; language: Language; searchQuery: string; kind: "similar" | "history";
}) {
  const [response, setResponse] = useState<Similarity | History | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const text = COPY[language];
  const format = (value: number | null, digits = 2) => value === null ? "--" : new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/players/${playerId}/${kind}?lang=${language}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) })
      .then(async result => {
        if (!result.ok) throw new Error("Comparison unavailable");
        const payload: Similarity | History = await result.json();
        if (!controller.signal.aborted) setResponse(payload);
      }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [playerId, language, kind, attempt]);
  const similar = kind === "similar" ? response as Similarity | null : null;
  const history = kind === "history" ? response as History | null : null;
  const previous = history?.historical;
  const current = history?.current;
  return <section className="comparison-section" aria-label={text[kind]}>
    <div className="section-heading"><h2>{text[kind]}</h2><span className="scale-label">{kind === "history" ? text.years : "2022"}</span></div>
    {!response && !error && <p role="status" className="data-notice"><LoaderCircle className="spin" size={16} />{text.loading}</p>}
    {error && <div role="alert"><p className="profile-warning"><CircleAlert size={16} />{text.error}</p>
      <button className="text-button" onClick={() => { setError(false); setResponse(null); setAttempt(attempt + 1); }}><RefreshCw size={16} />{text.retry}</button></div>}
    {response?.explanation && <p role="status" className="profile-warning"><CircleAlert size={16} />{response.explanation}</p>}
    {similar && similar.status === "available" && <>
      <p className="subtle-note">{similar.candidate_count} {text.candidates}</p>
      <ol className="similarity-list">{similar.comparisons.map(comparison => <li key={comparison.player.player_id}>
        <div className="similarity-heading"><div><Link className="player-link" href={`/players/${comparison.player.player_id}?${new URLSearchParams({ lang: language, ...(searchQuery ? { q: searchQuery } : {}) })}`}>
          {comparison.player.display_name}<ArrowUpRight size={15} /></Link><span className="team-name">{comparison.player.team} / {comparison.player.position} / {format(comparison.player.minutes, 1)} {text.minutes.toLowerCase()}</span></div>
          <div className="distance-value"><span>{text.distance}</span><strong>{format(comparison.distance)}</strong></div></div>
        <p className="subtle-note">{text.evidence}: {EVIDENCE[language][comparison.player.metrics[0].evidence_status]}</p>
        <details><summary>{text.detail}</summary><div className="table-scroll" tabIndex={0} role="region" aria-label={`${text.detail}: ${comparison.player.display_name}`}>
          <table className="comparison-table"><thead><tr><th>{text.metric}</th><th>{text.source}<br />{text.per90} / {text.percentile}</th><th>{text.candidate}<br />{text.per90} / {text.percentile}</th><th>{text.gap}</th></tr></thead>
            <tbody>{comparison.differences.map(metric => <tr key={metric.metric}><td>{METRICS[language][metric.metric]}</td>
              <td>{format(metric.source_per90)} / {format(metric.source_percentile, 1)}</td><td>{format(metric.candidate_per90)} / {format(metric.candidate_percentile, 1)}</td><td>{format(metric.difference, 1)}</td></tr>)}</tbody></table>
        </div></details>
      </li>)}</ol>
    </>}
    {history && previous && current && <>
      <div className="snapshot-grid">{[previous, current].map((snapshot, index) => <div key={index}>
        <h3>{index === 0 ? "2018" : "2022"}</h3><dl className="profile-facts">
          <div><dt>{text.team}</dt><dd>{snapshot.team}</dd></div><div><dt>{text.age}</dt><dd>{format(snapshot.age, 0)}</dd></div>
          <div><dt>{text.position}</dt><dd>{snapshot.position || "--"}</dd></div><div><dt>{text.minutes}</dt><dd>{format(snapshot.minutes, 1)}</dd></div>
          <div><dt>{text.appearances}</dt><dd>{snapshot.appearances}</dd></div><div><dt>{text.born}</dt><dd>{snapshot.reference_date}</dd></div>
        </dl></div>)}</div>
      {history.status === "available" && <>
        <p className="subtle-note">{text.qualified}</p>
        <div className="table-scroll" tabIndex={0} role="region" aria-label={text.history}><table className="comparison-table history-table">
          <thead><tr><th>{text.metric}</th><th>2018<br />{text.total} / {text.per90}</th><th>2022<br />{text.total} / {text.per90}</th><th>{text.delta}</th></tr></thead>
          <tbody>{previous.metrics.map(metric => {
            const latest = current.metrics.find(item => item.metric === metric.metric);
            const delta = metric.per90 !== null && latest?.per90 != null ? latest.per90 - metric.per90 : null;
            return <tr key={metric.metric} data-history-metric={metric.metric}><td>{METRICS[language][metric.metric]}</td><td>{format(metric.total)} / {format(metric.per90)}</td>
              <td>{latest ? `${format(latest.total)} / ${format(latest.per90)}` : "--"}</td><td>{delta !== null && delta > 0 ? "+" : ""}{format(delta)}</td></tr>;
          })}</tbody>
        </table></div>
      </>}
      <p className="profile-warning"><CircleAlert size={16} />{text.unavailable}</p>
    </>}
    {response && <p className="data-notice">{response.methodology}</p>}
  </section>;
}

export default function PlayerComparisons(props: { playerId: string; language: Language; searchQuery: string }) {
  return <><ComparisonSection key={`${props.playerId}-${props.language}-similar`} {...props} kind="similar" />
    <ComparisonSection key={`${props.playerId}-${props.language}-history`} {...props} kind="history" /></>;
}
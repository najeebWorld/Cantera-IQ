"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Language, Metric } from "../labels";

export type Club = { team_id: number; name: string; players: number; matches: number };
export type Weights = Record<string, Record<Metric, number>>;
export type Preferences = { club: Club; club_id: number; saved: boolean; revision: number; weights: Weights; positions: string[]; metrics: Metric[] };
export const CLUB_COPY = {
  en: { clubs: "Clubs", search: "Player search", squad: "Observed squad", settings: "Club preferences", player: "Player", position: "Position", minutes: "Minutes", appearances: "Appearances", age: "Age", unavailable: "Not available", total: "Total", per90: "Per 90", all: "All positions", filter: "Filter players", loading: "Loading", error: "Club data unavailable", notFound: "Record not found", retry: "Retry", back: "Back to club", sources: "Source match records", definitions: "Definitions & calculations", save: "Save preferences", reset: "Reset draft", saved: "Preferences saved", unsaved: "Unsaved changes", neutral: "Neutral defaults, not saved", discard: "Discard unsaved changes?", weight: "Weight", share: "Effective share", invalid: "Every position needs a positive total; weights must be between 0 and 100.", conflict: "Preferences changed elsewhere. Reload before saving.", reload: "Reload preferences", saving: "Saving", note: "User-configured weights, not this club's real tactics. Historical age-cohort scores remain unavailable. A separate World Cup 2022 profile can apply saved preferences.", fit: "Club preference index", choose: "Select a club", revision: "Revision", contribution: "Contribution", metric: "Metric", percentile: "Percentile", view: "Club squad & preferences", noResults: "No players match these filters.", goalkeeper: "General event metrics only; goalkeeper-specific evaluation is unavailable." },
  es: { clubs: "Clubes", search: "Buscar jugadores", squad: "Plantilla observada", settings: "Preferencias del club", player: "Jugador", position: "Posicion", minutes: "Minutos", appearances: "Partidos jugados", age: "Edad", unavailable: "No disponible", total: "Total", per90: "Por 90", all: "Todas las posiciones", filter: "Filtrar jugadores", loading: "Cargando", error: "Datos del club no disponibles", notFound: "Registro no encontrado", retry: "Reintentar", back: "Volver al club", sources: "Registros de partidos fuente", definitions: "Definiciones y calculos", save: "Guardar preferencias", reset: "Restablecer borrador", saved: "Preferencias guardadas", unsaved: "Cambios sin guardar", neutral: "Valores neutrales, sin guardar", discard: "Descartar cambios sin guardar?", weight: "Peso", share: "Proporcion efectiva", invalid: "Cada posicion necesita un total positivo; pesos entre 0 y 100.", conflict: "Preferencias modificadas en otra ventana. Recarga antes de guardar.", reload: "Recargar preferencias", saving: "Guardando", note: "Pesos del usuario, no tacticas reales del club. Indices historicos por edad no disponibles. Un perfil separado del Mundial 2022 puede aplicar las preferencias guardadas.", fit: "Indice de preferencia del club", choose: "Selecciona un club", revision: "Revision", contribution: "Contribucion", metric: "Metrica", percentile: "Percentil", view: "Plantilla y preferencias", noResults: "Ningun jugador coincide con los filtros.", goalkeeper: "Solo metricas generales; evaluacion especifica de porteros no disponible." },
};

export function useClubData<Data>(url: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: Data; error?: number }>({ key: "" });
  const key = `${url}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]), cache: "no-store" })
      .then(async response => {
        if (!response.ok) { if (!controller.signal.aborted) setResult({ key, error: response.status }); return; }
        const data: Data = await response.json();
        if (!controller.signal.aborted) setResult({ key, data });
      }).catch(() => { if (!controller.signal.aborted) setResult({ key, error: 503 }); });
    return () => controller.abort();
  }, [url, key]);
  return { data: result.key === key ? result.data : undefined, error: result.key === key ? result.error : undefined,
    retry: () => setAttempt(attempt + 1) };
}

export function ClubStatus({ error, language, retry }: { error?: number; language: Language; retry: () => void }) {
  const text = CLUB_COPY[language];
  return <div className="data-notice" role={error ? "alert" : "status"}>
    {error ? error === 404 ? text.notFound : text.error : `${text.loading}...`}
    {error && error !== 404 && <button className="text-button" onClick={retry}><RefreshCw size={16} />{text.retry}</button>}
  </div>;
}
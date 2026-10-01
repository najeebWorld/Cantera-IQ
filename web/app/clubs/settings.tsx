"use client";

import { useEffect, useState } from "react";
import { RefreshCw, RotateCcw, Save } from "lucide-react";
import { METRICS, type Language, type Metric } from "../labels";
import { CLUB_COPY, ClubStatus, useClubData, type Preferences, type Weights } from "./shared";

export default function ClubSettings({ clubId, language, onDirty }: { clubId: string; language: Language; onDirty: (dirty: boolean) => void }) {
  const resource = useClubData<Preferences>(`/api/clubs/${clubId}/profile`);
  return resource.data ? <Editor key={`${clubId}:${resource.data.revision}`} initial={resource.data} language={language} onDirty={onDirty} reload={resource.retry} /> :
    <ClubStatus error={resource.error} language={language} retry={resource.retry} />;
}

function Editor({ initial, language, onDirty, reload }: { initial: Preferences; language: Language; onDirty: (dirty: boolean) => void; reload: () => void }) {
  const [saved, setSaved] = useState(initial);
  const [weights, setWeights] = useState<Weights>(initial.weights);
  const [position, setPosition] = useState(initial.positions[0]);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error" | "conflict">("idle");
  const text = CLUB_COPY[language];
  const dirty = JSON.stringify(weights) !== JSON.stringify(saved.weights);
  const invalid = Object.values(weights).some(metrics => Object.values(metrics).some(value => !Number.isFinite(value) || value < 0 || value > 100) || Object.values(metrics).reduce((sum, value) => sum + value, 0) <= 0);
  const total = Object.values(weights[position]).reduce((sum, value) => sum + value, 0);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  function change(metric: Metric, value: string) {
    setWeights({ ...weights, [position]: { ...weights[position], [metric]: value === "" ? NaN : Number(value) } });
    setState("idle");
  }
  async function save() {
    if (invalid || state === "saving") return;
    setState("saving");
    try {
      const response = await fetch(`/api/clubs/${initial.club_id}/profile`, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: saved.revision, weights }), signal: AbortSignal.timeout(30000) });
      if (response.status === 409) { setState("conflict"); return; }
      if (!response.ok) throw new Error("Save failed");
      const profile: Preferences = await response.json();
      setSaved(profile); setWeights(profile.weights); setState("saved");
    } catch { setState("error"); }
  }
  return <section className="club-settings" aria-label={text.settings}>
    <div className="section-heading"><h2>{text.settings}</h2><span>{text.revision} {saved.revision}</span></div>
    <p className="data-notice">{text.note}</p>
    <label className="club-field">{text.position}<select value={position} onChange={event => setPosition(event.target.value)}>{initial.positions.map(item => <option key={item}>{item}</option>)}</select></label>
    <div className="weight-list">{initial.metrics.map(metric => <div className="weight-row" key={metric}>
      <label htmlFor={`weight-${metric}`}>{METRICS[language][metric]}</label>
      <input id={`weight-${metric}`} type="number" min="0" max="100" step="any" disabled={state === "saving"} value={Number.isFinite(weights[position][metric]) ? weights[position][metric] : ""} onChange={event => change(metric, event.target.value)} aria-label={`${METRICS[language][metric]} ${text.weight}`} />
      <div className="weight-share"><meter min={0} max={100} value={total > 0 ? weights[position][metric] / total * 100 : 0} aria-label={`${METRICS[language][metric]} ${text.share}`} /><span>{total > 0 ? (weights[position][metric] / total * 100).toFixed(1) : "--"}%</span></div>
    </div>)}</div>
    {invalid && <p role="alert" className="profile-warning">{text.invalid}</p>}
    <div className="club-actions"><button className="text-button" disabled={invalid || state === "saving" || state === "conflict"} onClick={save}><Save size={16} />{state === "saving" ? text.saving : text.save}</button>
      <button className="text-button" disabled={state === "saving"} onClick={() => { setWeights(Object.fromEntries(initial.positions.map(item => [item, Object.fromEntries(initial.metrics.map(metric => [metric, 1]))])) as Weights); setState("idle"); }}><RotateCcw size={16} />{text.reset}</button>
      <button className="text-button" disabled={state === "saving"} onClick={() => { if (!dirty || window.confirm(text.discard)) { onDirty(false); reload(); } }}><RefreshCw size={16} />{text.reload}</button></div>
    <p role={state === "error" || state === "conflict" ? "alert" : "status"}>{state === "conflict" ? text.conflict : state === "error" ? text.error : dirty ? text.unsaved : state === "saved" ? text.saved : !saved.saved ? text.neutral : ""}</p>
  </section>;
}
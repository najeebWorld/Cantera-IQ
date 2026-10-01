"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { METRICS, type Language, type Metric } from "../labels";
import { CLUB_COPY, ClubStatus, useClubData, type Club } from "./shared";

export type Fit = { club: Club; score: number | null; revision: number; position: string; explanation: string | null; methodology: string;
  contributions: { metric: Metric; weight: number; share: number; percentile: number | null; contribution: number }[] };

export default function ClubFit({ playerId, language, searchQuery }: { playerId: string; language: Language; searchQuery: string }) {
  const [clubId, setClubId] = useState("");
  const resource = useClubData<{ clubs: Club[] }>(`/api/clubs?lang=${language}`);
  const text = CLUB_COPY[language];
  return <section className="club-fit" aria-label={text.fit}><h2>{text.fit}</h2>
    {!resource.data ? <ClubStatus error={resource.error} language={language} retry={resource.retry} /> : <>
      <label className="club-field">{text.choose}<select value={clubId} onChange={event => setClubId(event.target.value)}><option value="">{text.choose}</option>{resource.data.clubs.map(club => <option key={club.team_id} value={club.team_id}>{club.name}</option>)}</select></label>
      {clubId && <FitDetails key={`${playerId}:${clubId}:${language}`} playerId={playerId} clubId={clubId} language={language} searchQuery={searchQuery} />}
    </>}
  </section>;
}

function FitDetails({ playerId, clubId, language, searchQuery }: { playerId: string; clubId: string; language: Language; searchQuery: string }) {
  const resource = useClubData<Fit>(`/api/players/${playerId}/club-fit?club_id=${clubId}&lang=${language}`);
  const text = CLUB_COPY[language];
  const data = resource.data;
  const format = (value: number | null) => value === null ? "--" : new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);
  if (!data) return <ClubStatus error={resource.error} language={language} retry={resource.retry} />;
  return <><div className="section-heading"><h3>{data.club.name} / {data.position} / World Cup 2022</h3><button className="text-button" onClick={resource.retry} title={text.reload} aria-label={text.reload}><RefreshCw size={16} /></button></div>
    <p className="profile-warning">{data.methodology}</p>
    <p role="status">{data.explanation || `${text.fit}: ${format(data.score)} / 100`} · {text.revision} {data.revision}</p>
    {data.score !== null && <div className="table-scroll" role="region" aria-label={text.contribution} tabIndex={0}><table className="comparison-table"><thead><tr><th>{text.metric}</th><th>{text.weight}</th><th>{text.share}</th><th>{text.percentile}</th><th>{text.contribution}</th></tr></thead><tbody>{data.contributions.map(item => <tr key={item.metric}><td>{METRICS[language][item.metric]}</td><td>{item.weight}</td><td>{format(item.share * 100)}%</td><td>{format(item.percentile)}</td><td>{format(item.contribution)}</td></tr>)}</tbody></table></div>}
    <Link className="back-link" href={`/clubs/${clubId}?${new URLSearchParams({ lang: language, ...(searchQuery ? { q: searchQuery } : {}) })}`}>{text.view}<ArrowUpRight size={16} /></Link>
  </>;
}
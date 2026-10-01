"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Shield } from "lucide-react";
import { METRICS, type Language, type Metric } from "../labels";
import ClubSettings from "./settings";
import { CLUB_COPY, ClubStatus, useClubData, type Club } from "./shared";

type Player = { player_id: number; display_name: string; position: string | null; age: null; minutes: number; appearances: number;
  metrics: { metric: Metric; total: number; per90: number | null; definition?: string }[];
  observations?: { match_id: number; match_date: string; home_team: string; away_team: string; shirt_number: number; source_url: string; source_revision: string; event_sha256: string }[] };
type Payload = { clubs?: Club[]; club?: Club; players?: Player[]; player?: Player; evidence: string;
  dataset: { competition: string; season: string; start_date: string; end_date: string; matches: number; sources: number } };

export default function ClubWorkspace({ clubId, playerId, initialLanguage, searchQuery }: { clubId?: string; playerId?: string; initialLanguage: Language; searchQuery: string }) {
  const [language, setLanguage] = useState(initialLanguage);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [mode, setMode] = useState<"total" | "per90">("per90");
  const [dirty, setDirty] = useState(false);
  const text = CLUB_COPY[language];
  const path = `/clubs${clubId ? `/${clubId}` : ""}${playerId ? `/players/${playerId}` : ""}`;
  const resource = useClubData<Payload>(`/api${path}${clubId && !playerId ? "/players" : ""}?lang=${language}`);
  const data = resource.data;
  const context = new URLSearchParams({ lang: language, ...(searchQuery ? { q: searchQuery } : {}) }).toString();
  const href = (target: string) => `${target}?${context}`;
  const format = (value: number | null) => value === null ? "--" : new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  function allowNavigation() { return !dirty || window.confirm(text.discard); }
  const players = data?.players?.filter(player => (!position || player.position === position) && player.display_name.toLocaleLowerCase(language).includes(name.toLocaleLowerCase(language))) || [];
  return <div className="profile-shell" onClickCapture={event => { if ((event.target as HTMLElement).closest("a") && !allowNavigation()) event.preventDefault(); }}>
    <header className="topbar"><Link className="brand" href={href("/")}><span className="brand-mark">C<span>IQ</span></span><span>Cantera <b>IQ</b></span></Link><span className="workspace-label">{text.clubs}</span>
      <div className="languages" role="group" aria-label={language === "en" ? "Language" : "Idioma"}>{(["en", "es"] as const).map(lang => <button key={lang} aria-pressed={language === lang} onClick={() => { if (lang === language || !allowNavigation()) return; setDirty(false); setLanguage(lang); window.history.replaceState(null, "", `${path}?${new URLSearchParams({ lang, ...(searchQuery ? { q: searchQuery } : {}) })}`); }}>{lang.toUpperCase()}</button>)}</div></header>
    <main className="profile-main club-main"><nav className="club-navigation"><Link className="back-link" href={href("/")}><ArrowLeft size={16} />{text.search}</Link>{clubId && <Link className="back-link" href={href(playerId ? `/clubs/${clubId}` : "/clubs")}>{playerId ? text.back : text.clubs}</Link>}</nav>
      {!data ? <ClubStatus error={resource.error} language={language} retry={resource.retry} /> : <>
        <section className="player-heading"><p className="eyebrow"><Shield size={14} />{data.dataset.competition} / {data.dataset.season}</p><h1>{data.player?.display_name || data.club?.name || text.clubs}</h1>
          {data.player && <p className="player-subtitle">{data.club?.name} / {data.player.position || "--"}</p>}
          <p className="player-subtitle">{data.dataset.start_date} / {data.dataset.end_date} · StatsBomb Open Data</p>
          <p className="profile-warning">{data.evidence}</p></section>
        {!clubId && <><div className="pitch-photo club-pitch" role="img" aria-label={language === "en" ? "Football pitch" : "Campo de futbol"} /><ul className="club-list">{data.clubs?.map(club => <li key={club.team_id}><Link href={href(`/clubs/${club.team_id}`)}><Shield size={20} /><span><strong>{club.name}</strong><small>{club.players} {text.squad.toLowerCase()} / {club.matches} {language === "en" ? "matches" : "partidos"}</small></span><ArrowUpRight size={18} /></Link></li>)}</ul></>}
        {clubId && !playerId && <>
          <section className="profile-metrics" aria-label={text.squad}><div className="section-heading"><h2>{text.squad}</h2><span>{players.length} / {data.players?.length}</span></div>
            <div className="club-filters"><label className="club-field">{text.filter}<input type="search" value={name} onChange={event => setName(event.target.value)} /></label><label className="club-field">{text.position}<select value={position} onChange={event => setPosition(event.target.value)}><option value="">{text.all}</option>{["GK", "CB", "FB", "DM", "CM", "AM", "W", "ST"].map(item => <option key={item}>{item}</option>)}</select></label>
              <div className="languages" role="group" aria-label={text.metric}>{(["total", "per90"] as const).map(item => <button key={item} aria-pressed={mode === item} onClick={() => setMode(item)}>{item === "total" ? text.total : text.per90}</button>)}</div></div>
            <div className="table-scroll" role="region" aria-label={text.squad} tabIndex={0}><table className="club-table"><thead><tr><th>{text.player}</th><th>{text.position}</th><th>{text.age}</th><th>{text.appearances}</th><th>{text.minutes}</th>{Object.entries(METRICS[language]).map(([metric, label]) => <th key={metric}>{label}<br />{mode === "total" ? text.total : text.per90}</th>)}</tr></thead>
              <tbody>{players.map(player => <tr key={player.player_id} data-player={player.player_id}><td><Link className="player-link" href={href(`/clubs/${clubId}/players/${player.player_id}`)}>{player.display_name}</Link></td><td>{player.position || "--"}</td><td><span title={text.unavailable}>--</span></td><td>{player.appearances}</td><td>{format(player.minutes)}</td>{Object.keys(METRICS[language]).map(metric => <td key={metric} data-metric={metric}>{format(player.metrics.find(item => item.metric === metric)?.[mode] ?? null)}</td>)}</tr>)}</tbody></table></div>
            {!players.length && <p role="status">{text.noResults}</p>}</section>
          <ClubSettings clubId={clubId} language={language} onDirty={setDirty} />
        </>}
        {data.player && <>
          <dl className="player-stats"><div><dt>{text.minutes}</dt><dd>{format(data.player.minutes)}</dd></div><div><dt>{text.appearances}</dt><dd>{data.player.appearances}</dd></div><div><dt>{text.age}</dt><dd>--</dd></div><div><dt>{text.fit}</dt><dd>--</dd></div></dl>
          {data.player.position === "GK" && <p className="profile-warning">{text.goalkeeper}</p>}
          <section className="profile-metrics"><h2>{text.definitions}</h2><div className="table-scroll" role="region" aria-label={text.definitions} tabIndex={0}><table className="club-detail-table"><thead><tr><th>{text.metric}</th><th>{text.total}</th><th>{text.per90}</th></tr></thead><tbody>{data.player.metrics.map(metric => <tr key={metric.metric} data-metric={metric.metric}><td><strong>{METRICS[language][metric.metric]}</strong><p>{metric.definition}</p><code>{metric.per90 === null ? text.unavailable : `${format(metric.total)} * 90 / ${format(data.player!.minutes)}`}</code></td><td>{format(metric.total)}</td><td>{format(metric.per90)}</td></tr>)}</tbody></table></div></section>
          <section className="profile-methodology"><h2>{text.sources}</h2><details><summary>{data.player.observations?.length} {text.sources.toLowerCase()}</summary><ul className="source-list">{data.player.observations?.map(match => <li key={match.match_id}><a href={match.source_url} target="_blank" rel="noreferrer">{match.match_date} / {match.home_team} - {match.away_team}<ArrowUpRight size={14} /></a><small>StatsBomb #{match.match_id} / #{match.shirt_number}</small><code>SHA-256: {match.event_sha256}</code><code>{match.source_revision}</code></li>)}</ul></details></section>
        </>}
      </>}
      <footer><span>Cantera IQ</span><a href="https://github.com/statsbomb/open-data">StatsBomb Open Data</a></footer>
    </main></div>;
}
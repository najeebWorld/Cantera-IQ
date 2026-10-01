import { notFound } from "next/navigation";
import PlayerProfile from "./profile";

export default async function PlayerPage({ params, searchParams }: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ lang?: string; q?: string }>;
}) {
  const { playerId } = await params;
  const { lang, q: query } = await searchParams;
  if (!/^\d+$/.test(playerId) || !Number.isSafeInteger(Number(playerId)) || Number(playerId) < 1) notFound();
  return <PlayerProfile playerId={playerId} initialLanguage={lang === "es" ? "es" : "en"} searchQuery={typeof query === "string" ? query.slice(0, 500) : ""} />;
}
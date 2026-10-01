import { notFound } from "next/navigation";
import PlayerReport from "./report";

export default async function ReportPage({ params, searchParams }: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ lang?: string; q?: string; club_id?: string }>;
}) {
  const { playerId } = await params;
  const { lang, q: query, club_id: clubId } = await searchParams;
  const validId = (value: string) => /^\d+$/.test(value) && BigInt(value) > 0 && BigInt(value) <= BigInt("9223372036854775807");
  if (!validId(playerId)) notFound();
  return <PlayerReport key={`${playerId}:${lang}:${clubId}`} playerId={playerId}
    language={lang === "es" ? "es" : "en"} searchQuery={typeof query === "string" ? query.slice(0, 500) : ""}
    initialClubId={typeof clubId === "string" ? clubId : ""} />;
}
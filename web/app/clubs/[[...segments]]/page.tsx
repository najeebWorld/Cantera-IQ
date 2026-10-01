import { notFound } from "next/navigation";
import ClubWorkspace from "../workspace";

export default async function Page({ params, searchParams }: {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<{ lang?: string; q?: string }>;
}) {
  const { segments = [] } = await params;
  const query = await searchParams;
  const validId = (value: string) => /^[1-9]\d*$/.test(value) && BigInt(value) <= BigInt("9223372036854775807");
  if (segments.length !== 0 && !(segments.length === 1 && validId(segments[0])) &&
      !(segments.length === 3 && validId(segments[0]) && segments[1] === "players" && validId(segments[2]))) notFound();
  return <ClubWorkspace key={segments.join("/")} clubId={segments[0]} playerId={segments[2]} initialLanguage={query.lang === "es" ? "es" : "en"} searchQuery={typeof query.q === "string" ? query.q.slice(0, 500) : ""} />;
}
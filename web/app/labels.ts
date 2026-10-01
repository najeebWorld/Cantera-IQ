export type Language = "en" | "es";
export type Metric = "shots" | "npxg" | "key_passes" | "completed_passes" | "successful_dribbles" | "tackles_won";
export type Evidence = "no_minutes" | "missing_birth_date" | "insufficient_minutes" | "insufficient_peers" | "limited_sample" | "moderate_sample";

export const METRICS: Record<Language, Record<Metric, string>> = {
  en: { shots: "Non-penalty shots", npxg: "Non-penalty xG", key_passes: "Key passes", completed_passes: "Completed passes", successful_dribbles: "Successful dribbles", tackles_won: "Tackles won" },
  es: { shots: "Tiros sin penalti", npxg: "xG sin penalti", key_passes: "Pases clave", completed_passes: "Pases completados", successful_dribbles: "Regates exitosos", tackles_won: "Entradas ganadas" },
};
export const EVIDENCE: Record<Language, Record<Evidence, string>> = {
  en: { no_minutes: "No minutes", missing_birth_date: "Age unavailable", insufficient_minutes: "Insufficient minutes", insufficient_peers: "Insufficient peers", limited_sample: "Limited sample", moderate_sample: "Moderate sample" },
  es: { no_minutes: "Sin minutos", missing_birth_date: "Edad no disponible", insufficient_minutes: "Minutos insuficientes", insufficient_peers: "Pares insuficientes", limited_sample: "Muestra limitada", moderate_sample: "Muestra moderada" },
};
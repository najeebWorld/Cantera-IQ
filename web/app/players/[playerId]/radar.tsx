"use client";

import { Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip } from "chart.js";
import { Radar } from "react-chartjs-2";
import { METRICS, type Language, type Metric } from "../../labels";

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip);

export default function PlayerRadar({ name, language, metrics }: {
  name: string; language: Language;
  metrics: { metric: Metric; percentile: number | null; per90: number | null; peer_count: number }[];
}) {
  if (metrics.length !== 6 || metrics.some(metric => metric.percentile === null)) return null;
  const format = (value: number | null) => value === null ? "--" : new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);
  const labels = metrics.map(metric => {
    const words = METRICS[language][metric.metric].split(" ");
    return words.length > 1 ? [words.slice(0, -1).join(" "), words[words.length - 1]] : words;
  });
  return <div className="radar-canvas">
    <Radar role="img" aria-label={`${language === "en" ? "Percentile radar" : "Radar de percentiles"}: ${name}`} aria-describedby="radar-note metric-heading"
      data={{ labels, datasets: [{ label: name, data: metrics.map(metric => metric.percentile),
        borderColor: "#246448", backgroundColor: "#24644824", pointBackgroundColor: "#246448",
        pointBorderColor: "#ffffff", pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2, fill: true }] }}
      options={{ responsive: true, maintainAspectRatio: false, animation: false,
        scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, color: "#65716a", backdropColor: "#fbfcfa", font: { size: 10, family: "Barlow" } },
          pointLabels: { color: "#202924", font: { size: 12, family: "Barlow", weight: 500 }, padding: 8 },
          grid: { color: "#d5dfd8" }, angleLines: { color: "#d5dfd8" } } },
        plugins: { tooltip: { callbacks: {
          title: items => items.length ? METRICS[language][metrics[items[0].dataIndex].metric] : name,
          label: item => `${language === "en" ? "Percentile" : "Percentil"}: ${format(metrics[item.dataIndex].percentile)}`,
          afterLabel: item => `${language === "en" ? "Per 90" : "Por 90"}: ${format(metrics[item.dataIndex].per90)} | ${language === "en" ? "Peers" : "Pares"}: ${metrics[item.dataIndex].peer_count}`,
        } } },
      }} />
  </div>;
}
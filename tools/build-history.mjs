// River Watch: build the stored history summary ONCE (not on every question).
// Source: Open-Meteo Flood API (GloFAS v4 reanalysis), CC BY 4.0. https://open-meteo.com/en/docs/flood-api
// Run: node tools/build-history.mjs   -> writes history-summary.json
// Percentiles: linear interpolation between closest ranks (same as Excel PERCENTILE.INC / numpy default).
import { writeFileSync } from "node:fs";

// Grid cell chosen per town after checking which cell carries the town's named river (see FLAGS-LOG F1/F2).
export const POINTS = {
  "Clonmel":            { river: "Suir",       town: [52.355, -7.704], cell: [52.375, -7.725] },
  "Fermoy":             { river: "Blackwater", town: [52.138, -8.275], cell: [52.125, -8.325] },
  "Mallow":             { river: "Blackwater", town: [52.133, -8.646], cell: [52.125, -8.625] },
  "Bandon":             { river: "Bandon",     town: [51.746, -8.739], cell: [51.725, -8.775] },
  "Enniscorthy":        { river: "Slaney",     town: [52.501, -6.559], cell: [52.525, -6.575] },
  "Ennis":              { river: "Fergus",     town: [52.843, -8.986], cell: [52.825, -9.025] },
  "Athlone":            { river: "Shannon",    town: [53.423, -7.940], cell: [53.425, -7.975] },
  "Carrick-on-Shannon": { river: "Shannon",    town: [53.947, -8.087], cell: [53.925, -8.075] },
};

export function percentile(sorted, p) {
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// High-flow event = a run of consecutive days at or above p99, inside 1 Oct - 31 Mar.
// A run that crosses a winter boundary cannot happen (Apr-Sep is excluded and breaks runs).
export function countWinterEvents(times, flows, p99, firstWinter = 2016, lastWinter = 2024) {
  const perWinter = {};
  for (let w = firstWinter; w <= lastWinter; w++) perWinter[`${w}/${String(w + 1).slice(2)}`] = { events: 0, daysAbove: 0, longestRun: 0 };
  let run = 0, runWinter = null;
  const close = () => { if (run > 0 && runWinter) { const s = perWinter[runWinter]; s.events++; s.longestRun = Math.max(s.longestRun, run); } run = 0; runWinter = null; };
  for (let i = 0; i < times.length; i++) {
    const [y, m] = times[i].split("-").map(Number);
    const w = m >= 10 ? y : (m <= 3 ? y - 1 : null);
    const key = w !== null && w >= firstWinter && w <= lastWinter ? `${w}/${String(w + 1).slice(2)}` : null;
    const v = flows[i];
    if (key && v != null && v >= p99) {
      if (runWinter && runWinter !== key) close();
      run++; runWinter = key; perWinter[key].daysAbove++;
    } else close();
  }
  close();
  return perWinter;
}

async function main() {
  const out = { source: "Open-Meteo Flood API (GloFAS v4), CC BY 4.0", period: "2016-01-01 to 2025-12-31", built: new Date().toISOString(), percentileMethod: "linear interpolation (PERCENTILE.INC)", towns: {} };
  for (const [name, p] of Object.entries(POINTS)) {
    const [la, lo] = p.cell;
    const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${la}&longitude=${lo}&daily=river_discharge&start_date=2016-01-01&end_date=2025-12-31`;
    let j;
    for (let t = 0; t < 5; t++) { j = await (await fetch(url)).json(); if (j.daily) break; await new Promise(r => setTimeout(r, 65000)); }
    const times = j.daily.time, flows = j.daily.river_discharge;
    const vals = flows.filter(v => v != null).sort((a, b) => a - b);
    const p95 = percentile(vals, 0.95), p99 = percentile(vals, 0.99);
    const winters = countWinterEvents(times, flows, p99);
    const keys = Object.keys(winters);
    const first4 = keys.slice(0, 4).reduce((s, k) => s + winters[k].events, 0);
    const last4 = keys.slice(-4).reduce((s, k) => s + winters[k].events, 0);
    out.towns[name] = {
      river: p.river, townLatLon: p.town, gridCell: [j.latitude, j.longitude],
      days: vals.length, missing: flows.length - vals.length,
      mean: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2), median: +percentile(vals, 0.5).toFixed(2),
      p95: +p95.toFixed(2), p99: +p99.toFixed(2), max: vals[vals.length - 1],
      events: keys.reduce((s, k) => s + winters[k].events, 0), first4Winters: first4, last4Winters: last4,
      winters,
    };
    console.log(name, out.towns[name].mean, out.towns[name].p95, out.towns[name].p99, "events", out.towns[name].events, first4, last4);
    await new Promise(r => setTimeout(r, 8000));
  }
  writeFileSync(new URL("../history-summary.json", import.meta.url), JSON.stringify(out, null, 2));
}
if (process.argv[1] && process.argv[1].endsWith("build-history.mjs")) main();

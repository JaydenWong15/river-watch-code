// Task 3: recompute one town's 99th percentile a second way, from a sorted column.
// Writes evidence/clonmel_daily_2016_2025.csv (open in Excel: =PERCENTILE.INC(B2:B3654,0.99)).
// Run: node tools/check-p99.mjs
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
const h = JSON.parse(readFileSync(new URL("../history-summary.json", import.meta.url), "utf8")).towns.Clonmel;
const [la, lo] = h.gridCell;
const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${la}&longitude=${lo}&daily=river_discharge&start_date=2016-01-01&end_date=2025-12-31`;
const j = await (await fetch(url)).json();
const { time, river_discharge: q } = j.daily;
mkdirSync(new URL("../evidence/", import.meta.url), { recursive: true });
writeFileSync(new URL("../evidence/clonmel_daily_2016_2025.csv", import.meta.url), "date,flow_m3s\n" + time.map((t, i) => `${t},${q[i]}`).join("\n"));
const s = q.filter(v => v != null).sort((a, b) => a - b), n = s.length;
const pos = 0.99 * (n - 1) + 1;               // 1-based position, Excel PERCENTILE.INC
const lo1 = Math.floor(pos), frac = pos - lo1;
const inc = s[lo1 - 1] + frac * (s[lo1] - s[lo1 - 1]);
const nearest = s[Math.ceil(0.99 * n) - 1];   // nearest-rank method (textbook)
const above = s.filter(v => v >= h.p99).length;
console.log({ days: n, position: +pos.toFixed(2), valueAtRank: [lo1, s[lo1 - 1]], valueAtNextRank: [lo1 + 1, s[lo1]], percentileInc: +inc.toFixed(2), nearestRank: nearest, storedP99: h.p99, daysAtOrAboveStoredP99: above, sourceUrl: url });

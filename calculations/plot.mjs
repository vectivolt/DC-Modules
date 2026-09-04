// plot.mjs — dependency-free CSV/array → SVG line plots for simulation results (§49-13).
import { writeFileSync } from "node:fs";

const COLORS = ["#B97F07", "#3A6B8C", "#A83232", "#3A6B45", "#7A4FA0", "#666"];

export function plotSVG({ series, title = "", xlabel = "", ylabel = "", path, width = 860, height = 420, y2label = null }) {
  const mL = 62, mR = y2label ? 62 : 18, mT = 34, mB = 44;
  const W = width - mL - mR, H = height - mT - mB;
  const dec = (arr, n = 2400) => arr.length <= n ? arr : arr.filter((_, i) => i % Math.ceil(arr.length / n) === 0);
  const s = series.map(sr => ({ ...sr, x: dec(sr.x), y: dec(sr.y) }));
  const xs = s.flatMap(sr => sr.x), axes = [0, 1];
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const yb = axes.map(a => {
    const ys = s.filter(sr => (sr.axis ?? 0) === a).flatMap(sr => sr.y).filter(Number.isFinite);
    if (!ys.length) return a === 0 ? { lo: 0, hi: 1 } : null;
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = 0.06 * (hi - lo);
    return { lo: lo - pad, hi: hi + pad };
  });
  const X = x => mL + ((x - xmin) / (xmax - xmin || 1)) * W;
  const Y = (y, a = 0) => mT + H - ((y - yb[a].lo) / (yb[a].hi - yb[a].lo)) * H;
  const fmt = v => Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(1) : +v.toPrecision(3);
  let g = "";
  for (let i = 0; i <= 5; i++) {
    const yv = yb[0].lo + (i / 5) * (yb[0].hi - yb[0].lo), yy = Y(yv);
    g += `<line x1="${mL}" y1="${yy}" x2="${mL + W}" y2="${yy}" stroke="#ddd" stroke-width="0.6"/>` +
      `<text x="${mL - 6}" y="${yy + 4}" text-anchor="end" font-size="10" fill="#666">${fmt(yv)}</text>`;
    if (yb[1]) { const y2 = yb[1].lo + (i / 5) * (yb[1].hi - yb[1].lo); g += `<text x="${mL + W + 6}" y="${yy + 4}" font-size="10" fill="#3A6B8C">${fmt(y2)}</text>`; }
    const xv = xmin + (i / 5) * (xmax - xmin), xx = X(xv);
    g += `<line x1="${xx}" y1="${mT}" x2="${xx}" y2="${mT + H}" stroke="#eee" stroke-width="0.6"/>` +
      `<text x="${xx}" y="${mT + H + 16}" text-anchor="middle" font-size="10" fill="#666">${fmt(xv)}</text>`;
  }
  const paths = s.map((sr, i) => {
    const a = sr.axis ?? 0;
    const d = sr.x.map((x, k) => `${k ? "L" : "M"}${X(x).toFixed(1)},${Y(sr.y[k], a).toFixed(1)}`).join("");
    return `<path d="${d}" fill="none" stroke="${sr.color ?? COLORS[i % COLORS.length]}" stroke-width="1.5"/>`;
  }).join("");
  const legend = s.map((sr, i) =>
    `<rect x="${mL + 8 + i * 150}" y="${mT + 6}" width="10" height="3" fill="${sr.color ?? COLORS[i % COLORS.length]}"/>` +
    `<text x="${mL + 22 + i * 150}" y="${mT + 11}" font-size="10" fill="#333">${sr.label ?? "s" + i}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="Menlo,monospace">
<rect width="${width}" height="${height}" fill="#fff"/>
<text x="${mL}" y="20" font-size="12" font-weight="bold" fill="#111">${title}</text>
${g}${paths}${legend}
<text x="${mL + W / 2}" y="${height - 8}" text-anchor="middle" font-size="10" fill="#444">${xlabel}</text>
<text transform="rotate(-90 14 ${mT + H / 2})" x="14" y="${mT + H / 2}" text-anchor="middle" font-size="10" fill="#444">${ylabel}</text>
${y2label ? `<text transform="rotate(90 ${width - 14} ${mT + H / 2})" x="${width - 14}" y="${mT + H / 2}" text-anchor="middle" font-size="10" fill="#3A6B8C">${y2label}</text>` : ""}
<rect x="${mL}" y="${mT}" width="${W}" height="${H}" fill="none" stroke="#999" stroke-width="0.8"/>
</svg>`;
  writeFileSync(path, svg);
  return path;
}

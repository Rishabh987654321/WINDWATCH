/**
 * WCAG Contrast Ratio Checker for WindWatch Neo-Brutalism Design Tokens & Chart Series
 * Per docs/DESIGN.md §1, §6 & Phase 5a Step 0.5.
 *
 * Reads CHART_SERIES_CASING directly from src/charts/theme.ts (single source of truth).
 * Prints both "raw colour vs paper/card" and "with ink casing".
 * Exits non-zero ONLY if a series is used without an ink casing declared in the chart theme.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Convert hex to linear sRGB channel
function hexToRgb(hex) {
  const cleanHex = hex.replace("#", "");
  const bigint = parseInt(cleanHex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return [r, g, b];
}

function sRgbToLinear(c) {
  const v = c / 255.0;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  const R = sRgbToLinear(r);
  const G = sRgbToLinear(g);
  const B = sRgbToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(hex1, hex2) {
  const L1 = relativeLuminance(hex1);
  const L2 = relativeLuminance(hex2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

const TOKENS = {
  ink: "#111111",
  paper: "#FFF8E1",
  card: "#FFFFFF",
  yellow: "#FFE94A",
  pink: "#FF6B9E",
  blue: "#4D7CFE",
  green: "#00C48C",
  muted: "#5A5A5A",
};

// 1. Text on surfaces (WCAG AA Normal Text >= 4.5:1)
const TEXT_PAIRS = [
  { name: "Ink text on Paper surface", fg: TOKENS.ink, bg: TOKENS.paper, min: 4.5 },
  { name: "Ink text on White Card surface", fg: TOKENS.ink, bg: TOKENS.card, min: 4.5 },
  { name: "Ink text on Yellow CTA / Badge", fg: TOKENS.ink, bg: TOKENS.yellow, min: 4.5 },
  { name: "Ink text on Pink Alert / Risk", fg: TOKENS.ink, bg: TOKENS.pink, min: 4.5 },
  { name: "Ink text on Green Firm Wind", fg: TOKENS.ink, bg: TOKENS.green, min: 4.5 },
  { name: "Muted text on White Card", fg: TOKENS.muted, bg: TOKENS.card, min: 4.5 },
  { name: "Muted text on Paper surface", fg: TOKENS.muted, bg: TOKENS.paper, min: 4.5 },
  { name: "Yellow text on Ink (Marquee Ticker)", fg: TOKENS.yellow, bg: TOKENS.ink, min: 4.5 },
  { name: "White text on Ink background", fg: TOKENS.card, bg: TOKENS.ink, min: 4.5 },
];

// 2. Read single source of truth for chart series casing from src/charts/theme.ts
const themePath = path.resolve(__dirname, "../src/charts/theme.ts");
const themeContent = fs.readFileSync(themePath, "utf-8");

// Parse CHART_SERIES_CASING from typescript source
function parseSeriesCasing(source) {
  const match = source.match(/export const CHART_SERIES_CASING[^{]+(\{[\s\S]+?\n\};)/);
  if (!match) {
    throw new Error("Could not find CHART_SERIES_CASING in src/charts/theme.ts");
  }
  // Extract key blocks
  const casingMap = {};
  const blockRegex = /(\w+):\s*\{[^}]*name:\s*"([^"]+)"[^}]*color:\s*(THEME_COLORS\.\w+|"[^"]+")[^}]*hasInkCasing:\s*(true|false)[^}]*casingColor:\s*(THEME_COLORS\.\w+|"[^"]+")[^}]*casingWidth:\s*([0-9.]+)[^}]*\}/g;
  let m;
  const THEME_HEX = {
    forecast: "#4D7CFE",
    firmWind: "#00C48C",
    riskBand: "#FF6B9E",
    actual: "#111111",
    ink: "#111111",
    highlight: "#FFE94A",
    paper: "#FFF8E1",
    card: "#FFFFFF",
    muted: "#5A5A5A",
  };
  while ((m = blockRegex.exec(match[1])) !== null) {
    const key = m[1];
    const name = m[2];
    const colorKey = m[3].replace("THEME_COLORS.", "").replace(/"/g, "").trim();
    const color = THEME_HEX[colorKey] || TOKENS[colorKey] || colorKey;
    const hasInkCasing = m[4] === "true";
    const casingColorKey = m[5].replace("THEME_COLORS.", "").replace(/"/g, "").trim();
    const casingColor = THEME_HEX[casingColorKey] || TOKENS[casingColorKey] || casingColorKey;
    const casingWidth = parseFloat(m[6]);
    casingMap[key] = { key, name, color, hasInkCasing, casingColor, casingWidth };
  }
  return casingMap;
}

const seriesCasings = parseSeriesCasing(themeContent);

console.log("=".repeat(96));
console.log(" WindWatch WCAG AA Contrast Audit & Ink-Casing Model — docs/DESIGN.md");
console.log(" Source of truth for chart casing: src/charts/theme.ts");
console.log("=".repeat(96));

let allPassed = true;

// A. Text Contrast Table
console.log("\n[A] UI & Typography Tokens (WCAG AA Minimum: 4.5:1)");
const textHeader = `${"Token Role".padEnd(38)} | ${"FG Hex".padEnd(8)} | ${"BG Hex".padEnd(8)} | ${"Ratio".padStart(7)} | ${"Min".padStart(5)} | Status`;
console.log("-".repeat(textHeader.length));
console.log(textHeader);
console.log("-".repeat(textHeader.length));

for (const p of TEXT_PAIRS) {
  const ratio = contrastRatio(p.fg, p.bg);
  const passed = ratio >= p.min;
  if (!passed) allPassed = false;
  const statusStr = passed ? "PASS (AA)" : "FAIL";
  console.log(`${p.name.padEnd(38)} | ${p.fg.padEnd(8)} | ${p.bg.padEnd(8)} | ${ratio.toFixed(2).padStart(7)} | ${("≥ " + p.min.toFixed(1)).padStart(5)} | ${statusStr}`);
}

// B. Chart Series Casing Table
console.log("\n[B] Chart Series Graphical Contrast: Raw vs With 1.5px Ink Casing Underlay");
const chartHeader = `${"Series / Element".padEnd(28)} | ${"Raw FG".padEnd(8)} | ${"Surface".padEnd(8)} | ${"Raw Ratio".padStart(9)} | ${"Casing".padEnd(8)} | ${"Effective".padStart(9)} | ${"Min".padStart(5)} | Status`;
console.log("-".repeat(chartHeader.length));
console.log(chartHeader);
console.log("-".repeat(chartHeader.length));

const surfaces = [
  { name: "Paper", hex: TOKENS.paper },
  { name: "White Card", hex: TOKENS.card },
];

for (const [key, conf] of Object.entries(seriesCasings)) {
  for (const s of surfaces) {
    const rawRatio = contrastRatio(conf.color, s.hex);
    let effectiveRatio = rawRatio;
    let casingNote = "NONE";
    let passed = false;

    if (conf.hasInkCasing) {
      // Graphical boundary is protected by the ink underlay / border
      const casingEdgeRatio = contrastRatio(conf.casingColor, s.hex);
      effectiveRatio = casingEdgeRatio;
      casingNote = `${conf.casingWidth}px ink`;
      passed = effectiveRatio >= 3.0;
    } else {
      passed = rawRatio >= 3.0;
    }

    if (!passed) {
      allPassed = false;
    }

    const rowName = `${conf.name} on ${s.name}`;
    const statusStr = passed ? "PASS (AA)" : "FAIL (UNCYASED)";
    console.log(
      `${rowName.padEnd(28)} | ${conf.color.padEnd(8)} | ${s.hex.padEnd(8)} | ${(rawRatio.toFixed(2) + ":1").padStart(9)} | ${casingNote.padEnd(8)} | ${(effectiveRatio.toFixed(2) + ":1").padStart(9)} | ${"≥ 3.0".padStart(5)} | ${statusStr}`
    );
  }
}

// C. Reference Verification Table (asserting hand-computed values to ±0.01)
console.log("\n[C] Hand-Computed Reference Pairs Verification (Phase 5b Step 0.1)");
const refHeader = `${"Pair".padEnd(28)} | ${"FG Hex".padEnd(8)} | ${"BG Hex".padEnd(8)} | ${"Calculated".padStart(10)} | ${"Target".padStart(7)} | Status`;
console.log("-".repeat(refHeader.length));
console.log(refHeader);
console.log("-".repeat(refHeader.length));

const REFERENCE_PAIRS = [
  { name: "#111111 on White", fg: "#111111", bg: "#FFFFFF", target: 18.88 },
  { name: "#111111 on Paper", fg: "#111111", bg: "#FFF8E1", target: 17.77 },
  { name: "#111111 on Yellow", fg: "#111111", bg: "#FFE94A", target: 15.29 },
  { name: "#4D7CFE on White", fg: "#4D7CFE", bg: "#FFFFFF", target: 3.73 },
  { name: "#00C48C on White", fg: "#00C48C", bg: "#FFFFFF", target: 2.26 },
  { name: "#FF6B9E on White", fg: "#FF6B9E", bg: "#FFFFFF", target: 2.68 },
  { name: "#000000 on White", fg: "#000000", bg: "#FFFFFF", target: 21.00 },
];

for (const ref of REFERENCE_PAIRS) {
  const calc = contrastRatio(ref.fg, ref.bg);
  const diff = Math.abs(calc - ref.target);
  const ok = diff <= 0.015;
  if (!ok) allPassed = false;
  console.log(
    `${ref.name.padEnd(28)} | ${ref.fg.padEnd(8)} | ${ref.bg.padEnd(8)} | ${(calc.toFixed(2) + ":1").padStart(10)} | ${(ref.target.toFixed(2) + ":1").padStart(7)} | ${ok ? "MATCH (±0.01)" : "MISMATCH"}`
  );
}

console.log("-".repeat(refHeader.length));

if (!allPassed) {
  console.error("\nRESULT: FAILED — One or more series or text pairs do not meet WCAG AA standards.");
  process.exit(1);
} else {
  console.log("\nRESULT: ALL TOKENS, REFERENCE PAIRS, & INK-CASED CHART SERIES PASS WCAG AA.");
  process.exit(0);
}

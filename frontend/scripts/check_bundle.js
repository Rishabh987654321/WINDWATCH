import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, "../dist/assets");

if (!fs.existsSync(distDir)) {
  console.error("Error: dist/assets directory not found. Run 'npm run build' first.");
  process.exit(1);
}

const files = fs.readdirSync(distDir);
const jsFiles = files.filter((f) => f.endsWith(".js"));

console.log("=== WindWatch Bundle Size Audit ===");
let entryChunk = null;
let echartsChunk = null;
let failed = false;

for (const file of jsFiles) {
  const filePath = path.join(distDir, file);
  const content = fs.readFileSync(filePath);
  const rawSizeKb = (content.length / 1024).toFixed(2);
  const gzSize = zlib.gzipSync(content).length;
  const gzSizeKb = (gzSize / 1024).toFixed(2);

  const isEntry = file.startsWith("index-");
  const isEcharts = file.startsWith("Chart-");
  const isKit = file.startsWith("UiKitPage-");

  let label = "";
  if (isEntry) {
    label = " [ENTRY]";
    entryChunk = { file, rawKb: rawSizeKb, gzKb: parseFloat(gzSizeKb), content: content.toString("utf-8") };
  } else if (isEcharts) {
    label = " [ECHARTS CHUNK (LAZY)]";
    echartsChunk = { file, rawKb: rawSizeKb, gzKb: parseFloat(gzSizeKb) };
  } else if (isKit) {
    label = " [UIKIT CHUNK (LAZY)]";
  }

  console.log(`  ${file.padEnd(36)} ${rawSizeKb.padStart(8)} KB (raw) │ ${gzSizeKb.padStart(8)} KB (gzip)${label}`);
}

console.log("\n--- Verification Budget ---");
const BUDGET_ENTRY_GZ_KB = 350;

if (!entryChunk) {
  console.error("FAIL: Could not identify index entry chunk.");
  failed = true;
} else {
  console.log(`Initial JS (Entry): ${entryChunk.gzKb} KB gz (Budget: < ${BUDGET_ENTRY_GZ_KB} KB gz)`);
  if (entryChunk.gzKb > BUDGET_ENTRY_GZ_KB) {
    console.error(`FAIL: Entry chunk exceeds budget: ${entryChunk.gzKb} KB gz > ${BUDGET_ENTRY_GZ_KB} KB gz`);
    failed = true;
  } else {
    console.log(`PASS: Entry chunk is within budget (Headroom: ${(BUDGET_ENTRY_GZ_KB - entryChunk.gzKb).toFixed(1)} KB gz)`);
  }

  // Check if ECharts library was accidentally bundled into entry chunk
  // When lazy-loaded, echarts code lives in Chart-*.js; entry should only import dynamic React.lazy
  const hasEchartsInEntry =
    entryChunk.content.includes("echarts/core") ||
    entryChunk.content.includes("echarts.registerTheme") ||
    (entryChunk.content.includes("echarts") && entryChunk.content.length > 500000);

  if (hasEchartsInEntry) {
    console.error("FAIL: echarts appears bundled into entry chunk instead of lazy-loaded Chart chunk!");
    failed = true;
  } else {
    console.log("PASS: ECharts is correctly excluded from the initial entry chunk (lazy-loaded).");
  }
}

if (!echartsChunk) {
  console.error("FAIL: Chart-* (ECharts) chunk not found.");
  failed = true;
} else {
  console.log(`ECharts chunk: ${echartsChunk.gzKb} KB gz (lazy loaded via React.lazy)`);
}

if (failed) {
  process.exit(1);
} else {
  console.log("=== Bundle Audit PASSED ===\n");
}

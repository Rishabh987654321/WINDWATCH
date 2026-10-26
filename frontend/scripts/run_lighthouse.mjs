import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, "../../docs/screens");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const routes = [
  { name: "Overview (/)", url: "http://localhost:5173/" },
  { name: "Day-Ahead (/day-ahead)", url: "http://localhost:5173/day-ahead?d=2026-01-15" },
  { name: "Accuracy Lab (/accuracy)", url: "http://localhost:5173/accuracy" },
  { name: "Methodology (/methodology)", url: "http://localhost:5173/methodology" },
];

async function runLighthouse(route) {
  const safeName = route.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
  const jsonPath = path.join(outDir, `lh-${safeName}.json`);

  return new Promise((resolve) => {
    console.log(`Running Lighthouse accessibility audit for: ${route.name} (${route.url})...`);
    // Run npx lighthouse
    const isWindows = process.platform === "win32";
    const cmd = isWindows ? "npx.cmd" : "npx";
    const args = [
      "lighthouse",
      route.url,
      "--only-categories=accessibility",
      "--output=json",
      `--output-path=${jsonPath}`,
      "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
      "--quiet",
    ];

    const child = spawn(cmd, args, { stdio: "inherit", shell: true });
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(jsonPath)) {
        try {
          const raw = fs.readFileSync(jsonPath, "utf-8");
          const report = JSON.parse(raw);
          const score = Math.round((report.categories?.accessibility?.score ?? 0) * 100);
          console.log(`  ✓ ${route.name}: Accessibility Score = ${score}/100`);
          resolve({ name: route.name, score, success: true });
          return;
        } catch (e) {
          console.error(`  Error parsing report for ${route.name}:`, e.message);
        }
      }
      console.log(`  x ${route.name}: Lighthouse exited with code ${code}`);
      resolve({ name: route.name, score: null, success: false });
    });
  });
}

async function main() {
  console.log("=== STEP 0.5: LIGHTHOUSE ACCESSIBILITY AUDIT ===");
  const results = [];
  for (const r of routes) {
    const res = await runLighthouse(r);
    results.push(res);
  }
  console.log("\nSummary Table:");
  console.table(results);
}

main();

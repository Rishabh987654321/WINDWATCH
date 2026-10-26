import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const axePath = path.resolve(__dirname, "../node_modules/axe-core/axe.min.js");

export async function checkA11y(page: Page, contextName: string) {
  await page.addScriptTag({ path: axePath });
  const results = await page.evaluate(async () => {
    // @ts-expect-error axe global in browser context
    return await window.axe.run(document, {
      resultTypes: ["violations"],
    });
  });

  if (results.violations.length > 0) {
    console.error(`Accessibility violations found in ${contextName}:`);
    for (const v of results.violations) {
      console.error(`- [${v.id}] ${v.help} (${v.nodes.length} occurrences)`);
    }
  }

  expect(results.violations, `Expected no accessibility violations in ${contextName}`).toEqual([]);
}

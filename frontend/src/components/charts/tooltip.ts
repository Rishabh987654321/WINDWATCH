export interface TooltipRow {
  seriesName: string;
  value: number | string | null;
  unit?: string;
  color: string;
  dashed?: boolean;
}

export function createNeoTooltipHtml(
  title: string,
  rows: TooltipRow[],
  extraNotice?: string
): string {
  const rowHtml = rows
    .map((r) => {
      const valStr =
        r.value === null || r.value === undefined
          ? "null"
          : typeof r.value === "number"
          ? r.value.toLocaleString(undefined, { maximumFractionDigits: 1 })
          : r.value;

      const swatchStyle = r.dashed
        ? `background: transparent; border: 2px dashed ${r.color};`
        : `background: ${r.color}; border: 1.5px solid #111;`;

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 4px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 2px; ${swatchStyle}"></span>
            <span style="font-family: 'Space Grotesk', sans-serif; font-size: 11px; font-weight: 700; color: #111;">${r.seriesName}:</span>
          </div>
          <span style="font-family: 'Space Mono', monospace; font-size: 12px; font-weight: 700; color: #111; font-variant-numeric: tabular-nums;">
            ${valStr} ${r.unit || "MW"}
          </span>
        </div>
      `;
    })
    .join("");

  const extraHtml = extraNotice
    ? `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #ddd; font-size: 10px; color: #5A5A5A;">${extraNotice}</div>`
    : "";

  return `
    <div style="font-family: 'Space Grotesk', sans-serif; text-align: left;">
      <div style="font-family: 'Archivo Black', sans-serif; font-size: 11px; text-transform: uppercase; color: #111; border-bottom: 2px solid #111; padding-bottom: 3px; margin-bottom: 4px;">
        ${title}
      </div>
      ${rowHtml}
      ${extraHtml}
    </div>
  `;
}

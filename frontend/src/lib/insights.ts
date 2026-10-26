/**
 * Pure template functions for Accuracy Lab insight captions.
 * Per docs/phase5b.md Step 1.
 * If data condition is not met, captions say something neutral — never assert unverified patterns.
 */

export interface HorizonInsightInput {
  h0Mae: number | null;
  hReliableMae: number | null;
  reliableH: number;
}

export function getHorizonInsight(input: HorizonInsightInput): string {
  const { h0Mae, hReliableMae, reliableH } = input;
  if (h0Mae === null || hReliableMae === null || h0Mae <= 0) {
    return "Forecast error evaluated across lead horizons.";
  }

  const pctChange = ((hReliableMae - h0Mae) / h0Mae) * 100;
  const signStr = pctChange >= 0 ? `+${pctChange.toFixed(1)}` : pctChange.toFixed(1);

  if (hReliableMae >= h0Mae) {
    return `MAE ${h0Mae.toFixed(1)} MW at H=0 → ${hReliableMae.toFixed(1)} MW at H=${reliableH} (${signStr}%).`;
  }
  return `MAE is not increasing monotonically: ${h0Mae.toFixed(1)} MW at H=0 vs ${hReliableMae.toFixed(1)} MW at H=${reliableH} (${signStr}%).`;
}

export interface DistributionInsightInput {
  overForecastRate: number | null | undefined;
}

export function getDistributionInsight(input: DistributionInsightInput): string {
  const { overForecastRate } = input;
  if (overForecastRate === null || overForecastRate === undefined) {
    return "Forecast error distribution across all evaluated hours.";
  }
  const pct = (overForecastRate * 100).toFixed(1);
  return `Forecast was above actual in ${pct}% of hours.`;
}

export interface ByHourInsightInput {
  highestHour: number | null;
  highestMae: number | null;
  lowestHour: number | null;
  lowestMae: number | null;
}

export function getByHourInsight(input: ByHourInsightInput): string {
  const { highestHour, highestMae, lowestHour, lowestMae } = input;
  if (
    highestHour === null ||
    highestMae === null ||
    lowestHour === null ||
    lowestMae === null
  ) {
    return "Forecast accuracy and signed bias broken down by hour of day (Europe/London).";
  }
  const hHigh = String(highestHour).padStart(2, "0");
  const hLow = String(lowestHour).padStart(2, "0");
  return `Highest MAE occurred at hour ${hHigh}:00 (${highestMae.toFixed(1)} MW); lowest at hour ${hLow}:00 (${lowestMae.toFixed(1)} MW).`;
}

export interface ByLevelInsightInput {
  topBinBias: number | null;
  topBinLabel: string | null;
  bottomBinBias: number | null;
  bottomBinLabel: string | null;
}

export function getByLevelInsight(input: ByLevelInsightInput): string {
  const { topBinBias, topBinLabel, bottomBinBias, bottomBinLabel } = input;
  if (
    topBinBias === null ||
    bottomBinBias === null ||
    !topBinLabel ||
    !bottomBinLabel
  ) {
    return "Forecast error broken down across 5 generation levels.";
  }
  const signTop = topBinBias > 0 ? `+${topBinBias.toFixed(1)}` : topBinBias.toFixed(1);
  const signBottom = bottomBinBias > 0 ? `+${bottomBinBias.toFixed(1)}` : bottomBinBias.toFixed(1);
  return `Signed bias was ${signTop} MW in the top bin (${topBinLabel}) and ${signBottom} MW in the bottom bin (${bottomBinLabel}).`;
}

export interface HeatmapInsightInput {
  highestMissDate: string | null;
  highestMissHour: number | null;
  highestMissMae: number | null;
}

export function getHeatmapInsight(input: HeatmapInsightInput): string {
  const { highestMissDate, highestMissHour, highestMissMae } = input;
  if (!highestMissDate || highestMissHour === null || highestMissMae === null) {
    return "Hourly forecast absolute error distribution across the evaluation window.";
  }
  const hStr = String(highestMissHour).padStart(2, "0");
  return `Peak error occurred on ${highestMissDate} at ${hStr}:00 (${highestMissMae.toFixed(1)} MW absolute error).`;
}

export function formatLondonTime(isoOrDateStr: string): string {
  if (/^\d{1,2}\s+[A-Za-z]{3}\s+\d{2}:\d{2}$/.test(isoOrDateStr)) {
    return isoOrDateStr;
  }
  try {
    const d = new Date(isoOrDateStr);
    if (!isNaN(d.getTime())) {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(d);
      const day = parts.find((p) => p.type === "day")?.value;
      const month = parts.find((p) => p.type === "month")?.value;
      const hour = parts.find((p) => p.type === "hour")?.value;
      const minute = parts.find((p) => p.type === "minute")?.value;
      if (day && month && hour && minute) {
        return `${day} ${month} ${hour}:${minute}`;
      }
    }
  } catch {
    // fallback
  }
  return isoOrDateStr;
}

export interface VintagesInsightInput {
  n: number;
  localTime: string;
  minMw: number | null;
  maxMw: number | null;
  actualMw: number | null;
}

export function getVintagesInsight(input: VintagesInsightInput): string {
  const { n, localTime, minMw, maxMw, actualMw } = input;
  const formattedTime = formatLondonTime(localTime);
  if (minMw === null || maxMw === null || actualMw === null || n === 0) {
    return `Forecast evolution across publication runs for ${formattedTime}.`;
  }
  const minStr = Math.round(minMw).toLocaleString("en-GB");
  const maxStr = Math.round(maxMw).toLocaleString("en-GB");
  const actStr = Math.round(actualMw).toLocaleString("en-GB");
  return `${n} forecasts were published for ${formattedTime}; they ranged from ${minStr} to ${maxStr} MW; actual was ${actStr} MW.`;
}


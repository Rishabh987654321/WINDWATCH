export type PolicyType = "day_ahead" | "lead_time";

export interface FilterState {
  from: string;
  to: string;
  policy: PolicyType;
  horizonHours: number;
  cutoff: string;
  riskQuantile: number;
  windowDays: number;
  deliveryDate: string;
  revealActuals: boolean;
  targetTime?: string;
}

export interface MetaContext {
  evalWindowFrom: string;
  evalWindowTo: string;
  coverageFrom: string;
  coverageTo: string;
  maxHorizonHours: number;
  reliableHorizonHours: number;
  defaultPolicy: PolicyType;
  defaultCutoff: string;
  defaultRiskQuantile: number;
  defaultWindowDays: number;
}

export const FALLBACK_META: MetaContext = {
  evalWindowFrom: "2026-01-01",
  evalWindowTo: "2026-01-31",
  coverageFrom: "2025-12-01",
  coverageTo: "2026-01-31",
  maxHorizonHours: 66,
  reliableHorizonHours: 44,
  defaultPolicy: "day_ahead",
  defaultCutoff: "09:00",
  defaultRiskQuantile: 0.9,
  defaultWindowDays: 28,
};

const VALID_POLICIES: PolicyType[] = ["day_ahead", "lead_time"];
const VALID_QUANTILES = [0.8, 0.9, 0.95, 0.99];

export function isValidDateStr(val: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(val) && !isNaN(Date.parse(val));
}

export function isValidCutoff(val: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(val);
}

/**
 * Clamp a date string within [minDate, maxDate].
 */
export function clampDate(val: string, minDate: string, maxDate: string, fallback: string): string {
  if (!isValidDateStr(val)) return fallback;
  if (val < minDate) return minDate;
  if (val > maxDate) return maxDate;
  return val;
}

/**
 * Pure function: Clamps state against coverage boundaries and valid value ranges.
 */
export function clampFilterState(state: FilterState, meta: MetaContext = FALLBACK_META): FilterState {
  // Extract date part if timestamp was passed
  const covFrom = meta.coverageFrom.slice(0, 10);
  const covTo = meta.coverageTo.slice(0, 10);

  let from = clampDate(state.from, covFrom, covTo, meta.evalWindowFrom);
  let to = clampDate(state.to, covFrom, covTo, meta.evalWindowTo);

  // Ensure from <= to
  if (from > to) {
    from = meta.evalWindowFrom;
    to = meta.evalWindowTo;
  }

  const policy: PolicyType = VALID_POLICIES.includes(state.policy)
    ? state.policy
    : meta.defaultPolicy;

  const horizonHours = Math.max(0, Math.min(meta.maxHorizonHours, Number.isFinite(state.horizonHours) ? state.horizonHours : 0));

  const cutoff = isValidCutoff(state.cutoff) ? state.cutoff : meta.defaultCutoff;

  const riskQuantile = VALID_QUANTILES.includes(state.riskQuantile)
    ? state.riskQuantile
    : meta.defaultRiskQuantile;

  const windowDays = Number.isInteger(state.windowDays) && state.windowDays >= 3 && state.windowDays <= 45
    ? state.windowDays
    : meta.defaultWindowDays;

  const deliveryDate = clampDate(state.deliveryDate, covFrom, covTo, "2026-01-15");

  // targetTime (t parameter) for forecast evolution in Accuracy Lab
  let targetTime: string | undefined = undefined;
  if (state.targetTime) {
    targetTime = state.targetTime;
  }

  return {
    from,
    to,
    policy,
    horizonHours,
    cutoff,
    riskQuantile,
    windowDays,
    deliveryDate,
    revealActuals: Boolean(state.revealActuals),
    targetTime,
  };
}

/**
 * Pure function: Parse URL search query string into FilterState, falling back to meta defaults.
 */
export function parseUrlParams(search: string, meta: MetaContext = FALLBACK_META): FilterState {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

  const rawPolicy = params.get("policy");
  const policy: PolicyType = rawPolicy === "lead_time" || rawPolicy === "day_ahead"
    ? rawPolicy
    : meta.defaultPolicy;

  const rawH = params.get("h");
  const horizonHours = rawH !== null && !isNaN(Number(rawH)) ? Number(rawH) : 0;

  const rawCutoff = params.get("cutoff") || meta.defaultCutoff;
  const cutoff = isValidCutoff(rawCutoff) ? rawCutoff : meta.defaultCutoff;

  const rawQ = params.get("q");
  const parsedQ = rawQ !== null ? Number(rawQ) : meta.defaultRiskQuantile;
  const riskQuantile = VALID_QUANTILES.includes(parsedQ) ? parsedQ : meta.defaultRiskQuantile;

  const rawW = params.get("w");
  const windowDays = rawW !== null && !isNaN(parseInt(rawW, 10))
    ? parseInt(rawW, 10)
    : meta.defaultWindowDays;

  const rawFrom = params.get("from") || meta.evalWindowFrom;
  const rawTo = params.get("to") || meta.evalWindowTo;
  const rawDelivery = params.get("d") || "2026-01-15";

  const rawReveal = params.get("reveal");
  const revealActuals = rawReveal === "true" || rawReveal === "1";

  const rawTargetTime = params.get("t");
  const targetTime = rawTargetTime || undefined;

  const candidate: FilterState = {
    from: rawFrom,
    to: rawTo,
    policy,
    horizonHours,
    cutoff,
    riskQuantile,
    windowDays,
    deliveryDate: rawDelivery,
    revealActuals,
    targetTime,
  };

  return clampFilterState(candidate, meta);
}

/**
 * Pure function: Serialize FilterState to URL search string.
 */
export function serializeUrlParams(state: FilterState, meta: MetaContext = FALLBACK_META): string {
  const clamped = clampFilterState(state, meta);
  const params = new URLSearchParams();

  params.set("from", clamped.from);
  params.set("to", clamped.to);
  params.set("policy", clamped.policy);

  if (clamped.policy === "lead_time") {
    params.set("h", clamped.horizonHours.toString());
  } else {
    params.set("cutoff", clamped.cutoff);
  }

  params.set("q", clamped.riskQuantile.toString());
  params.set("w", clamped.windowDays.toString());
  params.set("d", clamped.deliveryDate);

  if (clamped.revealActuals) {
    params.set("reveal", "true");
  }

  if (clamped.targetTime) {
    params.set("t", clamped.targetTime);
  }

  return params.toString();
}

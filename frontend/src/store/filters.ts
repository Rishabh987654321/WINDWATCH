import { create } from "zustand";
import {
  FALLBACK_META,
  parseUrlParams,
  serializeUrlParams,
  clampFilterState,
  type FilterState,
  type MetaContext,
  type PolicyType,
} from "../lib/url-state";
import type { MetaResponse } from "../api/types";

export interface FilterStore extends FilterState {
  meta: MetaContext;
  isInitialized: boolean;

  // Actions
  setFilter: <K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
    options?: { replace?: boolean }
  ) => void;
  setFilters: (
    partial: Partial<FilterState>,
    options?: { replace?: boolean }
  ) => void;
  initFromMeta: (meta: MetaResponse) => void;
}

function updateBrowserUrl(state: FilterState, meta: MetaContext, replace = false) {
  if (typeof window === "undefined") return;
  const queryString = serializeUrlParams(state, meta);
  const currentPath = window.location.pathname;
  const newUrl = queryString ? `${currentPath}?${queryString}` : currentPath;

  if (replace) {
    window.history.replaceState(null, "", newUrl);
  } else {
    window.history.pushState(null, "", newUrl);
  }
}

export function extractMetaContext(meta: MetaResponse): MetaContext {
  const d = meta.data;
  const def = meta.defaults;
  return {
    evalWindowFrom: d.evaluation_window.from.slice(0, 10),
    evalWindowTo: d.evaluation_window.to.slice(0, 10),
    coverageFrom: d.coverage.forecasts.from.slice(0, 10),
    coverageTo: d.coverage.forecasts.to.slice(0, 10),
    maxHorizonHours: d.max_horizon_hours,
    reliableHorizonHours: d.reliable_horizon_hours,
    defaultPolicy: (def.policy === "lead_time" ? "lead_time" : "day_ahead") as PolicyType,
    defaultCutoff: def.cutoff_local,
    defaultRiskQuantile: def.risk_quantile,
    defaultWindowDays: def.window_days,
  };
}

// Initial state parsed from URL search params with fallback meta
const initialSearch = typeof window !== "undefined" ? window.location.search : "";
const initialState = parseUrlParams(initialSearch, FALLBACK_META);

export const useFilters = create<FilterStore>((set, get) => ({
  ...initialState,
  meta: FALLBACK_META,
  isInitialized: false,

  setFilter: (key, value, options = { replace: false }) => {
    const current = get();
    const nextUnclamped = {
      from: current.from,
      to: current.to,
      policy: current.policy,
      horizonHours: current.horizonHours,
      cutoff: current.cutoff,
      riskQuantile: current.riskQuantile,
      windowDays: current.windowDays,
      deliveryDate: current.deliveryDate,
      revealActuals: current.revealActuals,
      targetTime: current.targetTime,
      [key]: value,
    };
    const next = clampFilterState(nextUnclamped, current.meta);
    set(next);
    updateBrowserUrl(next, current.meta, options.replace);
  },

  setFilters: (partial, options = { replace: false }) => {
    const current = get();
    const nextUnclamped = {
      from: current.from,
      to: current.to,
      policy: current.policy,
      horizonHours: current.horizonHours,
      cutoff: current.cutoff,
      riskQuantile: current.riskQuantile,
      windowDays: current.windowDays,
      deliveryDate: current.deliveryDate,
      revealActuals: current.revealActuals,
      targetTime: current.targetTime,
      ...partial,
    };
    const next = clampFilterState(nextUnclamped, current.meta);
    set(next);
    updateBrowserUrl(next, current.meta, options.replace);
  },

  initFromMeta: (metaResponse: MetaResponse) => {
    const current = get();
    if (current.isInitialized) return;

    const meta = extractMetaContext(metaResponse);
    const search = typeof window !== "undefined" ? window.location.search : "";
    const parsed = parseUrlParams(search, meta);

    set({
      ...parsed,
      meta,
      isInitialized: true,
    });
    updateBrowserUrl(parsed, meta, true);
  },
}));

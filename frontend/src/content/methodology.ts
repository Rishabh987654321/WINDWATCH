export interface MetricDefinition {
  id: string;
  name: string;
  formula: string;
  summary: string;
  interpretation: string;
}

export interface AssumptionItem {
  id: string;
  title: string;
  rationale: string;
  implementation: string;
}

export interface CaveatItem {
  id: string;
  title: string;
  description: string;
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    id: "mae",
    name: "Mean Absolute Error (MAE)",
    formula: "mean(|forecast - actual|)",
    summary: "Average magnitude of forecast errors in Megawatts, treating over-forecasts and under-forecasts equally.",
    interpretation: "The primary headline measure of forecast accuracy. Does not cancel out opposing errors.",
  },
  {
    id: "rmse",
    name: "Root Mean Squared Error (RMSE)",
    formula: "sqrt(mean((forecast - actual)²))",
    summary: "Square root of the mean squared error, penalizing larger deviations quadratically.",
    interpretation: "Reflects sensitivity to severe forecast misses and tail risk events.",
  },
  {
    id: "bias",
    name: "Mean Signed Bias (ME)",
    formula: "mean(forecast - actual)",
    summary: "Average signed forecast error. Positive indicates over-forecast; negative indicates under-forecast.",
    interpretation: "Reveals systematic directional bias in the forecast models across the evaluated window.",
  },
  {
    id: "nmae",
    name: "Normalized MAE (nMAE)",
    formula: "100 * MAE / mean(actual)",
    summary: "Mean Absolute Error expressed as a percentage of mean actual wind generation over the period.",
    interpretation: "Provides a dimensionless, scale-sensitive benchmark without relying on unverified capacity figures.",
  },
  {
    id: "p90",
    name: "P90 / P95 Absolute Error",
    formula: "Quantile(|forecast - actual|, q)",
    summary: "The 90th and 95th empirical percentiles of hourly absolute forecast error.",
    interpretation: "Quantifies tail severity: in 90% of hours, the absolute error was less than or equal to this threshold.",
  },
  {
    id: "over-forecast-rate",
    name: "Over-Forecast Rate",
    formula: "count(forecast > actual) / total_evaluated_hours",
    summary: "The proportion of evaluated hours where forecast generation strictly exceeded actual generation.",
    interpretation: "Highlights asymmetry in buyer exposure to balancing mechanism shortfall pricing.",
  },
];

export const WHY_NOT_MAPE = {
  title: "Why WindWatch Omits MAPE",
  rationale:
    "Mean Absolute Percentage Error (MAPE) divides error by actual generation. During calm weather periods and wind lulls, actual generation approaches zero Megawatts, causing extreme division-by-zero instability and distorted percentages. Normalizing by mean actual generation (nMAE) provides numerical stability across all weather regimes.",
};

export const ASSUMPTIONS: AssumptionItem[] = [
  {
    id: "A1",
    title: "A1: Day-Ahead Decision Cutoff at 09:00 London Time",
    rationale:
      "WINDFOR forecast runs publish at 30 minutes past 02, 04, 07, 09, 11, 15, 18, and 22 UTC. GB day-ahead auction gate closures occur in the morning of D-1. Setting cutoff to 09:00 selects the 07:30 UTC publication run, conservatively prior to auction clearing.",
    implementation: "Configurable via DAY_AHEAD_CUTOFF_LOCAL and dynamic UI selector.",
  },
  {
    id: "A2",
    title: "A2: Evaluation Window = January 2026",
    rationale:
      "Analysis covers target delivery hours from 2026-01-01 00:00 to 2026-01-31 23:00 UTC (744 total hours).",
    implementation: "Bounded by evaluation_window metadata.",
  },
  {
    id: "A3",
    title: "A3: December 2025 Warm-Up Data for Trailing Samples",
    rationale:
      "Calculating trailing risk quantiles for early January delivery days requires an antecedent historical sample. December 2025 data is ingested solely as warm-up context.",
    implementation: "Loaded into parquet snapshot; excluded from January summary metrics.",
  },
  {
    id: "A4",
    title: "A4: Normalization by Mean Actual Generation",
    rationale:
      "Because verified total installed nameplate capacity data is not provided in the BMRS fuel stream, metrics are normalized by sample mean actual generation.",
    implementation: "nmae_pct = 100 * mae_mw / mean_actual_mw.",
  },
  {
    id: "A5",
    title: "A5: Frozen Parquet Data Snapshot in Production",
    rationale:
      "Ensures zero dependency on external Elexon API availability, idempotent calculations, and sub-100ms response times.",
    implementation: "Ingested via CLI with verifiable SHA-256 manifest.",
  },
  {
    id: "ADR-011",
    title: "ADR-011: Hourly Alignment Grid",
    rationale:
      "WINDFOR forecasts are published for hourly target boundaries (:00). Actual generation from FUELHH is reported half-hourly (:00 and :30). Hourly metrics match on :00 timestamps without interpolating forecasts.",
    implementation: "Strict inner join on target timestamp.",
  },
  {
    id: "ADR-012",
    title: "ADR-012: WINDFOR Publication Cadence",
    rationale:
      "Forecast runs arrive at 8 distinct times daily (:30 past 02, 04, 07, 09, 11, 15, 18, 22 UTC). Selection policies strictly enforce publish_time <= cutoff.",
    implementation: "Filter by latest publish time before cutoff boundary.",
  },
];

export const CAVEATS: CaveatItem[] = [
  {
    id: "scope-difference",
    title: "Dataset Scope Differences",
    description:
      "FUELHH actuals and WINDFOR forecasts may reflect different generation perimeters (e.g. transmission-connected vs embedded distribution wind, or curtailment dispatch). This difference is reported transparently without attributing causality.",
  },
  {
    id: "national-aggregate",
    title: "National Aggregation Masking",
    description:
      "Aggregating generation across Great Britain cancels out regional wind variations and transmission boundary bottlenecks.",
  },
  {
    id: "sample-size",
    title: "Limited Evaluation Window",
    description:
      "One calendar month (744 hourly observations) is insufficient to guarantee asymptotic stability for extreme tail events (such as P95 or P99).",
  },
  {
    id: "regime-stability",
    title: "Weather Regime Assumptions",
    description:
      "Trailing empirical error quantiles assume recent weather error patterns persist into future delivery days. Atmospheric regime shifts can invalidate trailing error distributions.",
  },
];

export const AI_DISCLOSURE = {
  title: "AI Collaboration & Methodology Disclosure",
  content:
    "WindWatch was designed and developed with assistance from Google DeepMind Advanced Agentic Coding tools. All domain rules, mathematical definitions, leakage guards, and statistical assertions were specified by human engineering directives and validated through automated unit, integration, and end-to-end tests.",
};

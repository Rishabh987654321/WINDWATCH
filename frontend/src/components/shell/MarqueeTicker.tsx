import React from "react";
import { Marquee } from "../ui/Marquee";
import { useSummary } from "../../api/hooks";
import { useFilters } from "../../store/filters";

export const MarqueeTicker: React.FC = () => {
  const { from, to, policy, cutoff, horizonHours } = useFilters();

  const { data, isLoading, isError } = useSummary({
    from,
    to,
    policy,
    cutoff: policy === "day_ahead" ? cutoff : undefined,
    horizon_hours: policy === "lead_time" ? horizonHours : undefined,
  });

  if (isLoading) {
    return (
      <Marquee
        items={[
          "CALCULATING JANUARY 2026 BENCHMARK METRICS...",
          "ALIGNING FUELHH ACTUALS WITH WINDFOR FORECASTS...",
          "LOADING HEADLINE STATS...",
        ]}
      />
    );
  }

  if (isError || !data) {
    return (
      <Marquee
        items={[
          "BENCHMARK STATUS: EVALUATING",
          "POLICY: DAY-AHEAD 09:00 LONDON",
          "NOTICE: RECONNECTING TO SNAPSHOT STORE",
        ]}
      />
    );
  }

  const biasVal = data.bias_mw ?? 0;
  const isOver = biasVal > 0;
  const items = [
    `MAE: ${data.mae_mw?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? "---"} MW`,
    `BIAS: ${isOver ? "+" : ""}${data.bias_mw?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? "---"} MW (${isOver ? "OVER-FORECAST" : "UNDER-FORECAST"})`,
    `RMSE: ${data.rmse_mw?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? "---"} MW`,
    `nMAE: ${data.nmae_pct?.toFixed(1) ?? "---"}% OF MEAN ACTUAL`,
    `P90 |ERR|: ${data.p90_abs_error_mw?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? "---"} MW`,
    `P95 |ERR|: ${data.p95_abs_error_mw?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? "---"} MW`,
    `EVALUATED PERIODS: ${data.n?.toLocaleString() ?? "---"}`,
  ];

  return <Marquee items={items} speedSeconds={35} />;
};

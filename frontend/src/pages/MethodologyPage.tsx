import React from "react";
import { Link } from "react-router-dom";
import { useMeta, useCalibration } from "../api/hooks";
import { Sticker } from "../components/ui/Sticker";
import { Skeleton } from "../components/ui/Skeleton";
import {
  METRIC_DEFINITIONS,
  WHY_NOT_MAPE,
  ASSUMPTIONS,
  CAVEATS,
  AI_DISCLOSURE,
} from "../content/methodology";

export const MethodologyPage: React.FC = () => {
  const metaQuery = useMeta();
  const meta = metaQuery.data;

  // Calibration sensitivity queries
  const calW7 = useCalibration({ risk_quantile: 0.9, window_days: 7 });
  const calW14 = useCalibration({ risk_quantile: 0.9, window_days: 14 });
  const calW21 = useCalibration({ risk_quantile: 0.9, window_days: 21 });
  const calW28 = useCalibration({ risk_quantile: 0.9, window_days: 28 });

  const calQ80 = useCalibration({ risk_quantile: 0.8, window_days: 28 });
  const calQ95 = useCalibration({ risk_quantile: 0.95, window_days: 28 });

  return (
    <div className="space-y-8 animate-in fade-in-0 duration-150 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-[3px] border-[#111] pb-4">
        <div>
          <h1 className="font-['Archivo_Black'] text-2xl sm:text-4xl text-[#111] uppercase tracking-tight">
            Methodology & Domain Specifications
          </h1>
          <p className="text-xs sm:text-sm font-['Space_Mono'] text-[#111]/70 mt-1">
            Complete mathematical definitions, selection policies, risk models, and data lineage.
          </p>
        </div>
        <Sticker color="ink" rotate={1}>
          DOMAIN RULES
        </Sticker>
      </div>

      {/* Table of Contents Quick Nav */}
      <nav aria-label="Table of Contents" className="bg-[#FFF8E1] border-[3px] border-[#111] p-4 shadow-[4px_4px_0_#111]">
        <h2 className="text-xs font-['Space_Mono'] font-bold uppercase tracking-wider text-[#111] mb-2">
          Jump to Section:
        </h2>
        <div className="flex flex-wrap gap-2 text-xs font-['Space_Mono']">
          <a href="#mae" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#mae</a>
          <a href="#rmse" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#rmse</a>
          <a href="#bias" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#bias</a>
          <a href="#nmae" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#nmae</a>
          <a href="#p90" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#p90</a>
          <a href="#over-forecast-rate" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#over-forecast-rate</a>
          <a href="#why-not-mape" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#why-not-mape</a>
          <a href="#policies" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#policies</a>
          <a href="#cutoff" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#cutoff</a>
          <a href="#horizon" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#horizon</a>
          <a href="#hourly-grid" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#hourly-grid</a>
          <a href="#risk" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#risk</a>
          <a href="#firm-wind" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#firm-wind</a>
          <a href="#expected-wind" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#expected-wind</a>
          <a href="#calibration" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#calibration</a>
          <a href="#assumptions" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#assumptions</a>
          <a href="#caveats" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#caveats</a>
          <a href="#lineage" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#lineage</a>
          <a href="#ai-use" className="bg-white border border-[#111] px-2 py-1 hover:bg-[#FFE94A] transition-colors">#ai-use</a>
        </div>
      </nav>

      {/* Section 1: Error Sign Convention & Metric Definitions */}
      <section className="space-y-4">
        <h2 className="font-['Archivo_Black'] text-xl sm:text-2xl text-[#111] uppercase tracking-tight">
          1. Error Sign Convention & Core Metrics
        </h2>

        <div className="bg-[#FFF8E1] border-[3px] border-[#111] p-4 shadow-[4px_4px_0_#111]">
          <h3 className="font-['Space_Grotesk'] font-bold text-base text-[#111] mb-1">
            Sign Convention: Error = Forecast − Actual (MW)
          </h3>
          <p className="font-['Space_Mono'] text-xs sm:text-sm text-[#111] leading-relaxed">
            <strong>Positive error (&gt; 0):</strong> Over-forecast (generation was less than predicted). The buyer under-bought wind and is exposed to expensive balancing replacement.<br />
            <strong>Negative error (&lt; 0):</strong> Under-forecast (generation exceeded prediction). The buyer has spill or sells excess wind at lower cashout rates.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {METRIC_DEFINITIONS.map((m) => (
            <div
              key={m.id}
              id={m.id}
              className="bg-white border-[3px] border-[#111] p-4 shadow-[4px_4px_0_#111] space-y-2 scroll-mt-20"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-['Space_Grotesk'] font-bold text-base text-[#111]">
                  {m.name}
                </h4>
                <span className="text-[10px] font-['Space_Mono'] bg-[#111] text-white px-1.5 py-0.5">
                  #{m.id}
                </span>
              </div>
              <div className="bg-[#FFF8E1] border border-[#111] p-1.5 font-['Space_Mono'] text-xs font-bold text-[#111]">
                Formula: {m.formula}
              </div>
              <p className="text-xs font-['Space_Mono'] text-[#111]/80">
                {m.summary}
              </p>
              <p className="text-xs font-['Space_Mono'] text-[#111] border-t border-[#111]/20 pt-1 italic">
                {m.interpretation}
              </p>
            </div>
          ))}
        </div>

        {/* Why Not MAPE */}
        <div id="why-not-mape" className="bg-[#FF6B9E]/20 border-[3px] border-[#111] p-4 shadow-[4px_4px_0_#111] scroll-mt-20">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-['Archivo_Black'] text-base uppercase text-[#111]">
              {WHY_NOT_MAPE.title}
            </h3>
            <Sticker size="sm" color="pink">NO MAPE</Sticker>
          </div>
          <p className="font-['Space_Mono'] text-xs sm:text-sm text-[#111] leading-relaxed">
            {WHY_NOT_MAPE.rationale}
          </p>
        </div>
      </section>

      {/* Section 2: Selection Policies & Timeline Diagram */}
      <section id="policies" className="space-y-4 scroll-mt-20">
        <h2 className="font-['Archivo_Black'] text-xl sm:text-2xl text-[#111] uppercase tracking-tight">
          2. Selection Policies & Gate Closure
        </h2>

        <p className="font-['Space_Mono'] text-xs sm:text-sm text-[#111] leading-relaxed">
          Forecast selection models how a trading desk chooses which vintage of wind forecast to trade against without look-ahead bias or data leakage.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div id="cutoff" className="bg-white border-[3px] border-[#111] p-4 shadow-[4px_4px_0_#111] space-y-2 scroll-mt-20">
            <div className="flex items-center justify-between">
              <h3 className="font-['Space_Grotesk'] font-bold text-base text-[#111]">
                Policy B: Day-Ahead Gate Closure (Cutoff)
              </h3>
              <Sticker size="sm" color="yellow">HEADLINE</Sticker>
            </div>
            <p className="text-xs font-['Space_Mono'] text-[#111] leading-relaxed">
              For delivery day D, sets a decision gate closure time on D−1 (default <strong>09:00 London time</strong>). Selects the latest forecast run published on or before that boundary.
            </p>
          </div>

          <div id="horizon" className="bg-white border-[3px] border-[#111] p-4 shadow-[4px_4px_0_#111] space-y-2 scroll-mt-20">
            <div className="flex items-center justify-between">
              <h3 className="font-['Space_Grotesk'] font-bold text-base text-[#111]">
                Policy A: Fixed Lead-Time (Horizon)
              </h3>
              <Sticker size="sm" color="blue">ANALYTIC</Sticker>
            </div>
            <p className="text-xs font-['Space_Mono'] text-[#111] leading-relaxed">
              For every target hour, selects the latest forecast published at least <strong>H hours</strong> prior to delivery. Evaluates how accuracy degrades as lead time increases.
            </p>
          </div>
        </div>

        {/* Inline Neo-Brutalist SVG Timeline Diagram */}
        <div className="bg-white border-[3px] border-[#111] p-4 shadow-[6px_6px_0_#111] overflow-x-auto">
          <h3 className="font-['Space_Grotesk'] font-bold text-sm text-[#111] uppercase mb-2">
            Timeline Diagram: D−1 Decision Cutoff vs WINDFOR Runs
          </h3>

          <svg
            viewBox="0 0 800 240"
            className="w-full min-w-[650px] h-auto border-2 border-[#111] bg-[#FFF8E1]"
            role="img"
            aria-labelledby="timeline-svg-title timeline-svg-desc"
          >
            <title id="timeline-svg-title">UK Day-Ahead Wind Forecast Timeline Diagram</title>
            <desc id="timeline-svg-desc">
              Illustration showing WINDFOR publication runs at 02:30, 04:30, 07:30, 09:30 UTC on day D-1. The 09:00 cutoff selects the 07:30 run. Later runs are excluded to prevent look-ahead data leakage.
            </desc>

            {/* Background grids */}
            <rect x="20" y="20" width="360" height="200" fill="#FFFFFF" stroke="#111111" strokeWidth="2" />
            <text x="30" y="42" fontFamily="Space Grotesk" fontWeight="bold" fontSize="13" fill="#111111">
              DECISION DAY D−1
            </text>

            <rect x="400" y="20" width="380" height="200" fill="#FFFFFF" stroke="#111111" strokeWidth="2" />
            <text x="410" y="42" fontFamily="Space Grotesk" fontWeight="bold" fontSize="13" fill="#111111">
              DELIVERY DAY D (24 Target Hours)
            </text>

            {/* Timeline base bar */}
            <line x1="30" y1="120" x2="760" y2="120" stroke="#111111" strokeWidth="4" />

            {/* 02:30 Run */}
            <circle cx="80" cy="120" r="7" fill="#4D7CFE" stroke="#111111" strokeWidth="2" />
            <text x="80" y="145" textAnchor="middle" fontFamily="Space Mono" fontSize="10" fontWeight="bold" fill="#111111">02:30</text>

            {/* 04:30 Run */}
            <circle cx="150" cy="120" r="7" fill="#4D7CFE" stroke="#111111" strokeWidth="2" />
            <text x="150" y="145" textAnchor="middle" fontFamily="Space Mono" fontSize="10" fontWeight="bold" fill="#111111">04:30</text>

            {/* 07:30 Run (Selected) */}
            <rect x="210" y="105" width="30" height="30" fill="#FFE94A" stroke="#111111" strokeWidth="3" />
            <text x="225" y="148" textAnchor="middle" fontFamily="Space Mono" fontSize="10" fontWeight="bold" fill="#111111">07:30</text>
            <path d="M 225 100 L 225 70" stroke="#111111" strokeWidth="2" markerEnd="none" />
            <rect x="150" y="55" width="150" height="22" fill="#FFE94A" stroke="#111111" strokeWidth="1.5" />
            <text x="225" y="70" textAnchor="middle" fontFamily="Space Mono" fontSize="9" fontWeight="bold" fill="#111111">
              SELECTED RUN (07:30)
            </text>

            {/* 09:00 Cutoff Marker */}
            <line x1="280" y1="30" x2="280" y2="210" stroke="#FF6B9E" strokeWidth="3" strokeDasharray="6,4" />
            <rect x="245" y="175" width="70" height="24" fill="#FF6B9E" stroke="#111111" strokeWidth="2" />
            <text x="280" y="191" textAnchor="middle" fontFamily="Space Mono" fontSize="9" fontWeight="bold" fill="#111111">
              09:00 CUTOFF
            </text>

            {/* 09:30 Run (Excluded) */}
            <circle cx="325" cy="120" r="7" fill="#FF6B9E" stroke="#111111" strokeWidth="2" />
            <text x="325" y="145" textAnchor="middle" fontFamily="Space Mono" fontSize="10" fontWeight="bold" fill="#111111">09:30</text>
            <text x="325" y="160" textAnchor="middle" fontFamily="Space Mono" fontSize="8" fill="#FF6B9E" fontWeight="bold">EXCLUDED</text>

            {/* Target hours delivery bar */}
            <rect x="420" y="100" width="340" height="40" fill="#00C48C" stroke="#111111" strokeWidth="2" />
            <text x="590" y="125" textAnchor="middle" fontFamily="Space Grotesk" fontSize="11" fontWeight="bold" fill="#111111">
              TARGET DELIVERY HOURS 00:00 .. 23:00 UTC
            </text>
          </svg>
        </div>

        {/* Hourly Grid Alignment Anchor */}
        <div id="hourly-grid" className="bg-[#FFF8E1] border-2 border-[#111] p-3 text-xs font-['Space_Mono'] scroll-mt-20">
          <strong>Hourly Grid Alignment (ADR-011):</strong> WINDFOR targets are hourly (:00 boundaries). FUELHH actuals arrive half-hourly (:00 and :30). Hourly metrics match exactly on :00 timestamps without synthesizing or interpolating missing forecast intervals. Energy calculations use 1h durations (MWh = MW × 1h).
        </div>
      </section>

      {/* Section 3: Risk Method & Calibration */}
      <section id="risk" className="space-y-4 scroll-mt-20">
        <h2 className="font-['Archivo_Black'] text-xl sm:text-2xl text-[#111] uppercase tracking-tight">
          3. Quantified Risk, Firm Wind & Calibration
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div id="firm-wind" className="bg-white border-[3px] border-[#111] p-4 shadow-[4px_4px_0_#111] space-y-2 scroll-mt-20">
            <h3 className="font-['Space_Grotesk'] font-bold text-base text-[#111]">
              Firm Wind (Conservative Baseline)
            </h3>
            <div className="bg-[#FFF8E1] border border-[#111] p-1.5 font-['Space_Mono'] text-xs font-bold text-[#111]">
              firm_wind(t) = max(0, forecast(t) − quantile(error, q))
            </div>
            <p className="text-xs font-['Space_Mono'] text-[#111]/80 leading-relaxed">
              Subtracts the q-th quantile of trailing forecast errors from the forecast. This represents generation that actual wind will meet or exceed with probability approximately equal to q.
            </p>
          </div>

          <div id="expected-wind" className="bg-white border-[3px] border-[#111] p-4 shadow-[4px_4px_0_#111] space-y-2 scroll-mt-20">
            <h3 className="font-['Space_Grotesk'] font-bold text-base text-[#111]">
              Expected Wind (Bias-Adjusted Central)
            </h3>
            <div className="bg-[#FFF8E1] border border-[#111] p-1.5 font-['Space_Mono'] text-xs font-bold text-[#111]">
              expected_wind(t) = max(0, forecast(t) − median(error))
            </div>
            <p className="text-xs font-['Space_Mono'] text-[#111]/80 leading-relaxed">
              Subtracts the median error of the trailing sample to correct for systematic directional bias, providing an unbiased central expectation.
            </p>
          </div>
        </div>

        {/* Strict D-2 Rule */}
        <div className="bg-[#FFF8E1] border-[3px] border-[#111] p-4 shadow-[4px_4px_0_#111]">
          <h4 className="font-['Space_Grotesk'] font-bold text-sm text-[#111] uppercase mb-1">
            Strict D−2 Rule (Leakage Prevention)
          </h4>
          <p className="font-['Space_Mono'] text-xs sm:text-sm text-[#111] leading-relaxed">
            For delivery day D, the risk error sample contains delivery days strictly <strong>≤ D−2</strong>. Day D−1 is omitted because at the 09:00 D−1 decision cutoff, actuals for D−1 are still actively delivering. Incorporating D−1 data would introduce look-ahead leakage.
          </p>
        </div>

        {/* Live Calibration Sensitivity Tables */}
        <div id="calibration" className="bg-white border-[3px] border-[#111] p-4 shadow-[6px_6px_0_#111] space-y-4 scroll-mt-20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-[#111] pb-2">
            <h3 className="font-['Archivo_Black'] text-base uppercase text-[#111]">
              Backtest Calibration Sensitivity (Live API)
            </h3>
            <span className="text-xs font-['Space_Mono'] text-[#111]/70">
              Evaluated over January 2026 delivery days
            </span>
          </div>

          <p className="text-xs font-['Space_Mono'] text-[#111] leading-relaxed">
            A risk quantile q is calibrated if actual generation meets or exceeds firm wind in approximately q percent of evaluated hours. Default window (28 d) was chosen after seeing January 2026 results on one month of data (ADR-015).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Table A: Window Length Sensitivity (q = 0.90) */}
            <div className="border-2 border-[#111]">
              <div className="bg-[#FFF8E1] border-b-2 border-[#111] p-2 font-['Space_Grotesk'] font-bold text-xs">
                Window Length Sensitivity (Target q = 0.90)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-['Space_Mono'] text-xs">
                  <thead className="bg-[#111] text-white text-[11px]">
                    <tr>
                      <th className="p-2">Window (w)</th>
                      <th className="p-2">Target</th>
                      <th className="p-2">Realised</th>
                      <th className="p-2">Sample Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#111]">
                    {[
                      { w: 7, query: calW7 },
                      { w: 14, query: calW14 },
                      { w: 21, query: calW21 },
                      { w: 28, query: calW28 },
                    ].map(({ w, query }) => (
                      <tr key={w} className="hover:bg-[#FFF8E1]">
                        <td className="p-2 font-bold">{w} days</td>
                        <td className="p-2">90.0%</td>
                        <td className="p-2 font-bold">
                          {query.isLoading ? (
                            <Skeleton height={14} width={45} />
                          ) : query.data?.realised_coverage_pct != null ? (
                            `${query.data.realised_coverage_pct.toFixed(1)}%`
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="p-2 text-[#111]/80">
                          {query.data?.days ? query.data.days.reduce((acc, d) => acc + d.n, 0) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table B: Quantile Sensitivity (w = 28 days) */}
            <div className="border-2 border-[#111]">
              <div className="bg-[#FFF8E1] border-b-2 border-[#111] p-2 font-['Space_Grotesk'] font-bold text-xs">
                Quantile Sensitivity (Window w = 28 days)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-['Space_Mono'] text-xs">
                  <thead className="bg-[#111] text-white text-[11px]">
                    <tr>
                      <th className="p-2">Target Quantile (q)</th>
                      <th className="p-2">Target %</th>
                      <th className="p-2">Realised %</th>
                      <th className="p-2">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#111]">
                    {[
                      { q: 0.8, query: calQ80 },
                      { q: 0.9, query: calW28 },
                      { q: 0.95, query: calQ95 },
                    ].map(({ q, query }) => {
                      const realised = query.data?.realised_coverage_pct;
                      const targetPct = q * 100;
                      const diff = realised != null ? realised - targetPct : null;
                      return (
                        <tr key={q} className="hover:bg-[#FFF8E1]">
                          <td className="p-2 font-bold">{q.toFixed(2)}</td>
                          <td className="p-2">{targetPct.toFixed(1)}%</td>
                          <td className="p-2 font-bold">
                            {query.isLoading ? (
                              <Skeleton height={14} width={45} />
                            ) : realised != null ? (
                              `${realised.toFixed(1)}%`
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="p-2 font-bold">
                            {diff != null ? (
                              <span className={`px-1.5 py-0.5 rounded border border-[#111] text-[#111] font-bold ${diff >= 0 ? "bg-[#00C48C]" : "bg-[#FF6B9E]"}`}>
                                {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)} pts
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Assumptions & Caveats */}
      <section id="assumptions" className="space-y-4 scroll-mt-20">
        <h2 className="font-['Archivo_Black'] text-xl sm:text-2xl text-[#111] uppercase tracking-tight">
          4. Assumptions Log
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ASSUMPTIONS.map((a) => (
            <div key={a.id} className="bg-white border-[3px] border-[#111] p-4 shadow-[4px_4px_0_#111] space-y-2">
              <h3 className="font-['Space_Grotesk'] font-bold text-sm text-[#111]">
                {a.title}
              </h3>
              <p className="text-xs font-['Space_Mono'] text-[#111]/80 leading-relaxed">
                {a.rationale}
              </p>
              <div className="bg-[#FFF8E1] border border-[#111] p-1.5 text-[11px] font-['Space_Mono'] text-[#111]">
                <strong>Implementation:</strong> {a.implementation}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Caveats Section */}
      <section id="caveats" className="space-y-4 scroll-mt-20">
        <h2 className="font-['Archivo_Black'] text-xl sm:text-2xl text-[#111] uppercase tracking-tight">
          5. Practical Caveats & Limitations
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CAVEATS.map((c) => (
            <div key={c.id} className="bg-[#FFF8E1] border-[3px] border-[#111] p-4 shadow-[4px_4px_0_#111] space-y-1.5">
              <h3 className="font-['Space_Grotesk'] font-bold text-sm text-[#111]">
                {c.title}
              </h3>
              <p className="text-xs font-['Space_Mono'] text-[#111]/85 leading-relaxed">
                {c.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 6: Data Lineage */}
      <section id="lineage" className="space-y-4 scroll-mt-20">
        <h2 className="font-['Archivo_Black'] text-xl sm:text-2xl text-[#111] uppercase tracking-tight">
          6. Data Lineage & Provenance
        </h2>

        <div className="bg-white border-[3px] border-[#111] p-4 shadow-[6px_6px_0_#111] space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border-2 border-[#111] p-2 bg-[#FFF8E1]">
              <span className="text-[10px] font-['Space_Mono'] text-[#111]/60 block uppercase">Snapshot ID</span>
              <span className="font-['Space_Mono'] font-bold text-xs">{meta?.data.snapshot_id ?? "Loading..."}</span>
            </div>
            <div className="border-2 border-[#111] p-2 bg-[#FFF8E1]">
              <span className="text-[10px] font-['Space_Mono'] text-[#111]/60 block uppercase">Ingestion Timestamp</span>
              <span className="font-['Space_Mono'] font-bold text-xs">{meta?.data.ingested_at ?? "Loading..."}</span>
            </div>
            <div className="border-2 border-[#111] p-2 bg-[#FFF8E1]">
              <span className="text-[10px] font-['Space_Mono'] text-[#111]/60 block uppercase">App Version</span>
              <span className="font-['Space_Mono'] font-bold text-xs">{meta?.app_version ?? "v0.1.0"}</span>
            </div>
          </div>

          <div className="border-t-2 border-[#111] pt-3 text-xs font-['Space_Mono'] text-[#111] space-y-2">
            <p>
              <strong>Data Sources:</strong>
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>FUELHH (Actual Wind Generation):</strong> Elexon BMRS half-hourly fuel generation outturn stream. Filtered to FUEL_TYPE = &apos;WIND&apos;.{" "}
                <a
                  href="https://bmrs.elexon.co.uk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-bold text-[#111] hover:text-[#4D7CFE]"
                >
                  Elexon BMRS Portal ↗
                </a>
              </li>
              <li>
                <strong>WINDFOR (National Wind Forecast):</strong> Elexon BMRS published forecast stream. Hourly targets with 8 daily publication cycles.
              </li>
            </ul>

            <div className="bg-[#FFF8E1] border border-[#111] p-2 text-[11px] mt-2">
              <strong>Quality Counts:</strong> Raw rows processed: {String(meta?.data.quality["raw_rows"] ?? "—")}. Retrocast rows dropped: {String(meta?.data.quality["retrocast_rows_dropped"] ?? 0)} (informational; expected BMRS retrospective publication records). Missing forecast intervals: {String(meta?.data.quality["missing_forecast_rows"] ?? 0)}.
            </div>
          </div>
        </div>
      </section>

      {/* Section 7: AI Collaboration Disclosure */}
      <section id="ai" className="space-y-4 scroll-mt-20">
        <div id="ai-use" className="sr-only" />
        <h2 className="font-['Archivo_Black'] text-xl sm:text-2xl text-[#111] uppercase tracking-tight">
          7. AI Collaboration Disclosure
        </h2>

        <div className="bg-[#FFF8E1] border-[3px] border-[#111] p-4 shadow-[4px_4px_0_#111] space-y-3">
          <p className="font-['Space_Mono'] text-xs sm:text-sm text-[#111] leading-relaxed">
            {AI_DISCLOSURE.content}
          </p>
          <div className="pt-2 border-t border-[#111]/20 flex items-center justify-between text-xs font-['Space_Mono']">
            <span>Repository: windwatch (Full-Stack Take-Home Challenge)</span>
            <Link to="/" className="underline font-bold text-[#111] hover:text-[#4D7CFE]">
              ← Back to Overview
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default MethodologyPage;

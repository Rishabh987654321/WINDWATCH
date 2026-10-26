import React from "react";
import { Popover } from "../ui/Popover";
import { Sticker } from "../ui/Sticker";
import type { MetaResponse } from "../../api/types";

export interface QualityPopoverProps {
  meta?: MetaResponse;
  isLoading?: boolean;
}

export const QualityPopover: React.FC<QualityPopoverProps> = ({
  meta,
  isLoading,
}) => {
  if (isLoading || !meta) {
    return (
      <div className="font-mono text-xs font-bold px-3 py-1.5 bg-[#FFE94A] text-[#111] border-2 border-[#111] rounded shadow-[2px_2px_0_#111] animate-pulse">
        DATA: LOADING...
      </div>
    );
  }

  const d = meta.data;
  const q = (d.quality || {}) as Record<string, number | undefined>;
  const shortSnapshot = d.snapshot_id ? d.snapshot_id.slice(0, 16) + "…" : "unknown";

  const trigger = (
    <button
      type="button"
      aria-label={`DATA: JAN 2026 · ${shortSnapshot} — View data snapshot quality details`}
      className="inline-flex items-center gap-1.5 font-mono text-xs font-bold px-2.5 py-1 bg-[#FFE94A] text-[#111] border-2 border-[#111] rounded shadow-[2px_2px_0_#111] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#111]"
    >
      <span className="w-2 h-2 rounded-full bg-[#00C48C] border border-[#111]" />
      <span>DATA: JAN 2026</span>
      <span className="text-[#5A5A5A] hidden sm:inline">· {shortSnapshot}</span>
    </button>
  );

  return (
    <Popover trigger={trigger} align="right">
      <div className="space-y-3 font-['Space_Grotesk']">
        <div className="flex items-center justify-between border-b-2 border-[#111] pb-2">
          <h4 className="font-['Archivo_Black'] text-xs uppercase tracking-wide">
            Snapshot Quality & Lineage
          </h4>
          <Sticker size="sm" color="green" rotate={1}>
            FROZEN
          </Sticker>
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between items-center py-0.5 font-mono">
            <span className="text-[#5A5A5A]">Snapshot ID:</span>
            <span className="font-bold text-[11px] truncate max-w-[180px]" title={d.snapshot_id}>
              {d.snapshot_id}
            </span>
          </div>

          <div className="flex justify-between items-center py-0.5 font-mono">
            <span className="text-[#5A5A5A]">Ingested At:</span>
            <span className="font-bold">{d.ingested_at.slice(0, 19)}Z</span>
          </div>

          <div className="flex justify-between items-center py-0.5 font-mono">
            <span className="text-[#5A5A5A]">Reliable Horizon:</span>
            <span className="font-bold text-[#00C48C]">{d.reliable_horizon_hours} h (≥95%)</span>
          </div>

          <div className="flex justify-between items-center py-0.5 font-mono">
            <span className="text-[#5A5A5A]">Max Horizon:</span>
            <span className="font-bold">{d.max_horizon_hours} h</span>
          </div>
        </div>

        <div className="border-t border-[#111]/20 pt-2 space-y-1 text-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#5A5A5A] mb-1">
            Data Quality Audit
          </div>

          <div className="flex justify-between items-center py-0.5">
            <span>Missing Actual Periods:</span>
            <span className="font-mono font-bold">{q.missing_actual_periods ?? 0}</span>
          </div>

          <div className="flex justify-between items-center py-0.5">
            <span>Missing Forecast Hours:</span>
            <span className="font-mono font-bold">{q.missing_forecast_periods ?? 0}</span>
          </div>

          <div className="flex justify-between items-center py-0.5">
            <span>Duplicates Removed:</span>
            <span className="font-mono font-bold">{q.duplicates_removed ?? 0}</span>
          </div>

          <div className="flex justify-between items-center py-0.5">
            <span>Dropped Negative Gen:</span>
            <span className="font-mono font-bold">{q.dropped_negative ?? 0}</span>
          </div>

          <div className="flex justify-between items-center py-0.5 bg-[#FFF8E1] p-1.5 rounded border border-[#111]/30">
            <div>
              <span className="font-bold">Retrocast Rows Dropped:</span>
              <div className="text-[10px] text-[#5A5A5A]">Informational: BMRS publication artifact</div>
            </div>
            <span className="font-mono font-bold text-[#111]">
              {q.retrocast_rows_dropped ?? 360}
            </span>
          </div>
        </div>
      </div>
    </Popover>
  );
};

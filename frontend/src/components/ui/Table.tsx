import React from "react";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (item: T, index: number) => React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor?: (item: T, index: number) => string | number;
  caption?: string;
  className?: string;
}

export function Table<T extends object>({
  columns,
  data,
  keyExtractor,
  caption,
  className = "",
}: TableProps<T>): React.ReactElement {
  return (
    <div
      className={`overflow-x-auto border-[3px] border-[#111] rounded-lg shadow-[4px_4px_0_#111] bg-white ${className}`}
    >
      <table className="w-full text-left border-collapse font-['Space_Grotesk'] text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="sticky top-0 bg-[#FFE94A] text-[#111] border-b-[3px] border-[#111] z-10">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={`py-3 px-4 font-['Archivo_Black'] text-xs uppercase tracking-wider ${
                  col.align === "right"
                    ? "text-right"
                    : col.align === "center"
                    ? "text-center"
                    : "text-left"
                } ${col.className || ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="py-8 text-center text-[#5A5A5A] font-bold"
              >
                No records to display.
              </td>
            </tr>
          ) : (
            data.map((row, idx) => {
              const rowKey = keyExtractor ? keyExtractor(row, idx) : idx;
              const isEven = idx % 2 === 1;
              return (
                <tr
                  key={rowKey}
                  className={`border-b-2 border-[#111] transition-colors hover:bg-[#FFE94A]/20 ${
                    isEven ? "bg-[#FFF8E1]" : "bg-white"
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-2.5 px-4 font-medium tabular-nums ${
                        col.align === "right"
                          ? "text-right"
                          : col.align === "center"
                          ? "text-center"
                          : "text-left"
                      } ${col.className || ""}`}
                    >
                      {col.render
                        ? col.render(row, idx)
                        : ((row as Record<string, unknown>)[col.key] as React.ReactNode)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

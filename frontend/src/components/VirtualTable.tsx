import { FixedSizeList as List } from "react-window";

type Column<T> = { key: keyof T; label: string; width?: string };

export function VirtualTable<T extends Record<string, unknown>>({
  columns,
  rows,
  height = 420
}: {
  columns: Column<T>[];
  rows: T[];
  height?: number;
}) {
  return (
    <div className="tableWrap">
      <div className="thead">
        {columns.map((c) => (
          <div key={String(c.key)} style={{ width: c.width || "1fr" }}>
            {c.label}
          </div>
        ))}
      </div>
      <List height={height} itemCount={rows.length} itemSize={36} width="100%">
        {({ index, style }) => (
          <div className="trow" style={style}>
            {columns.map((c) => (
              <div key={String(c.key)}>{String(rows[index][c.key] ?? "")}</div>
            ))}
          </div>
        )}
      </List>
    </div>
  );
}
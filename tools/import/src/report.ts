import type { ImportContext } from "./context.ts";

export interface ReportJson {
  tables: { table: string; sources: string[]; read: number; written: number; skipped: number }[];
  skipped: { table: string; reason: string; count: number; samples: number[] }[];
  warnings: { table: string; reason: string; count: number; samples: number[] }[];
  unresolved: { from: string; field: string; target: string; count: number; samples: number[] }[];
  unmappedColumns: { table: string; columns: string[] }[];
  untouchedTables: string[];
  notes: string[];
}

export function reportToJson(ctx: ImportContext): ReportJson {
  const unmappedColumns: { table: string; columns: string[] }[] = [];
  const untouchedTables: string[] = [];

  for (const [table, info] of Object.entries(ctx.manifest.tables)) {
    const used = ctx.report.columnUsage.get(table);

    if (!used) {
      untouchedTables.push(table);
      continue;
    }

    if (info.rows === 0) continue;
    const columns = info.columns.map((column) => column.name).filter((name) => !used.has(name));

    if (columns.length > 0) unmappedColumns.push({ table, columns });
  }

  return {
    tables: [...ctx.report.tables].map(([table, counts]) => ({ table, ...counts })),
    skipped: [...ctx.report.skips.values()],
    warnings: [...ctx.report.warnings.values()],
    unresolved: [...ctx.report.unresolved.values()],
    unmappedColumns,
    untouchedTables: untouchedTables.sort(),
    notes: ctx.report.notes,
  };
}

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

export function renderReport(report: ReportJson, verbose: boolean): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("Counts per table");
  lines.push("  table                      read   written   skipped");
  let totalRead = 0;
  let totalWritten = 0;
  let totalSkipped = 0;

  for (const row of report.tables) {
    totalRead += row.read;
    totalWritten += row.written;
    totalSkipped += row.skipped;
    lines.push(`  ${row.table.padEnd(24)}${pad(row.read, 6)}${pad(row.written, 10)}${pad(row.skipped, 10)}`);
  }

  lines.push(`  ${"total".padEnd(24)}${pad(totalRead, 6)}${pad(totalWritten, 10)}${pad(totalSkipped, 10)}`);

  lines.push("");

  if (report.skipped.length === 0) {
    lines.push("Skipped rows: none");
  } else {
    lines.push("Skipped rows");

    for (const entry of report.skipped) {
      const samples = entry.samples.length > 0 ? ` (legacy ids ${entry.samples.join(", ")})` : "";
      lines.push(`  ${entry.table}: ${entry.reason} x${entry.count}${samples}`);
    }
  }

  lines.push("");

  if (report.warnings.length === 0) {
    lines.push("Degraded fields: none");
  } else {
    lines.push("Degraded fields (row imported, one field changed)");

    for (const entry of report.warnings) {
      const samples = entry.samples.length > 0 ? ` (legacy ids ${entry.samples.join(", ")})` : "";
      lines.push(`  ${entry.table}: ${entry.reason} x${entry.count}${samples}`);
    }
  }

  lines.push("");

  if (report.unresolved.length === 0) {
    lines.push("Unresolved references: none");
  } else {
    lines.push("Unresolved references");

    for (const entry of report.unresolved) {
      const samples = entry.samples.length > 0 ? ` (source rows ${entry.samples.join(", ")})` : "";
      lines.push(`  ${entry.from}.${entry.field} -> ${entry.target} x${entry.count}${samples}`);
    }
  }

  if (verbose) {
    lines.push("");
    lines.push("Columns present in the dump that the importer does not read");

    for (const entry of report.unmappedColumns) {
      lines.push(`  ${entry.table}: ${entry.columns.join(", ")}`);
    }

    lines.push("");
    lines.push(`Tables not read at all: ${report.untouchedTables.join(", ")}`);
  }

  if (report.notes.length > 0) {
    lines.push("");
    lines.push("Notes");

    for (const note of report.notes) lines.push(`  ${note}`);
  }

  lines.push("");

  return lines.join("\n");
}

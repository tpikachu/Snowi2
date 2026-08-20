// Dev-only view of the SQLite file. Renders nothing in a packaged build: the
// handlers behind it are not registered there.
//
// Deliberately NOT translated, against the project's i18n rule. These strings
// are unreachable in any shipped build, and forty keys of "Row limit" across
// ten locale files is churn that makes the real translations harder to review.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { SettingsPanel, SettingsPanelRow } from "../ui/SettingsSection";
import { Alert, AlertDescription } from "../ui/alert";
import { Database, ChevronLeft, ChevronRight, Play, RefreshCw } from "lucide-react";
import type {
  DevDbCell,
  DevDbPage,
  DevDbQueryResult,
  DevDbTable,
  DevDbTableList,
} from "../../types/electron";
import logger from "../../utils/logger";

const PAGE_SIZE = 25;

function Cell({ value }: { value: DevDbCell }) {
  if (value.kind === "null") {
    return <span className="italic text-muted-foreground/50">NULL</span>;
  }
  if (value.kind === "redacted") {
    return <span className="italic text-warning">{value.text}</span>;
  }
  if (value.kind === "blob") {
    return <span className="italic text-muted-foreground/70">blob, {value.text}</span>;
  }
  return (
    <span className="whitespace-pre-wrap break-words">
      {value.text}
      {value.truncated && (
        <span className="ml-1 italic text-muted-foreground/50">
          …{(value.full ?? 0) - value.text.length} more chars
        </span>
      )}
    </span>
  );
}

function ResultTable({ columns, rows }: { columns: string[]; rows: DevDbCell[][] }) {
  if (!rows.length) {
    return <p className="px-3 py-6 text-center text-xs text-muted-foreground">No rows.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left font-mono text-[11px]">
        <thead>
          <tr className="border-b border-border-subtle">
            {columns.map((column) => (
              <th
                key={column}
                className="whitespace-nowrap px-2 py-1.5 font-medium text-muted-foreground"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border-subtle/50 align-top last:border-0">
              {row.map((value, j) => (
                // Cells hold transcripts; without a max width one column
                // pushes every other off the screen.
                <td key={j} className="max-w-md px-2 py-1.5 text-foreground/80">
                  <Cell value={value} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DbExplorer() {
  const [schema, setSchema] = useState<DevDbTableList | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState<DevDbPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [sql, setSql] = useState("");
  const [queryResult, setQueryResult] = useState<DevDbQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSchema = useCallback(async () => {
    setBusy(true);
    try {
      const result = await window.electronAPI.devDb.listTables();
      if (!result.success || !result.data) {
        setError(result.error ?? "Could not read the schema.");
        return;
      }
      setSchema(result.data);
      setError(null);
    } catch (e) {
      logger.error("Dev DB schema load failed", { error: e }, "devDb");
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

  const loadPage = useCallback(async (table: string, nextOffset: number) => {
    setBusy(true);
    try {
      const result = await window.electronAPI.devDb.readTable(table, {
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      if (!result.success || !result.data) {
        setError(result.error ?? `Could not read ${table}.`);
        setPage(null);
        return;
      }
      setPage(result.data);
      setOffset(nextOffset);
      setError(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const selectTable = useCallback(
    (table: string) => {
      setSelected(table);
      setQueryResult(null);
      loadPage(table, 0);
    },
    [loadPage]
  );

  const runQuery = useCallback(async () => {
    if (!sql.trim()) return;
    setBusy(true);
    try {
      const result = await window.electronAPI.devDb.runQuery(sql, { limit: 100 });
      if (!result.success || !result.data) {
        setError(result.error ?? "Query failed.");
        setQueryResult(null);
        return;
      }
      setQueryResult(result.data);
      setPage(null);
      setSelected(null);
      setError(null);
    } finally {
      setBusy(false);
    }
  }, [sql]);

  // Populated first: which tables actually carry data is the fastest read on
  // how the app uses the schema.
  const tables = useMemo(() => {
    if (!schema) return [];
    return [...schema.tables].sort((a, b) => (b.rows ?? -1) - (a.rows ?? -1));
  }, [schema]);

  const totalPages = page ? Math.max(1, Math.ceil(page.total / PAGE_SIZE)) : 1;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-4">
      <SettingsPanel>
        <SettingsPanelRow>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Database className="h-3.5 w-3.5" />
                Database explorer
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Read-only. Opened on a separate connection, so a stray statement cannot write.
              </p>
              {schema && (
                <code className="mt-2 block break-all font-mono text-[10px] text-muted-foreground/70">
                  {schema.path} · user_version {schema.schemaVersion}
                </code>
              )}
            </div>
            <Button
              onClick={loadSchema}
              variant="ghost"
              size="sm"
              disabled={busy}
              className="shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </SettingsPanelRow>
      </SettingsPanel>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <SettingsPanel>
        <SettingsPanelRow>
          <div className="flex gap-2">
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runQuery();
              }}
              spellCheck={false}
              rows={3}
              placeholder="SELECT id, title, created_at FROM notes ORDER BY created_at DESC"
              className="min-w-0 flex-1 resize-y rounded-md border border-border/30 bg-foreground/3 px-2.5 py-2 font-mono text-[11px] text-foreground/80 outline-none placeholder:text-foreground/20 focus:border-primary/30 dark:bg-white/4"
            />
            <Button
              onClick={runQuery}
              variant="outline"
              size="sm"
              disabled={busy || !sql.trim()}
              className="shrink-0 self-start"
            >
              <Play className="mr-1.5 h-3 w-3" />
              Run
            </Button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground/70">
            ⌘/Ctrl+Enter to run. Writes are rejected by SQLite, not by a filter.
          </p>
        </SettingsPanelRow>
      </SettingsPanel>

      <div className="flex gap-3">
        <SettingsPanel className="max-h-[28rem] w-56 shrink-0 overflow-y-auto">
          <SettingsPanelRow>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Tables
            </p>
            <ul className="space-y-0.5">
              {tables.map((table: DevDbTable) => (
                <li key={table.name}>
                  <button
                    type="button"
                    onClick={() => selectTable(table.name)}
                    className={`flex w-full items-baseline justify-between gap-2 rounded px-1.5 py-1 text-left font-mono text-[11px] transition-colors ${
                      selected === table.name
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-foreground/5"
                    }`}
                  >
                    <span className="truncate">{table.name}</span>
                    <span
                      className={`shrink-0 tabular-nums ${
                        table.rows ? "text-foreground/60" : "text-muted-foreground/40"
                      }`}
                    >
                      {table.rows ?? "?"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </SettingsPanelRow>
        </SettingsPanel>

        <SettingsPanel className="min-w-0 flex-1">
          {queryResult && (
            <>
              <SettingsPanelRow>
                <p className="text-[10px] text-muted-foreground">
                  {queryResult.returned} row{queryResult.returned === 1 ? "" : "s"}
                  {queryResult.truncated && ` (stopped at ${queryResult.limit})`}
                </p>
              </SettingsPanelRow>
              <ResultTable columns={queryResult.columns} rows={queryResult.rows} />
            </>
          )}

          {page && (
            <>
              <SettingsPanelRow>
                {page.note && (
                  <p className="mb-2 rounded border border-warning/20 bg-warning/5 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                    {page.note}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[11px] text-foreground/70">
                    {page.table}
                    <span className="ml-2 text-muted-foreground">{page.total} rows</span>
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0"
                      disabled={busy || offset === 0}
                      onClick={() => loadPage(page.table, Math.max(0, offset - PAGE_SIZE))}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="min-w-16 text-center text-[10px] tabular-nums text-muted-foreground">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0"
                      disabled={busy || offset + PAGE_SIZE >= page.total}
                      onClick={() => loadPage(page.table, offset + PAGE_SIZE)}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </SettingsPanelRow>
              <ResultTable columns={page.columns} rows={page.rows} />
            </>
          )}

          {!page && !queryResult && (
            <SettingsPanelRow>
              <p className="py-8 text-center text-xs text-muted-foreground">
                Pick a table, or run a query.
              </p>
            </SettingsPanelRow>
          )}
        </SettingsPanel>
      </div>
    </div>
  );
}

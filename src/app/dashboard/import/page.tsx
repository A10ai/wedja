"use client";

import { useEffect, useState, useCallback, useRef, DragEvent } from "react";
import {
  Upload,
  Loader2,
  FileSpreadsheet,
  DollarSign,
  ShoppingBag,
  Receipt,
  Users,
  ScrollText,
  CheckCircle2,
  XCircle,
  FileUp,
  Clock,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────

interface ImportType {
  id: string;
  name: string;
  icon: string;
  required_fields: string[];
}

interface ImportHistoryEntry {
  id: string;
  date: string;
  type: string;
  fileName: string;
  rowsImported: number;
  status: "success" | "error";
  errors?: string[];
}

interface UploadResult {
  rows_imported: number;
  errors?: string[];
}

// ── Constants ───────────────────────────────────────────────

const FALLBACK_TYPES: ImportType[] = [
  {
    id: "rent_transactions",
    name: "Rent Transactions",
    icon: "DollarSign",
    required_fields: ["lease_id", "period_month", "period_year", "amount_due", "amount_paid", "status"],
  },
  {
    id: "tenant_sales",
    name: "Tenant Reported Sales",
    icon: "ShoppingBag",
    required_fields: ["tenant_id", "period_month", "period_year", "reported_revenue_egp"],
  },
  {
    id: "expenses",
    name: "Expenses",
    icon: "Receipt",
    required_fields: ["category", "amount_egp", "date", "description"],
  },
  {
    id: "tenants",
    name: "Tenants",
    icon: "Users",
    required_fields: ["name", "brand_name", "category", "contact_email"],
  },
  {
    id: "leases",
    name: "Leases",
    icon: "ScrollText",
    required_fields: ["unit_id", "tenant_id", "start_date", "end_date", "min_rent_monthly_egp", "percentage_rate"],
  },
];

const ICON_MAP: Record<string, React.ReactNode> = {
  DollarSign: <DollarSign className="w-5 h-5" />,
  ShoppingBag: <ShoppingBag className="w-5 h-5" />,
  Receipt: <Receipt className="w-5 h-5" />,
  Users: <Users className="w-5 h-5" />,
  ScrollText: <ScrollText className="w-5 h-5" />,
};

const ACCEPTED_EXTENSIONS = ".csv,.xlsx,.xls";
const HISTORY_KEY = "custis_import_history";

// ── Helpers ─────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

function loadHistory(): ImportHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: ImportHistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 50)));
  } catch {
    // localStorage full — ignore
  }
}

// ── Component ───────────────────────────────────────────────

export default function ImportPage() {
  const [importTypes, setImportTypes] = useState<ImportType[]>(FALLBACK_TYPES);
  const [selectedType, setSelectedType] = useState<string>("rent_transactions");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: string[][]; totalRows: number } | null>(null);
  const [excelMeta, setExcelMeta] = useState<{ name: string; size: string; type: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch import types ──────────────────────────────────
  useEffect(() => {
    async function fetchTypes() {
      try {
        const res = await fetch("/api/v1/import");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setImportTypes(data);
          }
        }
      } catch {
        // Use fallback types
      } finally {
        setLoadingTypes(false);
      }
    }
    fetchTypes();
  }, []);

  // ── Load history from localStorage ──────────────────────
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // ── CSV preview parser ──────────────────────────────────
  const parseCsvPreview = useCallback((text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return null;

    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const rows = lines.slice(1, 6).map((line) =>
      line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""))
    );
    return { headers, rows, totalRows: lines.length - 1 };
  }, []);

  // ── Handle file selection ───────────────────────────────
  const handleFile = useCallback(
    (f: File) => {
      setFile(f);
      setUploadResult(null);
      setUploadError(null);
      setCsvPreview(null);
      setExcelMeta(null);

      const ext = getFileExtension(f.name);

      if (ext === "csv") {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          const preview = parseCsvPreview(text);
          if (preview) setCsvPreview(preview);
        };
        reader.readAsText(f);
      } else {
        setExcelMeta({
          name: f.name,
          size: formatFileSize(f.size),
          type: ext.toUpperCase(),
        });
      }
    },
    [parseCsvPreview]
  );

  // ── Drag & Drop handlers ───────────────────────────────
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);

      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile) {
        const ext = getFileExtension(droppedFile.name);
        if (["csv", "xlsx", "xls"].includes(ext)) {
          handleFile(droppedFile);
        }
      }
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  // ── Upload handler ─────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!file || !selectedType) return;

    setUploading(true);
    setUploadResult(null);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", selectedType);

      const res = await fetch("/api/v1/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setUploadResult(data);

        const entry: ImportHistoryEntry = {
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          type: selectedType,
          fileName: file.name,
          rowsImported: data.rows_imported ?? 0,
          status: "success",
          errors: data.errors,
        };
        const updated = [entry, ...history];
        setHistory(updated);
        saveHistory(updated);
      } else {
        const msg = data.error || data.message || "Import failed";
        setUploadError(msg);

        const entry: ImportHistoryEntry = {
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          type: selectedType,
          fileName: file.name,
          rowsImported: 0,
          status: "error",
          errors: [msg],
        };
        const updated = [entry, ...history];
        setHistory(updated);
        saveHistory(updated);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  }, [file, selectedType, history]);

  // ── Clear file ─────────────────────────────────────────
  const clearFile = useCallback(() => {
    setFile(null);
    setCsvPreview(null);
    setExcelMeta(null);
    setUploadResult(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ── Clear history ──────────────────────────────────────
  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  const selectedTypeData = importTypes.find((t) => t.id === selectedType);

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Upload className="w-6 h-6 text-wedja-accent" />
          <h1 className="text-2xl font-semibold text-text-primary">JDE Data Import</h1>
        </div>
        <p className="text-sm text-text-secondary ml-9">
          Import rent transactions, tenant sales, and expenses from JD Edwards
        </p>
      </div>

      {/* ── Import Type Selector ────────────────────────────── */}
      <div>
        <h2 className="text-sm font-medium text-text-muted uppercase tracking-wider mb-3">
          Select Import Type
        </h2>
        {loadingTypes ? (
          <div className="flex items-center gap-2 text-text-muted text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading import types...
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {importTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => setSelectedType(type.id)}
                className={cn(
                  "rounded-xl border p-4 text-left transition-all",
                  selectedType === type.id
                    ? "border-wedja-accent bg-wedja-accent-muted"
                    : "border-wedja-border bg-wedja-card hover:border-wedja-accent/40"
                )}
              >
                <div
                  className={cn(
                    "mb-2",
                    selectedType === type.id ? "text-wedja-accent" : "text-text-muted"
                  )}
                >
                  {ICON_MAP[type.icon] || <FileSpreadsheet className="w-5 h-5" />}
                </div>
                <p
                  className={cn(
                    "text-sm font-medium mb-2",
                    selectedType === type.id ? "text-text-primary" : "text-text-secondary"
                  )}
                >
                  {type.name}
                </p>
                <div className="flex flex-wrap gap-1">
                  {type.required_fields.slice(0, 3).map((field) => (
                    <span
                      key={field}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-wedja-bg text-text-muted"
                    >
                      {field}
                    </span>
                  ))}
                  {type.required_fields.length > 3 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-wedja-bg text-text-muted">
                      +{type.required_fields.length - 3} more
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── File Drop Zone ──────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-medium text-text-muted uppercase tracking-wider mb-3">
          Upload File
        </h2>
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "relative min-h-[200px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all",
            dragging
              ? "border-amber-500 bg-amber-500/10"
              : file
                ? "border-wedja-accent/50 bg-wedja-accent-muted/30"
                : "border-wedja-border hover:border-wedja-accent/40 bg-wedja-card"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            onChange={handleInputChange}
            className="hidden"
          />

          {file ? (
            <div className="text-center px-4">
              <FileSpreadsheet className="w-10 h-10 text-wedja-accent mx-auto mb-3" />
              <p className="text-sm font-medium text-text-primary mb-1">{file.name}</p>
              <p className="text-xs text-text-muted">
                {formatFileSize(file.size)} &middot; {getFileExtension(file.name).toUpperCase()}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
                className="mt-3 text-xs text-text-muted hover:text-red-400 transition-colors"
              >
                Remove file
              </button>
            </div>
          ) : (
            <div className="text-center px-4">
              <FileUp
                className={cn(
                  "w-10 h-10 mx-auto mb-3",
                  dragging ? "text-amber-500" : "text-text-muted"
                )}
              />
              <p className="text-sm text-text-secondary mb-1">
                Drop your CSV or Excel file here
              </p>
              <p className="text-xs text-text-muted">
                or{" "}
                <span className="text-wedja-accent underline underline-offset-2">
                  click to browse
                </span>
              </p>
              <p className="text-[10px] text-text-muted mt-2">
                Supports .csv, .xlsx, .xls
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Preview Section ─────────────────────────────────── */}
      {file && (csvPreview || excelMeta) && !uploadResult && !uploadError && (
        <Card className="border-wedja-border bg-wedja-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-text-primary">File Preview</h3>
              <div className="flex items-center gap-3">
                {csvPreview && (
                  <span className="text-xs text-text-muted">
                    {csvPreview.totalRows} row{csvPreview.totalRows !== 1 ? "s" : ""} detected
                  </span>
                )}
                <Button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="bg-wedja-accent hover:bg-wedja-accent-hover text-black text-sm px-5"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    "Import"
                  )}
                </Button>
              </div>
            </div>

            {csvPreview && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-wedja-border">
                      {csvPreview.headers.map((header, i) => (
                        <th
                          key={i}
                          className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-wedja-border/50">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-5 py-3 text-text-secondary">
                            {cell || <span className="text-text-muted italic">empty</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvPreview.totalRows > 5 && (
                  <p className="text-xs text-text-muted mt-2 px-5">
                    Showing first 5 of {csvPreview.totalRows} rows
                  </p>
                )}
              </div>
            )}

            {excelMeta && (
              <div className="flex items-center gap-4 p-4 rounded-lg bg-wedja-bg">
                <FileSpreadsheet className="w-8 h-8 text-wedja-accent shrink-0" />
                <div>
                  <p className="text-sm font-medium text-text-primary">{excelMeta.name}</p>
                  <p className="text-xs text-text-muted">
                    {excelMeta.size} &middot; {excelMeta.type} file &mdash; preview available after import
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Upload Progress & Results ───────────────────────── */}
      {uploading && (
        <Card className="border-wedja-border bg-wedja-card">
          <CardContent className="p-8 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-wedja-accent animate-spin" />
            <p className="text-sm text-text-secondary">Uploading and processing file...</p>
          </CardContent>
        </Card>
      )}

      {uploadResult && (
        <Card className="border-emerald-500/40 bg-emerald-500/10">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-400">
                  {uploadResult.rows_imported} row{uploadResult.rows_imported !== 1 ? "s" : ""} imported
                  successfully
                </p>
                {uploadResult.errors && uploadResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-text-muted mb-1">Warnings:</p>
                    <ul className="space-y-1">
                      {uploadResult.errors.map((err, i) => (
                        <li key={i} className="text-xs text-amber-400">
                          &bull; {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {uploadError && (
        <Card className="border-red-500/40 bg-red-500/10">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-400">Import Failed</p>
                <p className="text-xs text-text-muted mt-1">{uploadError}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Import History ──────────────────────────────────── */}
      {history.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-text-muted uppercase tracking-wider">
              Import History
            </h2>
            <button
              onClick={clearHistory}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          </div>
          <Card className="border-wedja-border bg-wedja-card">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-wedja-border">
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Date
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Type
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        File
                      </th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Rows
                      </th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <tr key={entry.id} className="border-b border-wedja-border/50">
                        <td className="px-5 py-3 text-text-muted">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5" />
                            {new Date(entry.date).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-text-secondary capitalize">
                          {entry.type.replace(/_/g, " ")}
                        </td>
                        <td className="px-5 py-3 text-text-secondary font-mono text-xs">
                          {entry.fileName}
                        </td>
                        <td className="px-5 py-3 text-right text-text-secondary">
                          {entry.rowsImported.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Badge variant={entry.status === "success" ? "success" : "error"}>
                            {entry.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

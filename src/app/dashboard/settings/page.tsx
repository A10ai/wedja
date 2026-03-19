"use client";

import { useEffect, useState } from "react";
import {
  Settings,
  Loader2,
  Upload,
  CheckCircle2,
  AlertCircle,
  Building2,
  FileUp,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  total_area_sqm: number;
  floors: number;
  year_established: number;
  operating_hours: string;
  status: string;
  currency: string;
}

interface ImportResult {
  imported: number;
  errors: string[];
  total_rows: number;
}

const IMPORT_TYPES = [
  { value: "tenants", label: "Tenants" },
  { value: "leases", label: "Leases" },
  { value: "sales", label: "Sales Data" },
  { value: "rent", label: "Rent Transactions" },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"property" | "import">("property");
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Import state
  const [importType, setImportType] = useState("tenants");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Property form state
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    city: "",
    country: "",
    total_area_sqm: 0,
    floors: 0,
    year_established: 0,
    operating_hours: "",
    currency: "",
  });

  useEffect(() => {
    async function fetchProperty() {
      try {
        const res = await fetch("/api/v1/properties");
        const data = await res.json();
        setProperty(data);
        setFormData({
          name: data.name || "",
          address: data.address || "",
          city: data.city || "",
          country: data.country || "",
          total_area_sqm: data.total_area_sqm || 0,
          floors: data.floors || 0,
          year_established: data.year_established || 0,
          operating_hours: data.operating_hours || "",
          currency: data.currency || "EGP",
        });
      } catch {
        // Handled by empty state
      } finally {
        setLoading(false);
      }
    }
    fetchProperty();
  }, []);

  const handleSaveProperty = async () => {
    if (!property) return;
    setSaving(true);
    setSaveMsg("");

    try {
      const res = await fetch("/api/v1/properties", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: property.id, ...formData }),
      });

      if (res.ok) {
        setSaveMsg("Property updated successfully");
      } else {
        const err = await res.json();
        setSaveMsg(`Error: ${err.error}`);
      }
    } catch {
      setSaveMsg("Failed to save");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3000);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("type", importType);

      const res = await fetch("/api/v1/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setImportResult(data);
      } else {
        setImportResult({
          imported: 0,
          errors: [data.error || "Import failed"],
          total_rows: 0,
        });
      }
    } catch {
      setImportResult({
        imported: 0,
        errors: ["Import failed"],
        total_rows: 0,
      });
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-custis-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <Settings size={28} className="text-custis-gold" />
          Settings
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Property configuration and data management
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-custis-border">
        <button
          onClick={() => setActiveTab("property")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "property"
              ? "text-custis-gold border-custis-gold"
              : "text-text-muted border-transparent hover:text-text-primary"
          }`}
        >
          <span className="flex items-center gap-2">
            <Building2 size={14} /> Property Settings
          </span>
        </button>
        <button
          onClick={() => setActiveTab("import")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "import"
              ? "text-custis-gold border-custis-gold"
              : "text-text-muted border-transparent hover:text-text-primary"
          }`}
        >
          <span className="flex items-center gap-2">
            <FileUp size={14} /> Data Import
          </span>
        </button>
      </div>

      {/* Property Settings Tab */}
      {activeTab === "property" && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">
              Property Information
            </h2>
            {saveMsg && (
              <Badge variant={saveMsg.startsWith("Error") ? "error" : "success"}>
                {saveMsg}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
              <Input
                label="Property Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              <Input
                label="Address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
              <Input
                label="City"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
              <Input
                label="Country"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              />
              <Input
                label="Total Area (sqm)"
                type="number"
                value={formData.total_area_sqm.toString()}
                onChange={(e) =>
                  setFormData({ ...formData, total_area_sqm: parseFloat(e.target.value) || 0 })
                }
              />
              <Input
                label="Floors"
                type="number"
                value={formData.floors.toString()}
                onChange={(e) =>
                  setFormData({ ...formData, floors: parseInt(e.target.value) || 0 })
                }
              />
              <Input
                label="Year Established"
                type="number"
                value={formData.year_established.toString()}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    year_established: parseInt(e.target.value) || 0,
                  })
                }
              />
              <Input
                label="Operating Hours"
                value={formData.operating_hours}
                onChange={(e) =>
                  setFormData({ ...formData, operating_hours: e.target.value })
                }
              />
              <Input
                label="Currency"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              />
            </div>
            <div className="mt-6">
              <Button onClick={handleSaveProperty} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Import Tab */}
      {activeTab === "import" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text-primary">
                CSV Data Import
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-text-secondary">
                Upload a CSV file to import data. The first row must contain column
                headers matching the required fields.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-text-secondary">
                    Data Type
                  </label>
                  <select
                    value={importType}
                    onChange={(e) => setImportType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-custis-bg border border-custis-border text-text-primary focus:outline-none focus:ring-2 focus:ring-custis-gold"
                  >
                    {IMPORT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-text-secondary">
                    CSV File
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-text-primary file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-custis-gold file:text-white hover:file:bg-custis-gold-hover file:cursor-pointer"
                  />
                </div>
              </div>

              <Button
                onClick={handleImport}
                disabled={!importFile || importing}
              >
                {importing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Import
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Import Results */}
          {importResult && (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-text-primary">
                  Import Results
                </h2>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  {importResult.imported > 0 ? (
                    <CheckCircle2 size={20} className="text-status-success" />
                  ) : (
                    <AlertCircle size={20} className="text-status-error" />
                  )}
                  <div>
                    <p className="text-sm text-text-primary">
                      <span className="font-semibold">{importResult.imported}</span>{" "}
                      of {importResult.total_rows} rows imported successfully
                    </p>
                  </div>
                </div>

                {importResult.errors.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-medium text-status-error">
                      Errors ({importResult.errors.length}):
                    </p>
                    <div className="max-h-40 overflow-y-auto space-y-1 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                      {importResult.errors.map((err, i) => (
                        <p key={i} className="text-xs text-status-error">
                          {err}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* CSV format guides */}
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text-primary">
                CSV Format Guide
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-custis-gold mb-1">Tenants</p>
                <code className="text-xs text-text-secondary bg-custis-bg p-2 rounded block overflow-x-auto">
                  name,brand_name,category,brand_type,contact_name,contact_email,contact_phone
                </code>
              </div>
              <div>
                <p className="text-xs font-semibold text-custis-gold mb-1">Leases</p>
                <code className="text-xs text-text-secondary bg-custis-bg p-2 rounded block overflow-x-auto">
                  unit_id,tenant_id,start_date,end_date,min_rent_monthly_egp,percentage_rate,security_deposit_egp,escalation_rate,status
                </code>
              </div>
              <div>
                <p className="text-xs font-semibold text-custis-gold mb-1">Sales Data</p>
                <code className="text-xs text-text-secondary bg-custis-bg p-2 rounded block overflow-x-auto">
                  lease_id,tenant_id,period_month,period_year,reported_revenue_egp,submission_date
                </code>
              </div>
              <div>
                <p className="text-xs font-semibold text-custis-gold mb-1">
                  Rent Transactions
                </p>
                <code className="text-xs text-text-secondary bg-custis-bg p-2 rounded block overflow-x-auto">
                  lease_id,period_month,period_year,min_rent_due,percentage_rent_due,amount_due,amount_paid,payment_date,status
                </code>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

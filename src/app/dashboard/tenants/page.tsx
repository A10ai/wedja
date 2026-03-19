"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Store, Search, Loader2, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";

interface Tenant {
  id: string;
  name: string;
  brand_name: string;
  category: string;
  brand_type: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  status: string;
  active_lease: {
    id: string;
    unit_id: string;
    status: string;
    min_rent_monthly_egp: number;
    percentage_rate: number;
    unit: {
      id: string;
      name: string;
      unit_number: string;
      zone: { id: string; name: string } | null;
    } | null;
  } | null;
}

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "fashion", label: "Fashion" },
  { value: "food", label: "Food & Beverage" },
  { value: "electronics", label: "Electronics" },
  { value: "services", label: "Services" },
  { value: "entertainment", label: "Entertainment" },
  { value: "grocery", label: "Grocery" },
];

const categoryVariant: Record<string, "gold" | "success" | "warning" | "info" | "error" | "default"> = {
  fashion: "gold",
  food: "warning",
  electronics: "info",
  services: "success",
  entertainment: "info",
  grocery: "success",
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (category) params.set("category", category);
      const res = await fetch(`/api/v1/tenants?${params.toString()}`);
      const data = await res.json();
      setTenants(Array.isArray(data) ? data : []);
    } catch {
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, category]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Store size={28} className="text-custis-gold" />
            Tenants
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Tenant directory, brands, and contact information
          </p>
        </div>
        <Button size="sm">
          <Plus size={16} />
          Add Tenant
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <Input
                placeholder="Search tenants, brands..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm bg-custis-bg border border-custis-border text-text-primary focus:outline-none focus:ring-2 focus:ring-custis-gold"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Tenant count */}
      <p className="text-xs text-text-muted">
        {tenants.length} tenant{tenants.length !== 1 ? "s" : ""} found
      </p>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={28} className="animate-spin text-custis-gold" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-custis-border">
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                      Brand
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden sm:table-cell">
                      Category
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">
                      Unit
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden lg:table-cell">
                      Zone
                    </th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">
                      Monthly Rent
                    </th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant, i) => (
                    <tr
                      key={tenant.id}
                      className={`border-b border-custis-border/50 hover:bg-custis-border/20 cursor-pointer transition-colors ${
                        i % 2 === 1 ? "bg-custis-border/10" : ""
                      }`}
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/dashboard/tenants/${tenant.id}`}
                          className="hover:text-custis-gold"
                        >
                          <p className="font-medium text-text-primary">
                            {tenant.brand_name}
                          </p>
                          <p className="text-xs text-text-muted">{tenant.name}</p>
                        </Link>
                      </td>
                      <td className="px-5 py-3 hidden sm:table-cell">
                        <Badge variant={categoryVariant[tenant.category] || "default"}>
                          {tenant.category}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell font-mono text-text-secondary text-xs">
                        {tenant.active_lease?.unit?.unit_number || (
                          <span className="text-text-muted italic">No unit</span>
                        )}
                      </td>
                      <td className="px-5 py-3 hidden lg:table-cell text-text-secondary text-xs">
                        {tenant.active_lease?.unit?.zone?.name || "-"}
                      </td>
                      <td className="px-5 py-3 text-right hidden md:table-cell font-mono text-text-primary">
                        {tenant.active_lease
                          ? formatCurrency(tenant.active_lease.min_rent_monthly_egp)
                          : "-"}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <Badge
                          variant={tenant.status === "active" ? "success" : "error"}
                        >
                          {tenant.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {tenants.length === 0 && !loading && (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-text-muted">
                        No tenants found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

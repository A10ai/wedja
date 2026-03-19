"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DollarSign,
  Building2,
  Store,
  Users,
  Wrench,
  AlertTriangle,
  Loader2,
  ArrowRight,
  FileText,
  Settings,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, formatPercentage } from "@/lib/utils";

interface DashboardStats {
  total_revenue_egp: number;
  occupancy_rate: number;
  active_tenants: number;
  total_units: number;
  occupied_units: number;
  vacant_units: number;
  maintenance_units: number;
  overdue_rent_count: number;
  open_maintenance: number;
  recent_transactions: Array<{
    id: string;
    period_month: number;
    period_year: number;
    amount_due: number;
    amount_paid: number;
    payment_date: string | null;
    status: string;
    lease: {
      id: string;
      tenant: { brand_name: string } | null;
      unit: { unit_number: string; name: string } | null;
    } | null;
  }>;
  discrepancies_found: number;
  footfall_today: number;
}

const MONTH_NAMES = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const statusVariant: Record<string, "success" | "warning" | "error" | "default"> = {
  paid: "success",
  partial: "warning",
  overdue: "error",
  waived: "default",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/v1/dashboard/stats");
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-wedja-accent" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="text-center py-12">
        <p className="text-status-error text-sm">{error || "Failed to load"}</p>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Revenue",
      value: formatCurrency(stats.total_revenue_egp),
      icon: DollarSign,
      color: "text-wedja-accent",
    },
    {
      label: "Occupancy Rate",
      value: formatPercentage(stats.occupancy_rate),
      icon: Building2,
      color: "text-status-success",
    },
    {
      label: "Active Tenants",
      value: stats.active_tenants.toString(),
      icon: Store,
      color: "text-status-info",
    },
    {
      label: "Footfall Today",
      value: stats.footfall_today > 0 ? formatNumber(stats.footfall_today) : "No data",
      icon: Users,
      color: "text-text-secondary",
    },
    {
      label: "Open Maintenance",
      value: stats.open_maintenance.toString(),
      icon: Wrench,
      color: stats.open_maintenance > 0 ? "text-status-warning" : "text-status-success",
    },
    {
      label: "Discrepancies",
      value: stats.discrepancies_found.toString(),
      icon: AlertTriangle,
      color: stats.discrepancies_found > 0 ? "text-status-error" : "text-status-success",
    },
  ];

  const quickLinks = [
    { label: "Tenants", href: "/dashboard/tenants", icon: Store },
    { label: "Leases", href: "/dashboard/leases", icon: FileText },
    { label: "Revenue", href: "/dashboard/revenue", icon: DollarSign },
    { label: "Property", href: "/dashboard/property", icon: Building2 },
    { label: "Maintenance", href: "/dashboard/maintenance", icon: Wrench },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-muted mt-1">
          Senzo Mall, Hurghada &mdash; Property overview and key metrics
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="flex items-start justify-between py-5">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-bold text-text-primary font-mono">
                    {stat.value}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-wedja-accent-muted">
                  <Icon size={20} className={stat.color} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Unit status summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-lg font-bold text-status-success font-mono">
              {stats.occupied_units}
            </p>
            <p className="text-xs text-text-muted">Occupied</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-lg font-bold text-status-warning font-mono">
              {stats.vacant_units}
            </p>
            <p className="text-xs text-text-muted">Vacant</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-lg font-bold text-status-error font-mono">
              {stats.maintenance_units}
            </p>
            <p className="text-xs text-text-muted">Maintenance</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Transactions */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-text-primary">
                Recent Rent Transactions
              </h2>
              <Link
                href="/dashboard/revenue"
                className="text-xs text-wedja-accent hover:text-wedja-accent-hover flex items-center gap-1"
              >
                View all <ArrowRight size={12} />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-wedja-border">
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Tenant
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Period
                      </th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Paid
                      </th>
                      <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recent_transactions.map((tx, i) => (
                      <tr
                        key={tx.id}
                        className={`border-b border-wedja-border/50 hover:bg-wedja-border/20 ${
                          i % 2 === 1 ? "bg-wedja-border/10" : ""
                        }`}
                      >
                        <td className="px-5 py-3 text-text-primary font-medium">
                          {tx.lease?.tenant?.brand_name || "Unknown"}
                          <span className="block text-xs text-text-muted">
                            {tx.lease?.unit?.unit_number}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-text-secondary">
                          {MONTH_NAMES[tx.period_month]} {tx.period_year}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-text-primary">
                          {formatCurrency(tx.amount_paid)}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <Badge variant={statusVariant[tx.status] || "default"}>
                            {tx.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {stats.recent_transactions.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-5 py-8 text-center text-text-muted text-sm"
                        >
                          No recent transactions
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">
              Quick Links
            </h2>
          </CardHeader>
          <CardContent className="space-y-1">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:text-wedja-accent hover:bg-wedja-accent-muted transition-colors"
                >
                  <Icon size={16} />
                  {link.label}
                  <ArrowRight size={14} className="ml-auto opacity-50" />
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

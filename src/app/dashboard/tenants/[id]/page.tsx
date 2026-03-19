"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Store,
  Loader2,
  ArrowLeft,
  Mail,
  Phone,
  User,
  FileText,
  DollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";

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
}

interface Lease {
  id: string;
  unit_id: string;
  status: string;
  min_rent_monthly_egp: number;
  percentage_rate: number;
  security_deposit_egp: number;
  escalation_rate: number;
  start_date: string;
  end_date: string;
  unit: {
    id: string;
    name: string;
    unit_number: string;
    area_sqm: number;
    zone: { id: string; name: string } | null;
  } | null;
}

interface SalesReport {
  id: string;
  period_month: number;
  period_year: number;
  reported_revenue_egp: number;
  submission_date: string;
  verified: boolean;
}

interface RentTransaction {
  id: string;
  period_month: number;
  period_year: number;
  amount_due: number;
  amount_paid: number;
  payment_date: string | null;
  status: string;
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
  active: "success",
  expired: "error",
  terminated: "error",
  pending: "warning",
};

const categoryVariant: Record<string, "gold" | "success" | "warning" | "info" | "default"> = {
  fashion: "gold",
  food: "warning",
  electronics: "info",
  services: "success",
  entertainment: "info",
  grocery: "success",
};

export default function TenantDetailPage() {
  const params = useParams();
  const tenantId = params.id as string;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [sales, setSales] = useState<SalesReport[]>([]);
  const [rentHistory, setRentHistory] = useState<RentTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [tenantsRes, leasesRes] = await Promise.all([
          fetch(`/api/v1/tenants?search=`),
          fetch(`/api/v1/leases?tenant_id=${tenantId}`),
        ]);

        const tenantsData = await tenantsRes.json();
        const tenantFound = (Array.isArray(tenantsData) ? tenantsData : []).find(
          (t: Tenant) => t.id === tenantId
        );
        setTenant(tenantFound || null);

        const leasesData = await leasesRes.json();
        setLeases(Array.isArray(leasesData) ? leasesData : []);

        // Fetch rent transactions for all leases
        const leaseIds = (Array.isArray(leasesData) ? leasesData : []).map(
          (l: Lease) => l.id
        );

        if (leaseIds.length > 0) {
          const txRes = await fetch(
            `/api/v1/rent-transactions?lease_id=${leaseIds[0]}`
          );
          const txData = await txRes.json();
          setRentHistory(Array.isArray(txData) ? txData : []);
        }

        // Fetch sales reports (from the tenant_sales_reported table via a custom approach)
        // We don't have a dedicated API for this yet, so we'll leave it empty
        setSales([]);
      } catch {
        // Handled by empty state
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [tenantId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-custis-gold" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/tenants"
          className="text-sm text-custis-gold hover:text-custis-gold-hover flex items-center gap-1"
        >
          <ArrowLeft size={14} /> Back to Tenants
        </Link>
        <div className="text-center py-12">
          <p className="text-text-muted text-sm">Tenant not found</p>
        </div>
      </div>
    );
  }

  const activeLease = leases.find((l) => l.status === "active");

  // Revenue per sqm calculation
  const totalRevenue = rentHistory.reduce(
    (sum, tx) => sum + (tx.amount_paid || 0),
    0
  );
  const unitArea = activeLease?.unit?.area_sqm || 0;
  const revenuePerSqm = unitArea > 0 ? totalRevenue / unitArea : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back */}
      <Link
        href="/dashboard/tenants"
        className="text-sm text-custis-gold hover:text-custis-gold-hover flex items-center gap-1 w-fit"
      >
        <ArrowLeft size={14} /> Back to Tenants
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Store size={28} className="text-custis-gold" />
            {tenant.brand_name}
          </h1>
          <p className="text-sm text-text-muted mt-1">{tenant.name}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={categoryVariant[tenant.category] || "default"}>
            {tenant.category}
          </Badge>
          <Badge variant={tenant.status === "active" ? "success" : "error"}>
            {tenant.status}
          </Badge>
          <Badge variant="default">{tenant.brand_type}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tenant Info */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <User size={14} /> Contact Information
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wider">Contact Person</p>
              <p className="text-sm text-text-primary font-medium">{tenant.contact_name || "N/A"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Mail size={14} className="text-text-muted" />
              <p className="text-sm text-text-primary">{tenant.contact_email || "N/A"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Phone size={14} className="text-text-muted" />
              <p className="text-sm text-text-primary">{tenant.contact_phone || "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        {/* Active Lease */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <FileText size={14} /> Active Lease
            </h2>
            {activeLease && (
              <Badge variant={statusVariant[activeLease.status] || "default"}>
                {activeLease.status}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {activeLease ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider">Unit</p>
                  <p className="text-sm font-mono text-text-primary">
                    {activeLease.unit?.unit_number} - {activeLease.unit?.name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider">Zone</p>
                  <p className="text-sm text-text-primary">
                    {activeLease.unit?.zone?.name || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider">Area</p>
                  <p className="text-sm font-mono text-text-primary">
                    {activeLease.unit?.area_sqm || 0} sqm
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider">Min. Monthly Rent</p>
                  <p className="text-sm font-mono font-semibold text-custis-gold">
                    {formatCurrency(activeLease.min_rent_monthly_egp)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider">Percentage Rate</p>
                  <p className="text-sm font-mono text-text-primary">
                    {activeLease.percentage_rate}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider">Escalation</p>
                  <p className="text-sm font-mono text-text-primary">
                    {activeLease.escalation_rate}% / year
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider">Start Date</p>
                  <p className="text-sm text-text-primary">{formatDate(activeLease.start_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider">End Date</p>
                  <p className="text-sm text-text-primary">{formatDate(activeLease.end_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wider">Deposit</p>
                  <p className="text-sm font-mono text-text-primary">
                    {formatCurrency(activeLease.security_deposit_egp)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-text-muted text-sm py-4">No active lease</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Performance Summary */}
      {activeLease && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-lg font-bold text-custis-gold font-mono">
                {formatCurrency(totalRevenue)}
              </p>
              <p className="text-xs text-text-muted">Total Rent Collected</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-lg font-bold text-text-primary font-mono">
                {rentHistory.length}
              </p>
              <p className="text-xs text-text-muted">Payments Recorded</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-lg font-bold text-status-info font-mono">
                {revenuePerSqm > 0 ? formatCurrency(Math.round(revenuePerSqm)) : "N/A"}
              </p>
              <p className="text-xs text-text-muted">Revenue / sqm</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 text-center">
              <p className="text-lg font-bold text-status-error font-mono">
                {rentHistory.filter((t) => t.status === "overdue").length}
              </p>
              <p className="text-xs text-text-muted">Overdue Payments</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rent Payment History */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <DollarSign size={14} /> Rent Payment History
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-custis-border">
                  <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Period</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Due</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Paid</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Date</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {rentHistory.map((tx, i) => (
                  <tr
                    key={tx.id}
                    className={`border-b border-custis-border/50 ${
                      i % 2 === 1 ? "bg-custis-border/10" : ""
                    }`}
                  >
                    <td className="px-5 py-3 text-text-primary font-medium">
                      {MONTH_NAMES[tx.period_month]} {tx.period_year}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-text-secondary">
                      {formatCurrency(tx.amount_due)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-text-primary">
                      {formatCurrency(tx.amount_paid)}
                    </td>
                    <td className="px-5 py-3 text-text-secondary">
                      {tx.payment_date ? formatDate(tx.payment_date) : "-"}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <Badge variant={statusVariant[tx.status] || "default"}>
                        {tx.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {rentHistory.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-text-muted">
                      No payment history
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Reported Sales */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-text-primary">
            Reported Sales History
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          {sales.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-custis-border">
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Period</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Revenue</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Submitted</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale, i) => (
                    <tr
                      key={sale.id}
                      className={`border-b border-custis-border/50 ${
                        i % 2 === 1 ? "bg-custis-border/10" : ""
                      }`}
                    >
                      <td className="px-5 py-3 text-text-primary">
                        {MONTH_NAMES[sale.period_month]} {sale.period_year}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-text-primary">
                        {formatCurrency(sale.reported_revenue_egp)}
                      </td>
                      <td className="px-5 py-3 text-text-secondary">
                        {formatDate(sale.submission_date)}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <Badge variant={sale.verified ? "success" : "warning"}>
                          {sale.verified ? "Verified" : "Pending"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-text-muted text-sm">
              No sales reports submitted yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

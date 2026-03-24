"use client";

import { useEffect, useState, useCallback } from "react";
import {
  MessageSquare,
  Loader2,
  Send,
  AlertTriangle,
  CalendarClock,
  Mail,
  Smartphone,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatNumber, formatDate, timeAgo, cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────

interface OverviewData {
  overdue_count: number;
  total_overdue_egp: number;
  expiring_leases: number;
  messages_sent: number;
}

interface OverdueTenant {
  tenant_id: string;
  brand_name: string;
  unit_number: string;
  overdue_count: number;
  total_overdue_egp: number;
  oldest_month: string;
}

interface RenewalTenant {
  tenant_id: string;
  brand_name: string;
  unit_number: string;
  lease_end_date: string;
  days_remaining: number;
  monthly_rent_egp: number;
}

interface MessageTemplate {
  id: string;
  name: string;
  type: string;
  subject: string;
  body: string;
}

interface ActiveTenant {
  id: string;
  name: string;
  brand_name: string;
}

interface MessageHistory {
  id: string;
  tenant_name: string;
  subject: string;
  channel: string;
  status: string;
  created_at: string;
}

type TabKey = "overdue" | "renewals" | "send";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overdue", label: "Overdue Payments" },
  { key: "renewals", label: "Lease Renewals" },
  { key: "send", label: "Send Message" },
];

// ── Main Page ───────────────────────────────────────────────

export default function CommunicationsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overdue");
  const [loading, setLoading] = useState(true);

  // Overview
  const [overview, setOverview] = useState<OverviewData | null>(null);

  // Tab data
  const [overdueList, setOverdueList] = useState<OverdueTenant[]>([]);
  const [renewalsList, setRenewalsList] = useState<RenewalTenant[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [activeTenants, setActiveTenants] = useState<ActiveTenant[]>([]);
  const [history, setHistory] = useState<MessageHistory[]>([]);

  // Send form
  const [sendTenantId, setSendTenantId] = useState("");
  const [sendTemplateId, setSendTemplateId] = useState("");
  const [sendChannel, setSendChannel] = useState<"email" | "sms" | "whatsapp">("email");
  const [sendSubject, setSendSubject] = useState("");
  const [sendBody, setSendBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Loading states per tab
  const [overdueLoaded, setOverdueLoaded] = useState(false);
  const [renewalsLoaded, setRenewalsLoaded] = useState(false);
  const [sendLoaded, setSendLoaded] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // ── Fetch overview + initial tab ──────────────────────────

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/communications?type=overview");
      const data = await res.json();
      setOverview(data);
    } catch {
      setOverview(null);
    }
  }, []);

  const fetchOverdue = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/communications?type=overdue");
      const data = await res.json();
      setOverdueList(Array.isArray(data) ? data : []);
    } catch {
      setOverdueList([]);
    } finally {
      setOverdueLoaded(true);
    }
  }, []);

  const fetchRenewals = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/communications?type=renewals");
      const data = await res.json();
      setRenewalsList(Array.isArray(data) ? data : []);
    } catch {
      setRenewalsList([]);
    } finally {
      setRenewalsLoaded(true);
    }
  }, []);

  const fetchSendData = useCallback(async () => {
    try {
      const [tenantsRes, templatesRes] = await Promise.all([
        fetch("/api/v1/tenants?status=active"),
        fetch("/api/v1/communications?type=templates"),
      ]);
      const tenantsData = await tenantsRes.json();
      const templatesData = await templatesRes.json();
      setActiveTenants(Array.isArray(tenantsData) ? tenantsData : []);
      setTemplates(Array.isArray(templatesData) ? templatesData : []);
    } catch {
      setActiveTenants([]);
      setTemplates([]);
    } finally {
      setSendLoaded(true);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/communications?type=history");
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoaded(true);
    }
  }, []);

  // Initial load
  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([fetchOverview(), fetchOverdue(), fetchHistory()]);
      setLoading(false);
    }
    init();
  }, [fetchOverview, fetchOverdue, fetchHistory]);

  // Load tab data on demand
  useEffect(() => {
    if (activeTab === "renewals" && !renewalsLoaded) {
      fetchRenewals();
    }
    if (activeTab === "send" && !sendLoaded) {
      fetchSendData();
    }
  }, [activeTab, renewalsLoaded, sendLoaded, fetchRenewals, fetchSendData]);

  // ── Template selection auto-fill ──────────────────────────

  function handleTemplateChange(templateId: string) {
    setSendTemplateId(templateId);
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      setSendSubject(tpl.subject);
      setSendBody(tpl.body);
    }
  }

  // ── Pre-fill send form from action buttons ────────────────

  function openSendWithTemplate(tenantId: string, templateType: string) {
    setActiveTab("send");
    setSendTenantId(tenantId);
    // Load send data if not yet loaded
    if (!sendLoaded) {
      fetchSendData().then(() => {
        const tpl = templates.find((t) => t.type === templateType);
        if (tpl) {
          setSendTemplateId(tpl.id);
          setSendSubject(tpl.subject);
          setSendBody(tpl.body);
        }
      });
    } else {
      const tpl = templates.find((t) => t.type === templateType);
      if (tpl) {
        setSendTemplateId(tpl.id);
        setSendSubject(tpl.subject);
        setSendBody(tpl.body);
      }
    }
  }

  // ── Send message ──────────────────────────────────────────

  async function handleSend() {
    if (!sendTenantId || !sendSubject || !sendBody) {
      setSendFeedback({ type: "error", message: "Please fill in all required fields." });
      return;
    }

    setSending(true);
    setSendFeedback(null);

    try {
      const res = await fetch("/api/v1/communications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: sendTenantId,
          template_id: sendTemplateId || undefined,
          channel: sendChannel,
          subject: sendSubject,
          body: sendBody,
        }),
      });

      if (res.ok) {
        setSendFeedback({ type: "success", message: "Message sent successfully." });
        setSendSubject("");
        setSendBody("");
        setSendTemplateId("");
        setSendTenantId("");
        // Refresh history and overview
        fetchHistory();
        fetchOverview();
      } else {
        const err = await res.json().catch(() => ({}));
        setSendFeedback({
          type: "error",
          message: err.error || "Failed to send message. Please try again.",
        });
      }
    } catch {
      setSendFeedback({ type: "error", message: "Network error. Please try again." });
    } finally {
      setSending(false);
    }
  }

  // ── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-wedja-accent" size={32} />
      </div>
    );
  }

  const overviewCards = [
    {
      label: "Overdue Payments",
      value: overview?.overdue_count ?? 0,
      format: "number" as const,
      color: (overview?.overdue_count ?? 0) > 0 ? "text-red-500" : "text-text-primary",
      icon: AlertTriangle,
    },
    {
      label: "Total Overdue",
      value: overview?.total_overdue_egp ?? 0,
      format: "currency" as const,
      color: (overview?.total_overdue_egp ?? 0) > 0 ? "text-red-500" : "text-text-primary",
      icon: AlertTriangle,
    },
    {
      label: "Expiring Leases",
      value: overview?.expiring_leases ?? 0,
      format: "number" as const,
      color: "text-amber-500",
      icon: CalendarClock,
    },
    {
      label: "Messages Sent",
      value: overview?.messages_sent ?? 0,
      format: "number" as const,
      color: "text-text-primary",
      icon: Send,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <MessageSquare size={24} className="text-wedja-accent" />
          <h1 className="text-2xl font-bold text-text-primary">Tenant Communications</h1>
        </div>
        <p className="text-sm text-text-secondary mt-1">
          Payment reminders, notices, and tenant outreach
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {overviewCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-text-muted uppercase tracking-wider">{card.label}</p>
                    <p className={cn("text-xl font-bold mt-1", card.color)}>
                      {card.format === "currency"
                        ? formatCurrency(card.value)
                        : formatNumber(card.value)}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-wedja-accent-muted">
                    <Icon size={20} className="text-wedja-accent" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "bg-wedja-accent-muted text-wedja-accent"
                  : "text-text-secondary hover:text-text-primary hover:bg-wedja-border/30"
              )}
            >
              {tab.label}
              {tab.key === "overdue" && overdueList.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded-full font-bold">
                  {overdueList.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "overdue" && (
        <Card>
          <CardHeader className="px-5 py-4">
            <h2 className="text-lg font-semibold text-text-primary">Overdue Payments</h2>
          </CardHeader>
          <CardContent className="p-0">
            {!overdueLoaded ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-wedja-accent" size={24} />
              </div>
            ) : overdueList.length === 0 ? (
              <div className="text-center py-12 text-text-muted">
                <AlertTriangle size={32} className="mx-auto mb-2 opacity-40" />
                <p>No overdue payments found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-wedja-border bg-wedja-bg/50">
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Tenant
                      </th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden sm:table-cell">
                        Overdue Count
                      </th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Total Overdue
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">
                        Oldest Month
                      </th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueList.map((tenant) => (
                      <tr
                        key={tenant.tenant_id}
                        className="border-b border-wedja-border/30 hover:bg-wedja-accent-muted/20 transition-colors"
                      >
                        <td className="px-5 py-3">
                          <div className="font-medium text-text-primary">{tenant.brand_name}</div>
                          <div className="text-xs text-text-muted">Unit {tenant.unit_number}</div>
                        </td>
                        <td className="text-right px-5 py-3 hidden sm:table-cell">
                          <Badge variant="error">{tenant.overdue_count}</Badge>
                        </td>
                        <td className="text-right px-5 py-3 font-medium text-red-500">
                          {formatCurrency(tenant.total_overdue_egp)}
                        </td>
                        <td className="px-5 py-3 text-text-secondary hidden md:table-cell">
                          {tenant.oldest_month}
                        </td>
                        <td className="text-right px-5 py-3">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              openSendWithTemplate(tenant.tenant_id, "payment_reminder")
                            }
                          >
                            <Send size={12} />
                            Send Reminder
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "renewals" && (
        <Card>
          <CardHeader className="px-5 py-4">
            <h2 className="text-lg font-semibold text-text-primary">Lease Renewals</h2>
          </CardHeader>
          <CardContent className="p-0">
            {!renewalsLoaded ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-wedja-accent" size={24} />
              </div>
            ) : renewalsList.length === 0 ? (
              <div className="text-center py-12 text-text-muted">
                <CalendarClock size={32} className="mx-auto mb-2 opacity-40" />
                <p>No leases expiring within 90 days.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-wedja-border bg-wedja-bg/50">
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Tenant
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden sm:table-cell">
                        Lease End
                      </th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Days Remaining
                      </th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider hidden md:table-cell">
                        Monthly Rent
                      </th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {renewalsList.map((tenant) => {
                      let daysColor = "text-emerald-500";
                      let daysBadge: "success" | "warning" | "error" = "success";
                      if (tenant.days_remaining < 30) {
                        daysColor = "text-red-500";
                        daysBadge = "error";
                      } else if (tenant.days_remaining < 60) {
                        daysColor = "text-amber-500";
                        daysBadge = "warning";
                      }

                      return (
                        <tr
                          key={tenant.tenant_id}
                          className="border-b border-wedja-border/30 hover:bg-wedja-accent-muted/20 transition-colors"
                        >
                          <td className="px-5 py-3">
                            <div className="font-medium text-text-primary">{tenant.brand_name}</div>
                            <div className="text-xs text-text-muted">Unit {tenant.unit_number}</div>
                          </td>
                          <td className="px-5 py-3 text-text-secondary hidden sm:table-cell">
                            {formatDate(tenant.lease_end_date)}
                          </td>
                          <td className="text-right px-5 py-3">
                            <Badge variant={daysBadge}>
                              {tenant.days_remaining} days
                            </Badge>
                          </td>
                          <td className="text-right px-5 py-3 font-medium text-text-primary hidden md:table-cell">
                            {formatCurrency(tenant.monthly_rent_egp)}
                          </td>
                          <td className="text-right px-5 py-3">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                openSendWithTemplate(tenant.tenant_id, "lease_renewal")
                              }
                            >
                              <Send size={12} />
                              Send Notice
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "send" && (
        <Card>
          <CardHeader className="px-5 py-4">
            <h2 className="text-lg font-semibold text-text-primary">Compose Message</h2>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {!sendLoaded ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-wedja-accent" size={24} />
              </div>
            ) : (
              <>
                {/* Tenant selector */}
                <div>
                  <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">
                    Tenant
                  </label>
                  <select
                    value={sendTenantId}
                    onChange={(e) => setSendTenantId(e.target.value)}
                    className="w-full rounded-lg border border-wedja-border bg-wedja-card px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-wedja-accent/50"
                  >
                    <option value="">Select a tenant...</option>
                    {activeTenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.brand_name || t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Template selector */}
                <div>
                  <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">
                    Template
                  </label>
                  <select
                    value={sendTemplateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className="w-full rounded-lg border border-wedja-border bg-wedja-card px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-wedja-accent/50"
                  >
                    <option value="">No template (compose manually)</option>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Channel selector */}
                <div>
                  <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">
                    Channel
                  </label>
                  <div className="flex items-center gap-2">
                    {([
                      { key: "email" as const, label: "Email", icon: Mail },
                      { key: "sms" as const, label: "SMS", icon: Smartphone },
                      { key: "whatsapp" as const, label: "WhatsApp", icon: MessageSquare },
                    ]).map(({ key, label, icon: ChIcon }) => (
                      <button
                        key={key}
                        onClick={() => setSendChannel(key)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border",
                          sendChannel === key
                            ? "bg-wedja-accent-muted text-wedja-accent border-wedja-accent/30"
                            : "text-text-secondary border-wedja-border hover:text-text-primary hover:bg-wedja-border/30"
                        )}
                      >
                        <ChIcon size={14} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">
                    Subject
                  </label>
                  <Input
                    value={sendSubject}
                    onChange={(e) => setSendSubject(e.target.value)}
                    placeholder="Message subject..."
                  />
                </div>

                {/* Body */}
                <div>
                  <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1.5">
                    Body
                  </label>
                  <textarea
                    value={sendBody}
                    onChange={(e) => setSendBody(e.target.value)}
                    rows={6}
                    placeholder="Write your message..."
                    className="w-full rounded-lg border border-wedja-border bg-wedja-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-wedja-accent/50 resize-y"
                  />
                </div>

                {/* Feedback */}
                {sendFeedback && (
                  <div
                    className={cn(
                      "px-4 py-3 rounded-lg text-sm font-medium",
                      sendFeedback.type === "success"
                        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                        : "bg-red-500/10 text-red-500 border border-red-500/20"
                    )}
                  >
                    {sendFeedback.message}
                  </div>
                )}

                {/* Send button */}
                <div className="flex justify-end">
                  <Button onClick={handleSend} disabled={sending}>
                    {sending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                    {sending ? "Sending..." : "Send Message"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Communications */}
      <Card>
        <CardHeader className="px-5 py-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-text-muted" />
            <h2 className="text-lg font-semibold text-text-primary">Recent Communications</h2>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!historyLoaded ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-wedja-accent" size={24} />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-text-muted">
              <MessageSquare size={32} className="mx-auto mb-2 opacity-40" />
              <p>No communications sent yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-wedja-border/30">
              {history.map((msg) => (
                <div
                  key={msg.id}
                  className="flex items-center justify-between px-5 py-3 hover:bg-wedja-accent-muted/10 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-text-primary truncate">
                        {msg.subject}
                      </span>
                      <Badge
                        variant={
                          msg.status === "sent"
                            ? "success"
                            : msg.status === "failed"
                            ? "error"
                            : msg.status === "pending"
                            ? "warning"
                            : "default"
                        }
                      >
                        {msg.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-text-muted">{msg.tenant_name}</span>
                      <span className="text-xs text-text-muted">·</span>
                      <span className="text-xs text-text-muted capitalize">{msg.channel}</span>
                    </div>
                  </div>
                  <span className="text-xs text-text-muted whitespace-nowrap ml-4">
                    {timeAgo(msg.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

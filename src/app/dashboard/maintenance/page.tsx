"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Wrench,
  Loader2,
  Plus,
  X,
  ChevronDown,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { timeAgo } from "@/lib/utils";

interface Ticket {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  reported_by: string | null;
  assigned_to: string | null;
  estimated_cost_egp: number | null;
  actual_cost_egp: number | null;
  created_at: string;
  resolved_at: string | null;
  zone: { name: string } | null;
  unit: { unit_number: string; name: string } | null;
}

const STATUSES = ["all", "open", "assigned", "in_progress", "completed", "cancelled"];
const PRIORITIES = ["all", "emergency", "urgent", "high", "normal", "low"];
const CATEGORIES = [
  "all",
  "hvac",
  "electrical",
  "plumbing",
  "elevator",
  "escalator",
  "cleaning",
  "structural",
  "other",
];

const priorityBadge: Record<string, "error" | "warning" | "gold" | "default" | "info"> = {
  emergency: "error",
  urgent: "error",
  high: "warning",
  normal: "default",
  low: "info",
};

const statusBadge: Record<string, "error" | "warning" | "success" | "default" | "info" | "gold"> = {
  open: "warning",
  assigned: "info",
  in_progress: "gold",
  on_hold: "default",
  completed: "success",
  cancelled: "default",
};

export default function MaintenancePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [newTicket, setNewTicket] = useState({
    title: "",
    description: "",
    category: "other",
    priority: "normal",
  });
  const [creating, setCreating] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);

      const res = await fetch(`/api/v1/maintenance?${params}`);
      if (!res.ok) throw new Error("Failed to fetch tickets");
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, categoryFilter]);

  useEffect(() => {
    setLoading(true);
    fetchTickets();
  }, [fetchTickets]);

  const createTicket = async () => {
    if (!newTicket.title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/v1/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTicket),
      });
      if (!res.ok) throw new Error("Failed to create ticket");
      setShowNewForm(false);
      setNewTicket({ title: "", description: "", category: "other", priority: "normal" });
      fetchTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch("/api/v1/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_status", id, status }),
      });
      fetchTickets();
      if (selectedTicket?.id === id) {
        setSelectedTicket(null);
      }
    } catch {
      // Silent
    }
  };

  const statCounts = {
    total: tickets.length,
    open: tickets.filter((t) => ["open", "assigned", "in_progress"].includes(t.status)).length,
    urgent: tickets.filter((t) => t.priority === "urgent" || t.priority === "emergency").length,
    completed: tickets.filter((t) => t.status === "completed").length,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Wrench size={28} className="text-wedja-accent" />
            Maintenance
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Tickets, assignments, and facility management
          </p>
        </div>
        <Button onClick={() => setShowNewForm(true)} size="sm">
          <Plus size={16} />
          New Ticket
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: statCounts.total, color: "text-text-primary" },
          {
            label: "Open",
            value: statCounts.open,
            color: statCounts.open > 0 ? "text-status-warning" : "text-status-success",
          },
          {
            label: "Urgent",
            value: statCounts.urgent,
            color: statCounts.urgent > 0 ? "text-status-error" : "text-status-success",
          },
          { label: "Completed", value: statCounts.completed, color: "text-status-success" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="py-3 text-center">
              <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-xs text-text-muted">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: "Status", value: statusFilter, setter: setStatusFilter, options: STATUSES },
          { label: "Priority", value: priorityFilter, setter: setPriorityFilter, options: PRIORITIES },
          { label: "Category", value: categoryFilter, setter: setCategoryFilter, options: CATEGORIES },
        ].map((filter) => (
          <div key={filter.label} className="relative">
            <select
              value={filter.value}
              onChange={(e) => filter.setter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm bg-wedja-bg border border-wedja-border text-text-primary focus:outline-none focus:ring-2 focus:ring-wedja-accent cursor-pointer"
            >
              {filter.options.map((opt) => (
                <option key={opt} value={opt}>
                  {filter.label}: {opt === "all" ? "All" : opt.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
          </div>
        ))}
      </div>

      {/* New ticket form */}
      {showNewForm && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-text-primary">
              New Maintenance Ticket
            </h2>
            <button
              onClick={() => setShowNewForm(false)}
              className="text-text-muted hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Title"
              value={newTicket.title}
              onChange={(e) =>
                setNewTicket({ ...newTicket, title: e.target.value })
              }
              placeholder="Brief description of the issue"
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-secondary">
                Description
              </label>
              <textarea
                value={newTicket.description}
                onChange={(e) =>
                  setNewTicket({ ...newTicket, description: e.target.value })
                }
                placeholder="Detailed description..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm bg-wedja-bg border border-wedja-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-wedja-accent"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-text-secondary">
                  Category
                </label>
                <select
                  value={newTicket.category}
                  onChange={(e) =>
                    setNewTicket({ ...newTicket, category: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg text-sm bg-wedja-bg border border-wedja-border text-text-primary focus:outline-none focus:ring-2 focus:ring-wedja-accent"
                >
                  {CATEGORIES.filter((c) => c !== "all").map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-text-secondary">
                  Priority
                </label>
                <select
                  value={newTicket.priority}
                  onChange={(e) =>
                    setNewTicket({ ...newTicket, priority: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg text-sm bg-wedja-bg border border-wedja-border text-text-primary focus:outline-none focus:ring-2 focus:ring-wedja-accent"
                >
                  {PRIORITIES.filter((p) => p !== "all").map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowNewForm(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={createTicket}
                disabled={creating || !newTicket.title.trim()}
              >
                {creating && <Loader2 size={14} className="animate-spin" />}
                Create Ticket
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center h-32">
          <Loader2 size={24} className="animate-spin text-wedja-accent" />
        </div>
      )}

      {error && !loading && (
        <div className="text-center py-8 text-status-error text-sm">{error}</div>
      )}

      {/* Ticket list */}
      {!loading && !error && (
        <Card>
          <CardContent className="p-0">
            {tickets.length === 0 ? (
              <div className="py-12 text-center text-text-muted text-sm">
                No tickets match the current filters
              </div>
            ) : (
              <div className="divide-y divide-wedja-border/50">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="px-5 py-4 hover:bg-wedja-border/10 transition-colors cursor-pointer"
                    onClick={() =>
                      setSelectedTicket(
                        selectedTicket?.id === ticket.id ? null : ticket
                      )
                    }
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={priorityBadge[ticket.priority] || "default"}>
                            {ticket.priority}
                          </Badge>
                          <Badge variant={statusBadge[ticket.status] || "default"}>
                            {ticket.status.replace(/_/g, " ")}
                          </Badge>
                          <Badge variant="default">{ticket.category}</Badge>
                        </div>
                        <h3 className="text-sm font-medium text-text-primary">
                          {ticket.title}
                        </h3>
                        {ticket.description && (
                          <p className="text-xs text-text-muted mt-1 line-clamp-1">
                            {ticket.description}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-1 text-xs text-text-muted">
                          <Clock size={12} />
                          {timeAgo(ticket.created_at)}
                        </div>
                        {ticket.zone && (
                          <p className="text-xs text-text-muted mt-0.5">
                            {ticket.zone.name}
                          </p>
                        )}
                        {ticket.unit && (
                          <p className="text-xs text-text-muted">
                            Unit {ticket.unit.unit_number}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {selectedTicket?.id === ticket.id && (
                      <div className="mt-4 pt-3 border-t border-wedja-border/50">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-text-muted">Description:</span>
                            <p className="text-text-secondary mt-0.5">
                              {ticket.description || "No description"}
                            </p>
                          </div>
                          <div className="space-y-1">
                            {ticket.assigned_to && (
                              <p>
                                <span className="text-text-muted">Assigned to: </span>
                                <span className="text-text-primary">{ticket.assigned_to}</span>
                              </p>
                            )}
                            {ticket.estimated_cost_egp && (
                              <p>
                                <span className="text-text-muted">Est. cost: </span>
                                <span className="text-text-primary font-mono">
                                  EGP {ticket.estimated_cost_egp.toLocaleString()}
                                </span>
                              </p>
                            )}
                            {ticket.resolved_at && (
                              <p>
                                <span className="text-text-muted">Resolved: </span>
                                <span className="text-text-primary">
                                  {timeAgo(ticket.resolved_at)}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                        {ticket.status !== "completed" &&
                          ticket.status !== "cancelled" && (
                            <div className="flex gap-2 mt-3">
                              {ticket.status === "open" && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateStatus(ticket.id, "assigned");
                                  }}
                                >
                                  Assign
                                </Button>
                              )}
                              {(ticket.status === "assigned" ||
                                ticket.status === "open") && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateStatus(ticket.id, "in_progress");
                                  }}
                                >
                                  Start Work
                                </Button>
                              )}
                              {ticket.status === "in_progress" && (
                                <Button
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateStatus(ticket.id, "completed");
                                  }}
                                >
                                  Complete
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateStatus(ticket.id, "cancelled");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

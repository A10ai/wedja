import { SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/notifications";

// ============================================================
// Wedja Event Bus — Cross-system event processing
// ============================================================

export type EventType =
  | "lease.expiring"
  | "lease.expired"
  | "lease.renewed"
  | "rent.paid"
  | "rent.overdue"
  | "rent.partial"
  | "tenant.underreporting"
  | "tenant.performance_drop"
  | "footfall.spike"
  | "footfall.drop"
  | "energy.waste_detected"
  | "energy.spike"
  | "maintenance.created"
  | "maintenance.resolved"
  | "anomaly.detected"
  | "anomaly.critical"
  | "campaign.started"
  | "campaign.ended"
  | "occupancy.threshold";

export type SourceSystem =
  | "revenue-engine"
  | "footfall-engine"
  | "energy-engine"
  | "contract-engine"
  | "tenant-analytics"
  | "anomaly-engine"
  | "notifications"
  | "maintenance"
  | "marketing"
  | "event-bus"
  | "manual";

export interface SystemEvent {
  id: string;
  type: EventType;
  source_system: SourceSystem | string;
  payload: Record<string, unknown>;
  processed: boolean;
  results: HandlerResult[];
  created_at: string;
}

export interface HandlerResult {
  handler: string;
  success: boolean;
  message: string;
  timestamp: string;
}

type EventHandler = (
  event: {
    type: EventType;
    source_system: string;
    payload: Record<string, unknown>;
  },
  supabase: SupabaseClient
) => Promise<HandlerResult>;

// ── Handler Registry ────────────────────────────────────────

const handlerRegistry = new Map<EventType, Array<{ name: string; handler: EventHandler }>>();

export function registerHandler(
  eventType: EventType,
  name: string,
  handler: EventHandler
): void {
  const existing = handlerRegistry.get(eventType) || [];
  existing.push({ name, handler });
  handlerRegistry.set(eventType, existing);
}

export function getRegisteredEventTypes(): Array<{
  type: EventType;
  handlerCount: number;
  handlers: string[];
}> {
  const types: Array<{ type: EventType; handlerCount: number; handlers: string[] }> = [];
  const entries = Array.from(handlerRegistry.entries());
  for (const [type, handlers] of entries) {
    types.push({
      type,
      handlerCount: handlers.length,
      handlers: handlers.map((h: { name: string; handler: EventHandler }) => h.name),
    });
  }
  return types.sort((a, b) => a.type.localeCompare(b.type));
}

// ── Emit Event ──────────────────────────────────────────────

export async function emitEvent(
  type: EventType,
  sourceSystem: SourceSystem | string,
  payload: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<{ event: SystemEvent | null; results: HandlerResult[] }> {
  // 1. Store the event
  const { data: event, error: insertError } = await supabase
    .from("system_events")
    .insert({
      type,
      source_system: sourceSystem,
      payload,
      processed: false,
      results: [],
    })
    .select()
    .single();

  if (insertError || !event) {
    console.error("[EventBus] Failed to store event:", insertError);
    return { event: null, results: [] };
  }

  // 2. Process registered handlers
  const handlers = handlerRegistry.get(type) || [];
  const results: HandlerResult[] = [];

  for (const { name, handler } of handlers) {
    try {
      const result = await handler(
        { type, source_system: sourceSystem, payload },
        supabase
      );
      results.push(result);
    } catch (err) {
      results.push({
        handler: name,
        success: false,
        message: err instanceof Error ? err.message : "Unknown handler error",
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 3. Update event with results
  const { data: updated } = await supabase
    .from("system_events")
    .update({
      processed: true,
      results,
    })
    .eq("id", event.id)
    .select()
    .single();

  return { event: updated || event, results };
}

// ============================================================
// Built-in Cross-System Handlers
// ============================================================

// ── lease.expiring ──────────────────────────────────────────

registerHandler("lease.expiring", "notify-lease-expiring", async (event, supabase) => {
  const { tenant_name, days_until_expiry, lease_id } = event.payload as {
    tenant_name?: string;
    days_until_expiry?: number;
    lease_id?: string;
  };

  await createNotification(supabase, {
    title: "Lease Expiring Soon",
    message: `Tenant ${tenant_name || "Unknown"} lease expires in ${days_until_expiry || "?"} days`,
    type: "warning",
    category: "contracts",
    link: lease_id ? `/dashboard/contracts` : undefined,
  });

  return {
    handler: "notify-lease-expiring",
    success: true,
    message: `Notification created for ${tenant_name}`,
    timestamp: new Date().toISOString(),
  };
});

registerHandler("lease.expiring", "check-tenant-performance", async (event, supabase) => {
  const { tenant_id, tenant_name } = event.payload as {
    tenant_id?: string;
    tenant_name?: string;
  };

  if (!tenant_id) {
    return {
      handler: "check-tenant-performance",
      success: false,
      message: "No tenant_id provided",
      timestamp: new Date().toISOString(),
    };
  }

  // Check for existing discrepancies (underperformer signal)
  const { data: discrepancies } = await supabase
    .from("discrepancies")
    .select("id, variance_pct")
    .eq("tenant_id", tenant_id)
    .eq("status", "flagged")
    .limit(3);

  const isUnderperformer = (discrepancies?.length || 0) >= 2;

  if (isUnderperformer) {
    await createNotification(supabase, {
      title: "Do Not Renew Recommendation",
      message: `Tenant ${tenant_name || "Unknown"} is flagged as underperformer with ${discrepancies?.length} active discrepancies — consider not renewing`,
      type: "critical",
      category: "contracts",
    });
  }

  return {
    handler: "check-tenant-performance",
    success: true,
    message: isUnderperformer
      ? `Flagged ${tenant_name} as underperformer — do not renew`
      : `${tenant_name} performance acceptable`,
    timestamp: new Date().toISOString(),
  };
});

// ── rent.overdue ────────────────────────────────────────────

registerHandler("rent.overdue", "notify-rent-overdue", async (event, supabase) => {
  const { tenant_name, days_overdue, amount_due } = event.payload as {
    tenant_name?: string;
    days_overdue?: number;
    amount_due?: number;
  };

  await createNotification(supabase, {
    title: "Rent Overdue",
    message: `Tenant ${tenant_name || "Unknown"} rent overdue by ${days_overdue || "?"} days — EGP ${(amount_due || 0).toLocaleString()} outstanding`,
    type: "warning",
    category: "revenue",
    link: "/dashboard/revenue",
  });

  return {
    handler: "notify-rent-overdue",
    success: true,
    message: `Overdue notification created for ${tenant_name}`,
    timestamp: new Date().toISOString(),
  };
});

registerHandler("rent.overdue", "check-overdue-pattern", async (event, supabase) => {
  const { tenant_id, tenant_name, lease_id } = event.payload as {
    tenant_id?: string;
    tenant_name?: string;
    lease_id?: string;
  };

  if (!lease_id) {
    return {
      handler: "check-overdue-pattern",
      success: false,
      message: "No lease_id provided",
      timestamp: new Date().toISOString(),
    };
  }

  // Check for 3+ months of overdue in history
  const { data: overdueHistory } = await supabase
    .from("rent_transactions")
    .select("id")
    .eq("lease_id", lease_id)
    .eq("status", "overdue")
    .limit(3);

  if ((overdueHistory?.length || 0) >= 3) {
    // Emit anomaly for chronic late payer
    await emitEvent(
      "anomaly.detected",
      "event-bus",
      {
        description: `Chronic late payer: ${tenant_name || "Unknown"} has ${overdueHistory?.length}+ months of overdue rent`,
        severity: "warning",
        tenant_id,
        tenant_name,
        source_event: "rent.overdue",
      },
      supabase
    );
  }

  return {
    handler: "check-overdue-pattern",
    success: true,
    message:
      (overdueHistory?.length || 0) >= 3
        ? `Pattern detected — ${overdueHistory?.length} overdue months, anomaly emitted`
        : "No chronic pattern found",
    timestamp: new Date().toISOString(),
  };
});

// ── tenant.underreporting ───────────────────────────────────

registerHandler("tenant.underreporting", "notify-underreporting", async (event, supabase) => {
  const { tenant_name, variance_egp } = event.payload as {
    tenant_name?: string;
    variance_egp?: number;
  };

  await createNotification(supabase, {
    title: "Revenue Discrepancy Flagged",
    message: `Revenue discrepancy flagged for Tenant ${tenant_name || "Unknown"} — EGP ${(variance_egp || 0).toLocaleString()} variance`,
    type: "critical",
    category: "revenue",
    link: "/dashboard/discrepancies",
  });

  return {
    handler: "notify-underreporting",
    success: true,
    message: `Underreporting notification for ${tenant_name}`,
    timestamp: new Date().toISOString(),
  };
});

registerHandler("tenant.underreporting", "create-anomaly", async (event, supabase) => {
  const { tenant_id, tenant_name, variance_egp, discrepancy_id } = event.payload as {
    tenant_id?: string;
    tenant_name?: string;
    variance_egp?: number;
    discrepancy_id?: string;
  };

  // Insert anomaly record if table exists
  const { error } = await supabase.from("anomalies").insert({
    property_id: "a0000000-0000-0000-0000-000000000001",
    type: "revenue_discrepancy",
    severity: "warning",
    title: `Underreporting: ${tenant_name}`,
    description: `Tenant ${tenant_name} flagged for revenue underreporting — EGP ${(variance_egp || 0).toLocaleString()} variance`,
    source_module: "event-bus",
    source_data: {
      tenant_id,
      discrepancy_id,
      variance_egp,
    },
    status: "active",
  });

  return {
    handler: "create-anomaly",
    success: !error,
    message: error ? `Failed to create anomaly: ${error.message}` : `Anomaly created for ${tenant_name}`,
    timestamp: new Date().toISOString(),
  };
});

// ── footfall.drop ───────────────────────────────────────────

registerHandler("footfall.drop", "notify-footfall-drop", async (event, supabase) => {
  const { zone_name, drop_pct } = event.payload as {
    zone_name?: string;
    drop_pct?: number;
  };

  await createNotification(supabase, {
    title: "Footfall Drop Detected",
    message: `Zone ${zone_name || "Unknown"} footfall dropped ${drop_pct || "?"}% below normal`,
    type: "warning",
    category: "footfall",
    link: "/dashboard/footfall",
  });

  return {
    handler: "notify-footfall-drop",
    success: true,
    message: `Footfall drop notification for ${zone_name}`,
    timestamp: new Date().toISOString(),
  };
});

registerHandler("footfall.drop", "cross-reference-energy", async (event, supabase) => {
  const { zone_id, zone_name } = event.payload as {
    zone_id?: string;
    zone_name?: string;
  };

  if (!zone_id) {
    return {
      handler: "cross-reference-energy",
      success: false,
      message: "No zone_id provided",
      timestamp: new Date().toISOString(),
    };
  }

  // Check recent energy readings for this zone
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: readings } = await supabase
    .from("energy_readings")
    .select("consumption_kwh, cost_egp")
    .eq("zone_id", zone_id)
    .gte("timestamp", oneDayAgo)
    .limit(10);

  const totalCost = (readings || []).reduce(
    (sum: number, r: { cost_egp: number }) => sum + (r.cost_egp || 0),
    0
  );

  // If energy is still significant during a footfall drop, flag waste
  if (totalCost > 500) {
    await emitEvent(
      "energy.waste_detected",
      "event-bus",
      {
        zone_id,
        zone_name,
        daily_cost_egp: totalCost,
        reason: "High energy consumption during footfall drop",
      },
      supabase
    );

    return {
      handler: "cross-reference-energy",
      success: true,
      message: `Energy waste detected in ${zone_name} — EGP ${totalCost}/day during low footfall`,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    handler: "cross-reference-energy",
    success: true,
    message: `Energy levels normal in ${zone_name} during footfall drop`,
    timestamp: new Date().toISOString(),
  };
});

// ── energy.waste_detected ───────────────────────────────────

registerHandler("energy.waste_detected", "notify-energy-waste", async (event, supabase) => {
  const { zone_name, daily_cost_egp } = event.payload as {
    zone_name?: string;
    daily_cost_egp?: number;
  };

  await createNotification(supabase, {
    title: "Energy Waste Detected",
    message: `Energy waste in Zone ${zone_name || "Unknown"} — EGP ${(daily_cost_egp || 0).toLocaleString()}/day`,
    type: "warning",
    category: "energy",
    link: "/dashboard/energy",
  });

  return {
    handler: "notify-energy-waste",
    success: true,
    message: `Energy waste notification for ${zone_name}`,
    timestamp: new Date().toISOString(),
  };
});

// ── maintenance.created ─────────────────────────────────────

registerHandler("maintenance.created", "notify-urgent-maintenance", async (event, supabase) => {
  const { title, priority, zone_name } = event.payload as {
    title?: string;
    priority?: string;
    zone_name?: string;
  };

  if (priority === "urgent" || priority === "emergency") {
    await createNotification(supabase, {
      title: "Urgent Maintenance",
      message: `Urgent maintenance: ${title || "Unknown issue"}${zone_name ? ` in ${zone_name}` : ""}`,
      type: "critical",
      category: "maintenance",
      link: "/dashboard/maintenance",
    });

    return {
      handler: "notify-urgent-maintenance",
      success: true,
      message: `Urgent maintenance notification created`,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    handler: "notify-urgent-maintenance",
    success: true,
    message: `Priority ${priority} — no urgent notification needed`,
    timestamp: new Date().toISOString(),
  };
});

registerHandler("maintenance.created", "check-zone-ticket-pattern", async (event, supabase) => {
  const { zone_id, zone_name } = event.payload as {
    zone_id?: string;
    zone_name?: string;
  };

  if (!zone_id) {
    return {
      handler: "check-zone-ticket-pattern",
      success: true,
      message: "No zone_id — skipping pattern check",
      timestamp: new Date().toISOString(),
    };
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentTickets } = await supabase
    .from("maintenance_tickets")
    .select("id")
    .eq("zone_id", zone_id)
    .gte("created_at", thirtyDaysAgo);

  if ((recentTickets?.length || 0) >= 3) {
    await emitEvent(
      "anomaly.detected",
      "event-bus",
      {
        description: `Zone ${zone_name || zone_id} has ${recentTickets?.length} maintenance tickets in 30 days — possible systemic issue`,
        severity: "warning",
        zone_id,
        zone_name,
        source_event: "maintenance.created",
      },
      supabase
    );

    return {
      handler: "check-zone-ticket-pattern",
      success: true,
      message: `Pattern detected — ${recentTickets?.length} tickets in 30 days, anomaly emitted`,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    handler: "check-zone-ticket-pattern",
    success: true,
    message: `${recentTickets?.length || 0} tickets in 30 days — within normal range`,
    timestamp: new Date().toISOString(),
  };
});

// ── anomaly.detected ────────────────────────────────────────

registerHandler("anomaly.detected", "notify-anomaly", async (event, supabase) => {
  const { description, severity } = event.payload as {
    description?: string;
    severity?: string;
  };

  await createNotification(supabase, {
    title: "Anomaly Detected",
    message: description || "An anomaly was detected in the system",
    type: severity === "critical" ? "critical" : "warning",
    category: "anomaly",
    link: "/dashboard/anomalies",
  });

  return {
    handler: "notify-anomaly",
    success: true,
    message: "Anomaly notification created",
    timestamp: new Date().toISOString(),
  };
});

// ── anomaly.critical ────────────────────────────────────────

registerHandler("anomaly.critical", "broadcast-critical", async (event, supabase) => {
  const { description } = event.payload as { description?: string };

  // Broadcast to all staff (staff_id = null means visible to everyone)
  await createNotification(supabase, {
    title: "CRITICAL ANOMALY",
    message: `CRITICAL: ${description || "A critical anomaly has been detected"}`,
    type: "critical",
    category: "anomaly",
    link: "/dashboard/anomalies",
  });

  return {
    handler: "broadcast-critical",
    success: true,
    message: "Critical anomaly broadcast sent",
    timestamp: new Date().toISOString(),
  };
});

// ── campaign.started ────────────────────────────────────────

registerHandler("campaign.started", "notify-campaign", async (event, supabase) => {
  const { campaign_name } = event.payload as { campaign_name?: string };

  await createNotification(supabase, {
    title: "Campaign Active",
    message: `Campaign ${campaign_name || "Unknown"} is now active`,
    type: "info",
    category: "marketing",
    link: "/dashboard/marketing",
  });

  return {
    handler: "notify-campaign",
    success: true,
    message: `Campaign notification for ${campaign_name}`,
    timestamp: new Date().toISOString(),
  };
});

// ── maintenance.resolved ────────────────────────────────────

registerHandler("maintenance.resolved", "notify-resolved", async (event, supabase) => {
  const { title, ticket_id } = event.payload as {
    title?: string;
    ticket_id?: string;
  };

  await createNotification(supabase, {
    title: "Maintenance Resolved",
    message: `Ticket resolved: ${title || "Unknown"}`,
    type: "info",
    category: "maintenance",
    link: "/dashboard/maintenance",
  });

  return {
    handler: "notify-resolved",
    success: true,
    message: `Resolution notification for ticket ${ticket_id || "unknown"}`,
    timestamp: new Date().toISOString(),
  };
});

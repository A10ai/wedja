import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

const MESSAGE_TEMPLATES = [
  {
    id: "payment_reminder",
    name: "Payment Reminder",
    subject: "Payment Reminder — Senzo Mall",
    body: "Dear {tenant_name},\n\nThis is a reminder that your rent payment of EGP {amount} for unit {unit_number} is due. Please arrange payment at your earliest convenience.\n\nBest regards,\nSenzo Mall Management",
  },
  {
    id: "overdue_notice",
    name: "Overdue Notice",
    subject: "Overdue Rent Notice — Senzo Mall",
    body: "Dear {tenant_name},\n\nYour rent payment of EGP {amount} for unit {unit_number} is now overdue by {days} days. Please settle this balance immediately to avoid further action.\n\nSenzo Mall Management",
  },
  {
    id: "lease_renewal",
    name: "Lease Renewal",
    subject: "Lease Renewal Discussion — Senzo Mall",
    body: "Dear {tenant_name},\n\nYour lease for unit {unit_number} is set to expire on {end_date}. We would like to discuss renewal terms at your convenience.\n\nPlease contact us to schedule a meeting.\n\nBest regards,\nSenzo Mall Management",
  },
  {
    id: "violation_notice",
    name: "Violation Notice",
    subject: "Lease Violation Notice — Senzo Mall",
    body: "Dear {tenant_name},\n\nWe are writing to inform you of a violation of your lease agreement for unit {unit_number}.\n\nViolation: {violation_details}\n\nPlease address this matter within 7 business days.\n\nSenzo Mall Management",
  },
  {
    id: "welcome",
    name: "Welcome Message",
    subject: "Welcome to Senzo Mall",
    body: "Dear {tenant_name},\n\nWelcome to Senzo Mall! We are delighted to have {brand_name} as part of our community.\n\nYour unit {unit_number} is ready. Please find attached your welcome pack with all essential information.\n\nBest regards,\nSenzo Mall Management",
  },
];

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    if (type === "overview") {
      const [overdueResult, expiringLeasesResult, tenantsWithOverdueResult] =
        await Promise.all([
          // Overdue rent transactions
          supabase
            .from("rent_transactions")
            .select(
              "id, amount_due, lease:leases!inner(property_id)"
            )
            .eq("status", "overdue")
            .eq("leases.property_id", PROPERTY_ID),

          // Leases expiring within 90 days
          supabase
            .from("leases")
            .select("id")
            .eq("property_id", PROPERTY_ID)
            .eq("status", "active")
            .lte(
              "end_date",
              new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0]
            ),

          // Tenants with overdue payments
          supabase
            .from("rent_transactions")
            .select(
              "id, amount_due, lease:leases!inner(property_id, tenant:tenants(id, brand_name, contact_email, contact_phone), unit:units(unit_number))"
            )
            .eq("status", "overdue")
            .eq("leases.property_id", PROPERTY_ID),
        ]);

      const overdueData = overdueResult.data || [];
      const overdueCount = overdueData.length;
      const overdueTotalEgp = overdueData.reduce(
        (sum, t) => sum + (t.amount_due || 0),
        0
      );

      const expiringLeasesCount = (expiringLeasesResult.data || []).length;

      // Deduplicate tenants needing contact
      const tenantMap = new Map<
        string,
        { tenant_id: string; brand_name: string; contact_email: string; contact_phone: string; unit_number: string }
      >();
      for (const row of tenantsWithOverdueResult.data || []) {
        const lease = row.lease as any;
        const tenant = lease?.tenant;
        const unit = lease?.unit;
        if (tenant && !tenantMap.has(tenant.id)) {
          tenantMap.set(tenant.id, {
            tenant_id: tenant.id,
            brand_name: tenant.brand_name,
            contact_email: tenant.contact_email,
            contact_phone: tenant.contact_phone,
            unit_number: unit?.unit_number || "",
          });
        }
      }

      return NextResponse.json({
        overdue_count: overdueCount,
        overdue_total_egp: overdueTotalEgp,
        expiring_leases_count: expiringLeasesCount,
        tenants_needing_contact: Array.from(tenantMap.values()),
      });
    }

    if (type === "overdue") {
      const { data, error } = await supabase
        .from("rent_transactions")
        .select(
          "id, amount_due, period_month, period_year, lease:leases!inner(property_id, tenant:tenants(id, brand_name, contact_email, contact_phone), unit:units(unit_number))"
        )
        .eq("status", "overdue")
        .eq("leases.property_id", PROPERTY_ID);

      if (error) {
        console.error("Overdue query error:", error);
        return NextResponse.json(
          { error: "Failed to fetch overdue data" },
          { status: 500 }
        );
      }

      // Group by tenant
      const tenantOverdueMap = new Map<
        string,
        {
          tenant_id: string;
          brand_name: string;
          contact_email: string;
          contact_phone: string;
          unit_number: string;
          overdue_count: number;
          total_overdue_egp: number;
          oldest_overdue_month: string;
        }
      >();

      for (const row of data || []) {
        const lease = row.lease as any;
        const tenant = lease?.tenant;
        const unit = lease?.unit;
        if (!tenant) continue;

        const existing = tenantOverdueMap.get(tenant.id);
        const monthLabel = `${row.period_year}-${String(row.period_month).padStart(2, "0")}`;

        if (existing) {
          existing.overdue_count += 1;
          existing.total_overdue_egp += row.amount_due || 0;
          if (monthLabel < existing.oldest_overdue_month) {
            existing.oldest_overdue_month = monthLabel;
          }
        } else {
          tenantOverdueMap.set(tenant.id, {
            tenant_id: tenant.id,
            brand_name: tenant.brand_name,
            contact_email: tenant.contact_email,
            contact_phone: tenant.contact_phone,
            unit_number: unit?.unit_number || "",
            overdue_count: 1,
            total_overdue_egp: row.amount_due || 0,
            oldest_overdue_month: monthLabel,
          });
        }
      }

      return NextResponse.json(Array.from(tenantOverdueMap.values()));
    }

    if (type === "renewals") {
      const cutoffDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const { data, error } = await supabase
        .from("leases")
        .select(
          "id, end_date, min_rent_monthly_egp, tenant:tenants(id, brand_name), unit:units(unit_number)"
        )
        .eq("property_id", PROPERTY_ID)
        .eq("status", "active")
        .lte("end_date", cutoffDate)
        .order("end_date", { ascending: true });

      if (error) {
        console.error("Renewals query error:", error);
        return NextResponse.json(
          { error: "Failed to fetch renewals data" },
          { status: 500 }
        );
      }

      const now = new Date();
      const results = (data || []).map((lease) => {
        const tenant = lease.tenant as any;
        const unit = lease.unit as any;
        const endDate = new Date(lease.end_date);
        const daysRemaining = Math.ceil(
          (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          lease_id: lease.id,
          tenant_id: tenant?.id || "",
          brand_name: tenant?.brand_name || "",
          unit_number: unit?.unit_number || "",
          end_date: lease.end_date,
          days_remaining: daysRemaining,
          monthly_rent: lease.min_rent_monthly_egp,
        };
      });

      return NextResponse.json(results);
    }

    if (type === "templates") {
      return NextResponse.json(MESSAGE_TEMPLATES);
    }

    if (type === "history") {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("category", "communication")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("History query error:", error);
        return NextResponse.json(
          { error: "Failed to fetch communication history" },
          { status: 500 }
        );
      }

      return NextResponse.json(data || []);
    }

    return NextResponse.json(
      { error: "Invalid type parameter. Use: overview, overdue, renewals, templates, history" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Communications GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch communications data" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();

    const { tenant_id, type, channel, subject, body: messageBody } = body;

    if (!tenant_id || !subject || !messageBody) {
      return NextResponse.json(
        { error: "Missing required fields: tenant_id, subject, body" },
        { status: 400 }
      );
    }

    // Get first staff member for staff_id
    const { data: staffData } = await supabase
      .from("staff")
      .select("id")
      .limit(1)
      .single();

    if (!staffData) {
      return NextResponse.json(
        { error: "No staff found" },
        { status: 500 }
      );
    }

    const { data: notification, error } = await supabase
      .from("notifications")
      .insert({
        staff_id: staffData.id,
        title: subject,
        message: messageBody,
        type: "communication",
        category: "communication",
        link: `/dashboard/tenants/${tenant_id}`,
        read: false,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Insert notification error:", error);
      return NextResponse.json(
        { error: "Failed to send communication" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, notification_id: notification.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Communications POST error:", error);
    return NextResponse.json(
      { error: "Failed to send communication" },
      { status: 500 }
    );
  }
}

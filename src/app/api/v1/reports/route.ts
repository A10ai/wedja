import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVerificationReport } from "@/lib/revenue-engine";
import { getTenantRankings } from "@/lib/tenant-analytics";
import { getFootfallOverview, getFootfallByZone, getPeakPatterns } from "@/lib/footfall-engine";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const reportType = searchParams.get("type") || "revenue_verification";
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

    switch (reportType) {
      case "revenue_verification": {
        const report = await getVerificationReport(supabase, PROPERTY_ID, month, year);
        return NextResponse.json({ type: reportType, month, year, data: report });
      }

      case "tenant_performance": {
        const cards = await getTenantRankings(supabase, PROPERTY_ID);
        return NextResponse.json({ type: reportType, month, year, data: { tenants: cards } });
      }

      case "footfall_analysis": {
        const [overview, zones, peaks] = await Promise.all([
          getFootfallOverview(supabase, PROPERTY_ID),
          getFootfallByZone(supabase, PROPERTY_ID),
          getPeakPatterns(supabase, PROPERTY_ID),
        ]);
        return NextResponse.json({
          type: reportType,
          month,
          year,
          data: { overview, zones, peaks },
        });
      }

      case "rent_collection": {
        const { data: transactions } = await supabase
          .from("rent_transactions")
          .select(
            "*, lease:leases!inner(tenant:tenants(brand_name), unit:units(unit_number))"
          )
          .eq("period_month", month)
          .eq("period_year", year)
          .order("status", { ascending: true });

        const tx = transactions || [];
        const totalDue = tx.reduce((s: number, t: any) => s + (t.amount_due || 0), 0);
        const totalPaid = tx.reduce((s: number, t: any) => s + (t.amount_paid || 0), 0);

        return NextResponse.json({
          type: reportType,
          month,
          year,
          data: {
            summary: {
              total_due: totalDue,
              total_paid: totalPaid,
              collection_rate: totalDue > 0 ? (totalPaid / totalDue) * 100 : 100,
              total_transactions: tx.length,
              paid: tx.filter((t: any) => t.status === "paid").length,
              overdue: tx.filter((t: any) => t.status === "overdue").length,
              partial: tx.filter((t: any) => t.status === "partial").length,
            },
            transactions: tx,
          },
        });
      }

      case "maintenance": {
        const { data: tickets } = await supabase
          .from("maintenance_tickets")
          .select("*, zone:zones(name), unit:units(unit_number)")
          .eq("property_id", PROPERTY_ID)
          .order("created_at", { ascending: false });

        const allTickets = tickets || [];
        const open = allTickets.filter(
          (t: any) => ["open", "assigned", "in_progress"].includes(t.status)
        );
        const completed = allTickets.filter((t: any) => t.status === "completed");

        let avgResolution = 0;
        if (completed.length > 0) {
          const total = completed.reduce((sum: number, t: any) => {
            if (t.resolved_at) {
              return sum + (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24);
            }
            return sum;
          }, 0);
          avgResolution = total / completed.length;
        }

        return NextResponse.json({
          type: reportType,
          month,
          year,
          data: {
            summary: {
              total: allTickets.length,
              open: open.length,
              completed: completed.length,
              avg_resolution_days: Math.round(avgResolution * 10) / 10,
              by_priority: {
                emergency: allTickets.filter((t: any) => t.priority === "emergency").length,
                urgent: allTickets.filter((t: any) => t.priority === "urgent").length,
                high: allTickets.filter((t: any) => t.priority === "high").length,
                normal: allTickets.filter((t: any) => t.priority === "normal").length,
                low: allTickets.filter((t: any) => t.priority === "low").length,
              },
            },
            tickets: allTickets,
          },
        });
      }

      default:
        return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
    }
  } catch (error) {
    console.error("Reports API error:", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getFinanceOverview,
  getExpensesByCategory,
  getCashFlow,
  getBudgetComparison,
  getProfitAndLoss,
} from "@/lib/finance-engine";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { validateQuery, validateBody, formatZodErrors, financeQuerySchema, createExpenseSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const PROPERTY_ID = "a0000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);

    const queryValidation = validateQuery(financeQuerySchema, searchParams);
    if (!queryValidation.success) {
      return NextResponse.json(
        { error: formatZodErrors(queryValidation.error) },
        { status: 400 }
      );
    }
    const type = queryValidation.data.type || "overview";
    const month = queryValidation.data.month;
    const year = queryValidation.data.year;

    switch (type) {
      case "overview":
        return NextResponse.json(
          await getFinanceOverview(supabase, PROPERTY_ID, month, year)
        );

      case "expenses":
        return NextResponse.json(
          await getExpensesByCategory(supabase, PROPERTY_ID)
        );

      case "cashflow":
        return NextResponse.json(await getCashFlow(supabase, PROPERTY_ID));

      case "budget":
        return NextResponse.json(
          await getBudgetComparison(supabase, PROPERTY_ID, year)
        );

      case "pnl": {
        const now = new Date();
        const m = month || now.getMonth() + 1;
        const y = year || now.getFullYear();
        return NextResponse.json(
          await getProfitAndLoss(supabase, PROPERTY_ID, m, y)
        );
      }

      case "recent": {
        const { data, error } = await supabase
          .from("expenses")
          .select("*")
          .eq("property_id", PROPERTY_ID)
          .order("expense_date", { ascending: false })
          .limit(20);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json(data || []);
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error({ err: error }, "Finance GET error:");
    return NextResponse.json(
      { error: "Failed to fetch finance data" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const body = await req.json();

    const validation = validateBody(createExpenseSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("expenses")
      .insert({
        property_id: PROPERTY_ID,
        category: body.category,
        description: body.description,
        amount_egp: body.amount_egp,
        vendor: body.vendor || null,
        invoice_reference: body.invoice_reference || null,
        is_recurring: body.is_recurring || false,
        recurring_frequency: body.recurring_frequency || null,
        expense_date: body.expense_date || new Date().toISOString().split("T")[0],
        status: body.status || "pending",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Finance POST error:");
    return NextResponse.json(
      { error: "Failed to create expense" },
      { status: 500 }
    );
  }
}

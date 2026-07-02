import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processChat } from "@/lib/ai-chat";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { validateBody, formatZodErrors, aiChatSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();

    const validation = validateBody(aiChatSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: formatZodErrors(validation.error) }, { status: 400 });
    }
    const { message } = validation.data;

    const supabase = createAdminClient();
    const response = await processChat(supabase, message);

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ err: error }, "AI Chat API error:");
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}

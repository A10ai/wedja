import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues.map((i) => i.message).join("; ") },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    // 1. Verify the email belongs to an active staff member
    const adminSupabase = createAdminClient();
    const { data: staffMember, error: staffError } = await adminSupabase
      .from("staff")
      .select("id, name, email, role, property_id, status")
      .eq("email", email)
      .eq("status", "active")
      .single();

    if (staffError || !staffMember) {
      return NextResponse.json(
        { error: "Invalid credentials or inactive account" },
        { status: 401 }
      );
    }

    // 2. Verify the password via Supabase Auth
    const response = NextResponse.next();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            response.cookies.set(name, value, options);
          },
          remove(name: string, options: CookieOptions) {
            response.cookies.set(name, "", { ...options, maxAge: 0 });
          },
        },
      }
    );

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.session) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // 3. Return staff data + set session cookies
    const authResponse = NextResponse.json({
      data: {
        staff: {
          id: staffMember.id,
          name: staffMember.name,
          email: staffMember.email,
          role: staffMember.role,
          property_id: staffMember.property_id,
        },
      },
    });

    // Transfer all Set-Cookie headers from the intermediate response
    const setCookies = response.cookies.getAll();
    for (const cookie of setCookies) {
      authResponse.cookies.set(cookie.name, cookie.value, {
        ...cookie,
      });
    }

    return authResponse;
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
import { createBrowserClient as createClient } from "@supabase/ssr";

export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Return a stub during build / when env vars are missing
    // This prevents build-time crashes when Supabase is not configured yet
    return createClient(
      "https://placeholder.supabase.co",
      "placeholder-anon-key"
    );
  }

  return createClient(url, key);
}

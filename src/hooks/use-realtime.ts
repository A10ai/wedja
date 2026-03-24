"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Subscribe to Supabase Realtime changes on one or more tables.
 * When any INSERT/UPDATE/DELETE happens, calls `onUpdate` callback.
 * Includes debouncing to avoid rapid-fire re-fetches.
 */
export function useRealtimeSubscription(
  tables: string[],
  onUpdate: () => void,
  debounceMs: number = 2000
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const debouncedUpdate = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLastUpdate(new Date());
      onUpdate();
    }, debounceMs);
  }, [onUpdate, debounceMs]);

  useEffect(() => {
    const supabase = createBrowserClient();

    // Build a single channel that listens to multiple tables
    let channel = supabase.channel("dashboard-realtime");

    for (const table of tables) {
      channel = channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table },
        () => {
          debouncedUpdate();
        }
      );
    }

    channel.subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
    });

    channelRef.current = channel;

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [tables, debouncedUpdate]);

  return { connected, lastUpdate };
}

/**
 * Auto-refreshing data fetcher with realtime subscription.
 * Fetches data on mount, then re-fetches when any subscribed table changes.
 */
export function useRealtimeData<T>(
  fetchFn: () => Promise<T>,
  tables: string[],
  debounceMs: number = 2000
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const doFetch = useCallback(async () => {
    try {
      const result = await fetchFn();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  // Initial fetch
  useEffect(() => {
    doFetch();
  }, [doFetch]);

  // Realtime subscription
  const { connected, lastUpdate } = useRealtimeSubscription(
    tables,
    doFetch,
    debounceMs
  );

  return { data, loading, error, connected, lastUpdate, refetch: doFetch };
}

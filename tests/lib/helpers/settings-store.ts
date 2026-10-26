/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * In-memory `system_settings` table for Supabase mocks.
 *
 * Understands the queries made by src/lib/ai-brain.ts settings helpers:
 * select by key / key prefix (like "x%"), upsert, insert (duplicate key →
 * 23505 error), conditional update with lt("value->>expires_at", ...), and
 * delete guarded by eq("value->>holder", ...).
 *
 * Use `store.routing` as a createRoutingSupabase table resolver and
 * `store.scripted(ctx)` from a createScriptedSupabase resolver.
 */
type Filter = [string, ...any[]];

export function createSettingsStore(initial: Record<string, any> = {}) {
  const rows = new Map<string, any>(Object.entries(initial));
  const writes: Array<{ op: string; key: string; value?: any; updated_by?: any }> = [];

  function handle(op: string, payload: any, filters: Filter[]): any {
    const eq = (col: string) => filters.find((f) => f[0] === "eq" && f[1] === col)?.[2];
    const key = eq("key");
    switch (op) {
      case "select": {
        const like = filters.find((f) => f[0] === "like");
        if (like) {
          const prefix = String(like[2]).replace(/%$/, "");
          return Array.from(rows.entries()).filter(([k]) => k.startsWith(prefix)).map(([k, value]) => ({ key: k, value }));
        }
        return rows.has(key) ? [{ key, value: rows.get(key) }] : [];
      }
      case "upsert":
        rows.set(payload.key, payload.value);
        writes.push({ op, key: payload.key, value: payload.value, updated_by: payload.updated_by });
        return [];
      case "insert":
        if (rows.has(payload.key)) return { __error: { code: "23505", message: "duplicate key" } };
        rows.set(payload.key, payload.value);
        writes.push({ op, key: payload.key, value: payload.value });
        return [];
      case "update": {
        if (!rows.has(key)) return [];
        const lt = filters.find((f) => f[0] === "lt" && f[1] === "value->>expires_at");
        if (lt && !(String(rows.get(key)?.expires_at) < String(lt[2]))) return [];
        rows.set(key, payload.value);
        writes.push({ op, key, value: payload.value });
        return [{ key }];
      }
      case "delete": {
        const holder = eq("value->>holder");
        if (holder === undefined || rows.get(key)?.holder === holder) rows.delete(key);
        writes.push({ op, key });
        return [];
      }
    }
    return null;
  }

  return {
    rows,
    writes,
    /** Resolver for createRoutingSupabase. */
    routing: (ctx: any) => handle(ctx.op, ctx.payload, ctx.filters.map((f: any) => [f.name, ...f.args])),
    /** Call from a createScriptedSupabase resolver when ctx.table === "system_settings". */
    scripted: (ctx: any) => {
      const r = handle(ctx.op, ctx.payload, ctx.filters);
      return r && r.__error ? [] : r;
    },
  };
}

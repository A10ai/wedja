/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Filter-aware chainable Supabase mock.
 *
 * Unlike createMockSupabase (which returns the same rows for every query on a
 * table), this resolves data lazily at await-time via a resolver that sees the
 * table name, every filter call made on the chain, and any mutation payload.
 * This lets one table answer different queries differently, e.g.
 * `footfall_daily` filtered by `eq("date", today)` vs `gte("date", weekAgo)`.
 */

export interface QueryCtx {
  table: string;
  /** Each filter call as [method, ...args]. */
  filters: [string, ...any[]][];
  op: "select" | "insert" | "update" | "upsert" | "delete";
  payload?: any;
  /** Convenience: first value passed to eq(col, ...). */
  eq(col: string): any;
  has(method: string, col?: string): boolean;
  arg(method: string, col: string): any;
}

export type Resolver = (ctx: QueryCtx) => any;

export function createScriptedSupabase(resolver: Resolver | Record<string, any>) {
  const calls: QueryCtx[] = [];
  const resolve: Resolver =
    typeof resolver === "function" ? (resolver as Resolver) : (ctx: QueryCtx) => (resolver as Record<string, any>)[ctx.table] ?? null;

  const from = (table: string) => {
    const ctx: QueryCtx = {
      table,
      filters: [],
      op: "select",
      eq(col) {
        const f = this.filters.find((x) => x[0] === "eq" && x[1] === col);
        return f ? f[2] : undefined;
      },
      has(method, col) {
        return this.filters.some((x) => x[0] === method && (col === undefined || x[1] === col));
      },
      arg(method, col) {
        const f = this.filters.find((x) => x[0] === method && x[1] === col);
        return f ? f[2] : undefined;
      },
    };
    calls.push(ctx);

    const run = () => Promise.resolve({ data: resolve(ctx) ?? null, error: null });

    const chain: any = {
      then: (a: any, b?: any) => run().then(a, b),
      catch: (b: any) => run().catch(b),
      finally: (f: any) => run().finally(f),
      single: () => run().then((r) => ({ ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data })),
      maybeSingle: () => run().then((r) => ({ ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data })),
      select: () => chain,
      insert: (p: any) => {
        ctx.op = "insert";
        ctx.payload = p;
        return chain;
      },
      upsert: (p: any) => {
        ctx.op = "upsert";
        ctx.payload = p;
        return chain;
      },
      update: (p: any) => {
        ctx.op = "update";
        ctx.payload = p;
        return chain;
      },
      delete: () => {
        ctx.op = "delete";
        return chain;
      },
    };
    for (const m of ["eq", "neq", "gt", "gte", "lt", "lte", "in", "not", "or", "like", "ilike", "order", "range", "limit"]) {
      chain[m] = (...args: any[]) => {
        ctx.filters.push([m, ...args]);
        return chain;
      };
    }
    return chain;
  };

  return { from, _calls: calls } as any;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A routing Supabase mock for tests that need per-query control.
 *
 * Unlike `createMockSupabase` (which returns the same rows for every query
 * against a table), each table entry here may be either static data or a
 * resolver function that receives the full query context (operation,
 * payload, filters) and returns the rows for that specific query.
 *
 * - Every builder method (select/eq/in/insert/update/upsert/...) returns the
 *   same chain, so `insert(...).select().single()` works like the real client.
 * - Awaiting the chain resolves to `{ data, error, count }`.
 * - `.single()` / `.maybeSingle()` unwrap arrays to their first element.
 * - A resolver may return `{ __error: { message } }` to simulate an error.
 * - Every executed query is recorded in `sb._ops` for assertions.
 */

export type Op = "select" | "insert" | "update" | "upsert" | "delete";

export interface QueryCtx {
  table: string;
  op: Op;
  payload: any;
  filters: Array<{ name: string; args: any[] }>;
  /** Convenience: value of the first eq(col, value) for a column. */
  eq(col: string): any;
  single: boolean;
}

export type Resolver = any | ((ctx: QueryCtx) => any);

export function createRoutingSupabase(
  tables: Record<string, Resolver> = {},
  /** maxRows: cap each select like PostgREST `max_rows` (off by default). */
  options: { maxRows?: number } = {}
) {
  const ops: QueryCtx[] = [];

  const from = (table: string) => {
    const ctx: QueryCtx = {
      table,
      op: "select",
      payload: undefined,
      filters: [],
      single: false,
      eq(col: string) {
        const f = this.filters.find((x) => x.name === "eq" && x.args[0] === col);
        return f ? f.args[1] : undefined;
      },
    };
    let recorded = false;

    const resolve = () => {
      if (!recorded) {
        ops.push(ctx);
        recorded = true;
      }
      const entry = tables[table];
      let data = typeof entry === "function" ? entry(ctx) : entry;
      if (data === undefined) data = ctx.op === "select" ? null : null;
      if (data && typeof data === "object" && "__error" in data) {
        return { data: null, error: data.__error, count: null };
      }
      if (ctx.single) {
        data = Array.isArray(data) ? (data[0] ?? null) : data;
      }
      const count = Array.isArray(data) ? data.length : data == null ? null : 1;
      // `.range(from, to)` pages array data (inclusive, like PostgREST) so
      // fetchAll() loops terminate and see every row.
      const range = ctx.filters.find((x) => x.name === "range");
      if (range && Array.isArray(data)) {
        data = data.slice(range.args[0], range.args[1] + 1);
      }
      if (options.maxRows !== undefined && Array.isArray(data) && ctx.op === "select") {
        data = data.slice(0, options.maxRows);
      }
      return { data, error: null, count };
    };

    const chain: any = {
      then(onF: any, onR?: any) {
        return Promise.resolve().then(resolve).then(onF, onR);
      },
      catch(onR: any) {
        return Promise.resolve().then(resolve).catch(onR);
      },
    };
    const builder = (name: string) => (...args: any[]) => {
      ctx.filters.push({ name, args });
      return chain;
    };
    for (const n of [
      "eq", "neq", "gt", "gte", "lt", "lte", "in", "not", "or", "like",
      "ilike", "order", "range", "limit", "is", "match", "filter", "contains",
    ]) {
      chain[n] = builder(n);
    }
    chain.select = () => chain;
    const mut = (op: Op) => (payload?: any) => {
      ctx.op = op;
      ctx.payload = payload;
      return chain;
    };
    chain.insert = mut("insert");
    chain.update = mut("update");
    chain.upsert = mut("upsert");
    chain.delete = mut("delete");
    chain.single = () => {
      ctx.single = true;
      return Promise.resolve().then(resolve);
    };
    chain.maybeSingle = chain.single;
    return chain;
  };

  const sb: any = {
    from,
    _ops: ops,
    opsFor(table: string, op?: Op) {
      return ops.filter((o) => o.table === table && (!op || o.op === op));
    },
  };
  return sb;
}

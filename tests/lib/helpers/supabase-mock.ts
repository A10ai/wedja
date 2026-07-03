import { vi } from "vitest";

/**
 * Builder for a chainable mock Supabase client.
 *
 * Supports the fluent query builder pattern used throughout the codebase:
 *   supabase.from("table").select("...").eq("a","b").in("c",[...]).gte(...).lt(...).order(...).limit(n)
 *
 * The chain is ALSO a thenable — awaiting it resolves to { data, error }.
 * This lets queries that end in a filter (e.g. `.eq("status","active")`)
 * be awaited directly, just like the real Supabase client.
 *
 * Each query can be configured to return specific data. The mock records
 * all calls so tests can assert on the chain.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

interface QueryConfig {
  data: any | null;
  error: { message: string } | null;
}

function chainable(config: QueryConfig, log: { table: string; filters: string[] }): any {
  const result = {
    data: config.data,
    error: config.error,
  };

  // The chain is a thenable that resolves to { data, error }.
  const chain: any = {
    then(onFulfilled: any, onRejected?: any) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
    catch(onRejected: any) {
      return Promise.resolve(result).catch(onRejected);
    },
    finally(onFinally: any) {
      return Promise.resolve(result).finally(onFinally);
    },
  };

  const filter = (name: string) => (...args: any[]) => {
    log.filters.push(`${name}(${args.map((a) => JSON.stringify(a)).join(", ")})`);
    return chain;
  };

  // Terminal/throttled methods — return chain (which is thenable) so further
  // .single()/.maybeSingle() can still be called, AND await resolves to result.
  chain.limit = (...args: any[]) => {
    log.filters.push(`limit(${args[0]})`);
    return chain;
  };
  chain.single = () => Promise.resolve(result);
  chain.maybeSingle = () => Promise.resolve(result);

  // Mutations
  chain.insert = (payload: any) => {
    log.filters.push(`insert(${JSON.stringify(payload).slice(0, 50)})`);
    return Promise.resolve(result);
  };
  chain.update = (payload: any) => {
    log.filters.push(`update(${JSON.stringify(payload).slice(0, 50)})`);
    return chain;
  };
  chain.delete = () => {
    log.filters.push(`delete()`);
    return chain;
  };
  chain.upsert = (payload: any) => {
    log.filters.push(`upsert(...)`);
    return Promise.resolve(result);
  };

  // Filter / builder methods (return chain for chaining)
  chain.select = (/* columns */) => chain;
  chain.eq = filter("eq");
  chain.neq = filter("neq");
  chain.gt = filter("gt");
  chain.gte = filter("gte");
  chain.lt = filter("lt");
  chain.lte = filter("lte");
  chain.in = filter("in");
  chain.not = filter("not");
  chain.or = filter("or");
  chain.like = filter("like");
  chain.ilike = filter("ilike");
  chain.order = filter("order");
  chain.range = filter("range");
  chain.count = filter("count");

  return chain;
}

export function createMockSupabase(tableData: Record<string, any | null> = {}) {
  const calls: { table: string; filters: string[] }[] = [];

  const from = (table: string) => {
    const log = { table, filters: [] as string[] };
    calls.push(log);
    const config: QueryConfig = {
      data: tableData[table] ?? null,
      error: null,
    };
    return chainable(config, log);
  };

  const supabaseMock: any = {
    from,
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    _calls: calls,
  };

  return supabaseMock;
}
import { vi } from "vitest";

/**
 * Builder for a chainable mock Supabase client.
 *
 * Supports the fluent query builder pattern used throughout the codebase:
 *   supabase.from("table").select("...").eq("a","b").in("c",[...]).gte(...).lt(...).order(...).limit(n)
 *
 * The chain is ALSO a thenable — awaiting it resolves to { data, error, count }.
 * This lets queries that end in a filter (e.g. `.eq("status","active")`)
 * be awaited directly, just like the real Supabase client.
 *
 * Each query can be configured to return specific data. The mock records
 * all calls so tests can assert on the chain.
 *
 * Optional second argument (all fields optional, fully backward compatible):
 *   - errors:    per-table error returned with every query on that table
 *   - counts:    per-table `count` value (for `{ count: "exact" }` queries)
 *   - sequences: per-table queue of responses consumed in order by successive
 *                `from(table)` calls; once exhausted, falls back to
 *                tableData / errors / counts
 *   - throws:    per-table Error thrown synchronously from `from(table)`
 *
 * Each `_calls` entry has `table` and `filters` (unchanged format), plus
 * `payloads` (full insert/update/upsert payloads) and `selects` (select args).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

interface QueryConfig {
  data: any | null;
  error: { message: string } | null;
  count?: number | null;
}

export interface MockResponse {
  data?: any;
  error?: { message: string } | null;
  count?: number | null;
}

export interface MockOptions {
  errors?: Record<string, { message: string } | null>;
  counts?: Record<string, number | null>;
  sequences?: Record<string, MockResponse[]>;
  throws?: Record<string, Error>;
}

export interface CallLog {
  table: string;
  filters: string[];
  payloads: any[];
  selects: any[][];
}

function chainable(config: QueryConfig, log: CallLog): any {
  const result = {
    data: config.data,
    error: config.error,
    count: config.count ?? null,
  };

  // The chain is a thenable that resolves to { data, error, count }.
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

  // Mutations — return the (thenable) chain so `.insert(...).select().single()`
  // works; awaiting directly still resolves to { data, error }.
  chain.insert = (payload: any) => {
    log.filters.push(`insert(${JSON.stringify(payload).slice(0, 50)})`);
    log.payloads.push(payload);
    return chain;
  };
  chain.update = (payload: any) => {
    log.filters.push(`update(${JSON.stringify(payload).slice(0, 50)})`);
    log.payloads.push(payload);
    return chain;
  };
  chain.delete = () => {
    log.filters.push(`delete()`);
    return chain;
  };
  chain.upsert = (payload: any) => {
    log.filters.push(`upsert(...)`);
    log.payloads.push(payload);
    return chain;
  };

  // Filter / builder methods (return chain for chaining)
  chain.select = (...args: any[]) => {
    log.selects.push(args);
    return chain;
  };
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

export function createMockSupabase(
  tableData: Record<string, any | null> = {},
  options: MockOptions = {}
) {
  const calls: CallLog[] = [];
  const queues: Record<string, MockResponse[]> = {};
  for (const [t, seq] of Object.entries(options.sequences ?? {})) queues[t] = [...seq];

  const from = (table: string) => {
    const thrown = options.throws?.[table];
    if (thrown) throw thrown;
    const log: CallLog = { table, filters: [], payloads: [], selects: [] };
    calls.push(log);
    const queued = queues[table]?.shift();
    const config: QueryConfig = queued
      ? {
          data: queued.data ?? null,
          error: queued.error ?? null,
          count: queued.count ?? null,
        }
      : {
          data: tableData[table] ?? null,
          error: options.errors?.[table] ?? null,
          count: options.counts?.[table] ?? null,
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

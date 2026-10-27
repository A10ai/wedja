/**
 * PostgREST caps every select at `max_rows` (1000 on Supabase) and silently
 * returns the first page. Aggregates built from a single select are then
 * wrong without any error. fetchAll pages through the full result.
 *
 * Usage — pass a function that builds the query for a given range:
 *   const rows = await fetchAll((from, to) =>
 *     supabase.from("footfall_daily").select("unit_id, total_in")
 *       .gte("date", start).order("id").range(from, to));
 *
 * Give the query a deterministic `.order(...)` so pages don't overlap.
 */
export const PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function fetchAll<T>(
  buildQuery: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { pageSize = PAGE_SIZE, maxRows = 200_000 }: { pageSize?: number; maxRows?: number } = {}
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new Error(`fetchAll: more than ${maxRows} rows; aggregate in SQL instead`);
}

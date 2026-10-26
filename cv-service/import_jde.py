#!/usr/bin/env python3
"""
JDE Revenue Import Script (secondary / offline importer)
=======================================================
NOTE: the PRIMARY importer is the web import at /dashboard/import
(type "JDE Revenue Analysis" -> POST /api/v1/import). Prefer it. This script
exists for bulk/offline loads and writes the SAME shape of data:

  * rent_transactions rows marked source='jde_import', one per
    (lease_id, period_year, period_month).

Writes are idempotent: for each lease/period the script looks up an existing
JDE row (source or legacy payment_method = 'jde_import') and updates it when
the amount changed, skips it when unchanged, and inserts only when none exists.
Re-running the same workbook therefore never creates duplicates.

Writing the per-category breakdown into tenant_sales_reported is OFF by default
(--also-sales-reported). That table holds tenant-REPORTED sales used for
underreporting detection; JDE billing totals are not tenant sales, so only
enable it if the owner confirms the workbook really is tenant sales.

Usage:
    python import_jde.py --file /path/to/file.xlsx            # Import
    python import_jde.py --file /path/to/file.xlsx --dry-run  # Parse only
    python import_jde.py --file ... --also-sales-reported     # See note above

Environment (--dry-run still READS tenants/leases, so it needs them too):
    SUPABASE_URL, SUPABASE_SERVICE_KEY (SUPABASE_KEY accepted as legacy alias)

Expected Excel structure:
    - 13 sheets, each a revenue category
    - "ALL Category" sheet has all rows with a Category column
    - Row 1-2: headers/title
    - Row 3: column names (Customer Number, Customer Name, Jan-Dec dates, Total, Category)
    - Row 4+: data
"""

import json
import logging
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not installed. Run: pip install openpyxl")
    sys.exit(1)

from api.push_results import SupabaseRest, eq

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:  # optional for this script
    pass

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

UNMATCHED_FILE = "jde_unmatched.txt"
ALL_CATEGORY_SHEET = "ALL Category"
JDE_SOURCE = "jde_import"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("jde_import")

_client: Optional[SupabaseRest] = None


def client() -> SupabaseRest:
    """Supabase REST client (TLS verification always on)."""
    global _client
    if _client is None:
        _client = SupabaseRest.from_env()
    return _client


def supabase_get(table: str, params: str = "") -> list:
    return client().select(table, params)


# ---------------------------------------------------------------------------
# Fuzzy matching
# ---------------------------------------------------------------------------

def normalize_name(name: str) -> str:
    """Normalize a name for matching: lowercase, strip special chars, collapse spaces."""
    if not name:
        return ""
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9\s]", "", s)   # remove non-alphanumeric except spaces
    s = re.sub(r"\s+", " ", s).strip()   # collapse whitespace
    return s


def normalize_aggressive(name: str) -> str:
    """Even more aggressive: remove ALL spaces too."""
    return normalize_name(name).replace(" ", "")


def fuzzy_match_tenant(jde_name: str, tenants: list) -> Optional[dict]:
    """
    Try to match a JDE customer name to a Supabase tenant.
    Returns the matched tenant dict or None.

    Strategy:
    1. Exact normalized match on brand_name or name
    2. Aggressive match (no spaces, no special chars)
    3. Contains match (JDE name contains tenant name or vice versa)
    4. First-word match
    """
    jde_norm = normalize_name(jde_name)
    jde_agg = normalize_aggressive(jde_name)

    if not jde_norm:
        return None

    # Pass 1: Exact normalized match
    for t in tenants:
        for field in ["brand_name", "name"]:
            val = t.get(field, "")
            if val and normalize_name(val) == jde_norm:
                return t

    # Pass 2: Aggressive match (no spaces)
    for t in tenants:
        for field in ["brand_name", "name"]:
            val = t.get(field, "")
            if val and normalize_aggressive(val) == jde_agg:
                return t

    # Pass 3: Contains match (either direction)
    for t in tenants:
        for field in ["brand_name", "name"]:
            val = t.get(field, "")
            if not val:
                continue
            t_agg = normalize_aggressive(val)
            # Skip very short names to avoid false matches
            if len(t_agg) < 3 or len(jde_agg) < 3:
                continue
            if t_agg in jde_agg or jde_agg in t_agg:
                return t

    # Pass 4: First-word match (for multi-word names)
    jde_first = jde_norm.split()[0] if jde_norm.split() else ""
    if len(jde_first) >= 4:  # only if first word is meaningful
        for t in tenants:
            for field in ["brand_name", "name"]:
                val = t.get(field, "")
                if not val:
                    continue
                t_first = normalize_name(val).split()[0] if normalize_name(val).split() else ""
                if t_first and t_first == jde_first and len(t_first) >= 4:
                    return t

    return None


# ---------------------------------------------------------------------------
# Excel parsing
# ---------------------------------------------------------------------------

def detect_month_columns(ws, header_row: int = 3) -> list:
    """
    Detect month columns from the header row.
    Returns list of (col_index, month, year) tuples.
    Month columns contain date values or month name strings.
    """
    months = []
    for col in range(1, ws.max_column + 1):
        cell = ws.cell(header_row, col)
        val = cell.value
        if val is None:
            continue

        # If it's a datetime, extract month/year
        if isinstance(val, datetime):
            months.append((col, val.month, val.year))
            continue

        # If it's a string, try to parse month names
        if isinstance(val, str):
            val_lower = val.strip().lower()
            month_map = {
                "jan": 1, "feb": 2, "mar": 3, "apr": 4,
                "may": 5, "jun": 6, "jul": 7, "aug": 8,
                "sep": 9, "oct": 10, "nov": 11, "dec": 12,
                "january": 1, "february": 2, "march": 3, "april": 4,
                "june": 6, "july": 7, "august": 8, "september": 9,
                "october": 10, "november": 11, "december": 12,
            }
            for prefix, m in month_map.items():
                if val_lower.startswith(prefix):
                    # Try to extract year
                    year_match = re.search(r"20\d{2}", val)
                    year = int(year_match.group()) if year_match else 2025
                    months.append((col, m, year))
                    break

    return months


def detect_columns(ws, header_row: int = 3) -> dict:
    """
    Detect column positions from the header row.
    Returns dict with keys: customer_number, customer_name, total, category
    and their column indices.
    """
    cols = {}
    for col in range(1, ws.max_column + 1):
        val = ws.cell(header_row, col).value
        if val is None:
            continue
        val_lower = str(val).strip().lower()

        if "customer number" in val_lower or "cust" in val_lower and "num" in val_lower:
            cols["customer_number"] = col
        elif "customer name" in val_lower or ("cust" in val_lower and "name" in val_lower):
            cols["customer_name"] = col
        elif val_lower == "total":
            cols["total"] = col
        elif val_lower == "category":
            cols["category"] = col

    return cols


def parse_all_category_sheet(wb) -> list:
    """
    Parse the ALL Category sheet.
    Returns list of dicts: {customer_number, customer_name, category, months: {(m,y): amount}}
    """
    if ALL_CATEGORY_SHEET not in wb.sheetnames:
        log.error(f"Sheet '{ALL_CATEGORY_SHEET}' not found! Available: {wb.sheetnames}")
        sys.exit(1)

    ws = wb[ALL_CATEGORY_SHEET]
    log.info(f"Parsing '{ALL_CATEGORY_SHEET}': {ws.max_row} rows x {ws.max_column} cols")

    # Log first 3 rows for debugging
    for r in range(1, 4):
        row_vals = [repr(ws.cell(r, c).value) for c in range(1, min(ws.max_column + 1, 20))]
        log.info(f"  Row {r}: {row_vals}")

    # Detect structure
    cols = detect_columns(ws, header_row=3)
    month_cols = detect_month_columns(ws, header_row=3)

    log.info(f"  Detected columns: {cols}")
    log.info(f"  Detected {len(month_cols)} month columns: {[(m, y) for _, m, y in month_cols]}")

    if "customer_name" not in cols:
        # Try header row 2
        cols = detect_columns(ws, header_row=2)
        month_cols = detect_month_columns(ws, header_row=2)
        log.info(f"  Retried with row 2: columns={cols}, months={len(month_cols)}")

    if "customer_name" not in cols:
        log.error("Could not detect 'Customer Name' column!")
        # Fallback: assume standard layout
        cols = {"customer_number": 1, "customer_name": 2, "total": 15}
        month_cols = [(c, c - 2, 2025) for c in range(3, 15)]  # cols 3-14 = Jan-Dec
        log.warning(f"  Using fallback layout: {cols}")

    # Parse data rows (starting from row 4)
    rows = []
    data_start = 4
    cust_name_col = cols["customer_name"]
    cust_num_col = cols.get("customer_number", 1)
    cat_col = cols.get("category")

    for r in range(data_start, ws.max_row + 1):
        name = ws.cell(r, cust_name_col).value
        if not name or not str(name).strip():
            continue
        name = str(name).strip()

        # Skip summary/total rows
        if name.lower() in ("total", "grand total", "sum"):
            continue

        cust_num = ws.cell(r, cust_num_col).value
        category = ws.cell(r, cat_col).value if cat_col else None

        months_data = {}
        for col_idx, month, year in month_cols:
            val = ws.cell(r, col_idx).value
            if val is not None:
                try:
                    amount = float(val)
                    if amount != 0:
                        months_data[(month, year)] = amount
                except (ValueError, TypeError):
                    pass

        rows.append({
            "customer_number": str(cust_num).strip() if cust_num else None,
            "customer_name": name,
            "category": str(category).strip() if category else None,
            "months": months_data,
        })

    log.info(f"  Parsed {len(rows)} tenant rows from ALL Category")
    return rows


def parse_category_sheets(wb) -> dict:
    """
    Parse individual category sheets for revenue breakdown.
    Returns: {customer_name: {(month, year): {category: amount}}}
    """
    breakdown = {}

    for sheet_name in wb.sheetnames:
        if sheet_name == ALL_CATEGORY_SHEET:
            continue

        ws = wb[sheet_name]
        category = sheet_name.strip()
        log.info(f"Parsing category sheet: '{category}' ({ws.max_row} rows)")

        cols = detect_columns(ws, header_row=3)
        month_cols = detect_month_columns(ws, header_row=3)

        if "customer_name" not in cols:
            cols = detect_columns(ws, header_row=2)
            month_cols = detect_month_columns(ws, header_row=2)

        if "customer_name" not in cols:
            # Fallback
            cols = {"customer_number": 1, "customer_name": 2}
            month_cols = [(c, c - 2, 2025) for c in range(3, 15)]

        cust_name_col = cols["customer_name"]
        data_start = 4

        for r in range(data_start, ws.max_row + 1):
            name = ws.cell(r, cust_name_col).value
            if not name or not str(name).strip():
                continue
            name = str(name).strip()
            if name.lower() in ("total", "grand total", "sum"):
                continue

            if name not in breakdown:
                breakdown[name] = {}

            for col_idx, month, year in month_cols:
                val = ws.cell(r, col_idx).value
                if val is not None:
                    try:
                        amount = float(val)
                        if amount != 0:
                            key = (month, year)
                            if key not in breakdown[name]:
                                breakdown[name][key] = {}
                            breakdown[name][key][category] = amount
                    except (ValueError, TypeError):
                        pass

    return breakdown


# ---------------------------------------------------------------------------
# Import logic
# ---------------------------------------------------------------------------

def fetch_tenants() -> list:
    """Fetch all tenants from Supabase."""
    tenants = supabase_get("tenants", "select=id,name,brand_name,category&limit=1000")
    log.info(f"Fetched {len(tenants)} tenants from Supabase")
    return tenants


def fetch_leases() -> dict:
    """Fetch active leases, return {tenant_id: lease_id} mapping."""
    leases = supabase_get("leases", "select=id,tenant_id&status=eq.active&limit=1000")
    mapping = {}
    for lease in leases:
        tid = lease.get("tenant_id")
        if tid:
            mapping[tid] = lease["id"]
    log.info(f"Fetched {len(mapping)} active leases")
    return mapping


def is_jde_row(row: dict) -> bool:
    return row.get("source") == JDE_SOURCE or row.get("payment_method") == JDE_SOURCE


def _same(a, b) -> bool:
    if a is None or b is None:
        return a is b
    try:
        return abs(float(a) - float(b)) < 0.005
    except (TypeError, ValueError):
        return str(a) == str(b)


def plan_period_write(existing: list, values: dict, compare: tuple, matches=lambda r: True):
    """Decide what to do for one (lease, year, month) row. Pure function.

    existing: rows already in the table for this lease (any period).
    Returns ("insert", values) | ("update", id, changed) | ("skip", id).
    The oldest matching row (by created_at) is the one compared/updated.
    """
    same_period = sorted(
        (r for r in existing
         if matches(r)
         and int(r.get("period_year")) == int(values["period_year"])
         and int(r.get("period_month")) == int(values["period_month"])),
        key=lambda r: str(r.get("created_at") or ""),
    )
    if not same_period:
        return ("insert", values)
    row = same_period[0]
    changed = {f: values[f] for f in compare if not _same(row.get(f), values[f])}
    if not changed:
        return ("skip", row["id"])
    return ("update", row["id"], changed)


def write_period_rows(table: str, lease_id: str, rows: list, compare: tuple,
                      matches, stats: dict, select: str):
    """Idempotently write a lease's period rows: one lookup per lease."""
    existing = client().select(table, f"select={select}&lease_id={eq(lease_id)}&limit=1000")
    for values in rows:
        plan = plan_period_write(existing, values, compare, matches)
        label = f"{table} {values['period_month']}/{values['period_year']}"
        try:
            if plan[0] == "insert":
                client().insert(table, values)
                stats["inserted"] += 1
            elif plan[0] == "update":
                client().update(table, f"id={eq(plan[1])}", plan[2])
                stats["updated"] += 1
            else:
                stats["unchanged"] += 1
        except Exception as e:  # noqa: BLE001 - reported and counted
            stats["failed"] += 1
            log.error(f"    Failed to write {label} (lease {lease_id}): {e}")


def import_revenue(rows: list, breakdown: dict, dry_run: bool = False,
                   also_sales_reported: bool = False):
    """Match JDE rows to tenants and import into Supabase (idempotent)."""
    tenants = fetch_tenants()
    lease_map = fetch_leases()

    matched = 0
    unmatched = 0
    unmatched_names = []
    stats = {"inserted": 0, "updated": 0, "unchanged": 0, "failed": 0, "planned": 0}

    # Aggregate per lease/period first (several JDE customers may map to one lease)
    per_lease: dict = {}
    for row in rows:
        jde_name = row["customer_name"]
        tenant = fuzzy_match_tenant(jde_name, tenants)

        if not tenant:
            unmatched += 1
            unmatched_names.append(f"{row.get('customer_number', '?')} | {jde_name}")
            log.warning(f"  UNMATCHED: {jde_name}")
            continue

        matched += 1
        tenant_id = tenant["id"]
        tenant_brand = tenant.get("brand_name") or tenant.get("name")
        lease_id = lease_map.get(tenant_id)
        log.info(f"  MATCHED: '{jde_name}' -> '{tenant_brand}' (tenant_id={tenant_id})")

        if not lease_id:
            log.warning(f"    No active lease for tenant {tenant_brand} ({tenant_id}), skipping")
            continue

        entry = per_lease.setdefault(lease_id, {"tenant_id": tenant_id, "months": {}, "breakdown": {}})
        for key, amount in row["months"].items():
            entry["months"][key] = entry["months"].get(key, 0.0) + amount
        for key, cats in breakdown.get(jde_name, {}).items():
            merged = entry["breakdown"].setdefault(key, {})
            for cat, amount in cats.items():
                merged[cat] = merged.get(cat, 0.0) + amount

    for lease_id, entry in per_lease.items():
        tx_rows = [
            {
                "lease_id": lease_id,
                "period_month": month,
                "period_year": year,
                "min_rent_due": 0,
                "percentage_rent_due": 0,
                "amount_due": round(amount, 2),
                "amount_paid": round(amount, 2),
                "status": "paid",
                "source": JDE_SOURCE,
            }
            for (month, year), amount in sorted(entry["months"].items(), key=lambda kv: (kv[0][1], kv[0][0]))
        ]
        if dry_run:
            for tx in tx_rows:
                log.info(f"    [DRY RUN] lease {lease_id} {tx['period_month']}/{tx['period_year']} = EGP {tx['amount_due']:,.2f}")
            stats["planned"] += len(tx_rows)
        else:
            write_period_rows(
                "rent_transactions", lease_id, tx_rows,
                compare=("amount_due", "amount_paid", "status"),
                matches=is_jde_row, stats=stats,
                select="id,lease_id,period_month,period_year,amount_due,amount_paid,status,payment_method,source,created_at",
            )

        if also_sales_reported and entry["breakdown"]:
            import_category_breakdown(entry["tenant_id"], lease_id, entry["breakdown"], stats, dry_run)

    # Summary
    print("\n" + "=" * 60)
    print("JDE REVENUE IMPORT SUMMARY")
    print("=" * 60)
    print(f"Total tenant rows parsed:    {len(rows)}")
    print(f"Tenants matched:             {matched}")
    print(f"Tenants unmatched:           {unmatched}")
    if dry_run:
        print(f"Rows that would be written:  {stats['planned']}")
        print("MODE:                        DRY RUN (no writes)")
    else:
        print(f"Inserted:                    {stats['inserted']}")
        print(f"Updated (amount changed):    {stats['updated']}")
        print(f"Unchanged (already present): {stats['unchanged']}")
        print(f"FAILED:                      {stats['failed']}")
    print("=" * 60)

    if unmatched_names:
        with open(UNMATCHED_FILE, "w") as f:
            f.write("JDE Unmatched Tenants\n")
            f.write(f"Generated: {datetime.now().isoformat()}\n")
            f.write(f"Total unmatched: {len(unmatched_names)}\n")
            f.write("-" * 60 + "\n")
            for name in sorted(unmatched_names):
                f.write(name + "\n")
        print(f"\nUnmatched tenants saved to: {UNMATCHED_FILE}")

    return matched, unmatched, stats


def import_category_breakdown(tenant_id: str, lease_id: str, breakdown_data: dict,
                              stats: dict, dry_run: bool):
    """OPT-IN: store the JDE category totals as tenant_sales_reported (idempotent).

    breakdown_data: {(month, year): {category_name: amount}}
    """
    rows = []
    for (month, year), categories in sorted(breakdown_data.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        rows.append({
            "lease_id": lease_id,
            "tenant_id": tenant_id,
            "period_month": month,
            "period_year": year,
            "reported_revenue_egp": round(sum(categories.values()), 2),
            "submission_date": datetime.now().strftime("%Y-%m-%d"),
            "verified": False,
            "verification_notes": f"JDE import. Breakdown: {json.dumps(categories)}",
        })
    if dry_run:
        stats["planned"] += len(rows)
        return
    write_period_rows(
        "tenant_sales_reported", lease_id, rows,
        compare=("reported_revenue_egp", "verification_notes"),
        matches=lambda r: True, stats=stats,
        select="id,lease_id,period_month,period_year,reported_revenue_egp,verification_notes,created_at",
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Import JDE revenue data into Supabase")
    parser.add_argument("--file", "-f", required=True, help="Path to the JDE Excel file")
    parser.add_argument("--dry-run", "-n", action="store_true", help="Parse only, no Supabase writes")
    parser.add_argument("--also-sales-reported", action="store_true",
                        help="Also write category totals to tenant_sales_reported (owner must confirm "
                             "the workbook is tenant-reported sales, not JDE billing)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose logging")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    excel_path = Path(args.file)
    if not excel_path.exists():
        log.error(f"Excel file not found: {excel_path}")
        sys.exit(1)

    log.info(f"Loading Excel file: {excel_path}")
    wb = openpyxl.load_workbook(str(excel_path), data_only=True)
    log.info(f"Sheets found: {wb.sheetnames}")

    # Step 1: Parse ALL Category sheet
    rows = parse_all_category_sheet(wb)

    # Step 2: Parse individual category sheets for breakdown
    log.info("\nParsing individual category sheets for breakdown...")
    breakdown = parse_category_sheets(wb)
    log.info(f"Category breakdown parsed for {len(breakdown)} tenants")

    # Step 3: Import into Supabase
    if args.dry_run:
        log.info("\n--- DRY RUN MODE ---")

    client()  # fail fast on missing SUPABASE_URL / SUPABASE_SERVICE_KEY
    _, _, stats = import_revenue(rows, breakdown, dry_run=args.dry_run,
                                 also_sales_reported=args.also_sales_reported)
    if stats["failed"]:
        sys.exit(1)


if __name__ == "__main__":
    main()

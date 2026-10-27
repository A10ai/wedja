import import_jde
from conftest import FakeSupabase

L = "l0000000-0000-0000-0000-000000000001"


def test_plan_insert_skip_update():
    values = {"lease_id": L, "period_year": 2026, "period_month": 1, "amount_due": 100.0,
              "amount_paid": 100.0, "status": "paid"}
    cmp = ("amount_due", "amount_paid", "status")
    assert import_jde.plan_period_write([], values, cmp)[0] == "insert"
    same = [{"id": "a", "period_year": 2026, "period_month": 1, "amount_due": "100.00",
             "amount_paid": 100, "status": "paid", "source": "jde_import"}]
    assert import_jde.plan_period_write(same, values, cmp, import_jde.is_jde_row) == ("skip", "a")
    changed = [{**same[0], "amount_due": 90}]
    assert import_jde.plan_period_write(changed, values, cmp, import_jde.is_jde_row) == (
        "update", "a", {"amount_due": 100.0})


def test_plan_ignores_non_jde_rows_and_prefers_oldest():
    values = {"period_year": 2026, "period_month": 1, "amount_due": 1, "amount_paid": 1, "status": "paid"}
    rows = [
        {"id": "manual", "period_year": 2026, "period_month": 1, "source": "csv_import", "created_at": "2025"},
        {"id": "new", "period_year": 2026, "period_month": 1, "payment_method": "jde_import", "created_at": "2026-02"},
        {"id": "old", "period_year": 2026, "period_month": 1, "source": "jde_import", "created_at": "2026-01"},
    ]
    plan = import_jde.plan_period_write(rows, values, ("amount_due",), import_jde.is_jde_row)
    assert plan[:2] == ("update", "old")


def test_reimport_is_idempotent(monkeypatch):
    db = FakeSupabase({
        "tenants": [{"id": "t1", "name": "Adidas", "brand_name": "Adidas"}],
        "leases": [{"id": L, "tenant_id": "t1", "status": "active"}],
    })
    monkeypatch.setattr(import_jde, "_client", db)
    monkeypatch.setattr(import_jde, "UNMATCHED_FILE", "/dev/null")
    rows = [
        {"customer_number": "1", "customer_name": "Adidas", "months": {(1, 2026): 1000.0, (2, 2026): 2000.0}},
        {"customer_number": "2", "customer_name": "Unknown Trader", "months": {(1, 2026): 5.0}},
    ]

    _, _, s1 = import_jde.import_revenue(rows, {})
    assert (s1["inserted"], s1["updated"], s1["unchanged"]) == (2, 0, 0)
    _, _, s2 = import_jde.import_revenue(rows, {})
    assert (s2["inserted"], s2["updated"], s2["unchanged"]) == (0, 0, 2)
    assert len(db.tables["rent_transactions"]) == 2
    assert all(r["source"] == "jde_import" for r in db.tables["rent_transactions"])

    rows[0]["months"][(2, 2026)] = 2500.0
    _, _, s3 = import_jde.import_revenue(rows, {})
    assert (s3["inserted"], s3["updated"], s3["unchanged"]) == (0, 1, 1)
    assert len(db.tables["rent_transactions"]) == 2
    # tenant_sales_reported is opt-in only
    assert "tenant_sales_reported" not in db.tables


def test_sales_reported_opt_in_is_idempotent(monkeypatch):
    db = FakeSupabase({
        "tenants": [{"id": "t1", "name": "Adidas", "brand_name": "Adidas"}],
        "leases": [{"id": L, "tenant_id": "t1", "status": "active"}],
    })
    monkeypatch.setattr(import_jde, "_client", db)
    rows = [{"customer_number": "1", "customer_name": "Adidas", "months": {(1, 2026): 10.0}}]
    breakdown = {"Adidas": {(1, 2026): {"Rent": 7.0, "Service": 3.0}}}
    import_jde.import_revenue(rows, breakdown, also_sales_reported=True)
    import_jde.import_revenue(rows, breakdown, also_sales_reported=True)
    assert len(db.tables["tenant_sales_reported"]) == 1
    assert db.tables["tenant_sales_reported"][0]["reported_revenue_egp"] == 10.0

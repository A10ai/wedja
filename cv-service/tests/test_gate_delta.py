from detection.gate_delta import GateState, counter_delta


def test_first_reading_is_baseline_only():
    d = counter_delta(None, None, 1500, 0, 100)
    assert d.delta == 0 and d.flags == ["baseline"]


def test_normal_increment():
    assert counter_delta(1500, 0, 1620, 300, 100).delta == 120


def test_counter_restart_counts_since_restart():
    d = counter_delta(1500, 0, 40, 300, 100)
    assert d.delta == 40 and "counter_reset" in d.flags


def test_busy_interval_is_capped_not_zeroed():
    # 5 minutes at 100/min -> cap 500; a 900 jump is kept as 500 and flagged
    d = counter_delta(1000, 0, 1900, 300, 100)
    assert d.delta == 500
    assert any(f.startswith("capped") for f in d.flags)


def test_cap_scales_with_elapsed_time():
    # 15 minutes since last good read -> cap 1500, so 900 is accepted as is
    d = counter_delta(1000, 0, 1900, 900, 100)
    assert d.delta == 900 and d.flags == []


def test_unread_counter_contributes_nothing():
    assert counter_delta(1000, 0, None, 300, 100).delta == 0


def test_gate_state_carries_unread_interval_to_next_read():
    s = GateState(max_per_minute=100)
    s.update("G1", 1000, 900, now_ts=0)
    a_in, a_out = s.update("G1", None, None, now_ts=300)  # OCR failed
    assert (a_in.delta, a_out.delta) == (0, 0)
    b_in, b_out = s.update("G1", 1150, 1000, now_ts=600)
    assert (b_in.delta, b_out.delta) == (150, 100)


def test_gate_state_tracks_counters_independently():
    s = GateState(max_per_minute=100)
    s.update("G1", 10, None, now_ts=0)        # leave unreadable at baseline
    d_in, d_out = s.update("G1", 20, 5, now_ts=300)
    assert d_in.delta == 10
    assert d_out.delta == 0 and d_out.flags == ["baseline"]
    d_in, d_out = s.update("G1", 25, 9, now_ts=600)
    assert (d_in.delta, d_out.delta) == (5, 4)


def test_deltas_are_per_interval_not_cumulative():
    s = GateState(max_per_minute=100)
    s.update("G1", 0, 0, 0)
    totals = [s.update("G1", v, 0, 300 * i)[0].delta for i, v in enumerate([10, 30, 60], start=1)]
    assert totals == [10, 20, 30]
    assert sum(totals) == 60

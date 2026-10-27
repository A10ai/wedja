from config.camera_mapping import resolve_cameras

Z = "b0000000-0000-0000-0000-000000000001"
Z2 = "b0000000-0000-0000-0000-000000000002"
F1 = "ca000000-0000-0000-0000-000000000001"
F2 = "ca000000-0000-0000-0000-000000000002"
U1 = "c0000000-0000-0000-0000-000000000001"


def cams(*items):
    return [dict(id=i, location=loc) for i, loc in items]


def test_match_by_camera_id_name():
    mapped, skipped = resolve_cameras(cams(("N2-D1", "Shock")), [{"id": F1, "name": "n2-d1", "zone_id": Z}])
    assert skipped == []
    assert mapped[0]["feed_id"] == F1 and mapped[0]["zone_id"] == Z and mapped[0]["unit_id"] is None


def test_unique_location_match():
    mapped, _ = resolve_cameras(cams(("N2-D8", "Mango")), [{"id": F1, "name": "Mango", "zone_id": Z}])
    assert mapped[0]["feed_id"] == F1


def test_ambiguous_location_is_skipped():
    configured = cams(("S1", "Gate 1"), ("S2", "Gate 1"))
    mapped, skipped = resolve_cameras(configured, [{"id": F1, "name": "Gate 1", "zone_id": Z}])
    assert mapped == []
    assert [c for c, _ in skipped] == ["S1", "S2"]


def test_unmapped_camera_never_gets_its_config_id():
    mapped, skipped = resolve_cameras(cams(("N2-D1", "Shock")), [])
    assert mapped == [] and skipped[0][0] == "N2-D1"


def test_explicit_feed_id_and_overrides():
    configured = [{"id": "N2-D1", "location": "Shock", "feed_id": F2, "zone_id": Z2, "unit_id": U1}]
    mapped, _ = resolve_cameras(configured, [{"id": F2, "name": "whatever", "zone_id": Z}])
    assert mapped[0]["feed_id"] == F2 and mapped[0]["zone_id"] == Z2 and mapped[0]["unit_id"] == U1


def test_invalid_ids_are_skipped():
    feeds = [{"id": F1, "name": "A", "zone_id": Z}, {"id": F2, "name": "B", "zone_id": None}]
    configured = [
        {"id": "A", "location": "x", "unit_id": "G-101"},  # non-UUID unit
        {"id": "B", "location": "y"},                     # feed without zone
        {"id": "C", "location": "z", "feed_id": "N2-D1"},  # non-UUID feed id
        {"id": "D", "location": "w", "feed_id": U1},       # unknown feed id
    ]
    mapped, skipped = resolve_cameras(configured, feeds)
    assert mapped == []
    assert [c for c, _ in skipped] == ["A", "B", "C", "D"]


def test_duplicate_feed_names_are_ambiguous():
    feeds = [{"id": F1, "name": "N2-D1", "zone_id": Z}, {"id": F2, "name": "N2-D1", "zone_id": Z}]
    mapped, skipped = resolve_cameras(cams(("N2-D1", "Shock")), feeds)
    assert mapped == [] and "ambiguous" in skipped[0][1]

"""
Pure delta logic for Hikvision gate line-crossing counters (no I/O).

The camera OSD shows CUMULATIVE Enter/Leave counts that only reset on power
cycle. We turn successive readings into per-interval deltas:

  * first reading of a counter        -> baseline only, delta 0
  * new >= previous                    -> delta = new - previous
  * new <  previous (counter restarted) -> delta = new (counted since restart)
  * delta above a plausibility cap     -> CAPPED (not discarded) and flagged
  * counter not readable (None)        -> delta 0, baseline kept, so the people
                                          are picked up at the next good read

The cap scales with the time since the last good reading of that counter, so
a busy interval or a few missed cycles are not thrown away.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


@dataclass
class CounterDelta:
    delta: int
    flags: List[str] = field(default_factory=list)


def counter_delta(prev_value: Optional[int], prev_ts: Optional[float],
                  new_value: Optional[int], now_ts: float,
                  max_per_minute: float) -> CounterDelta:
    """Delta for a single cumulative counter."""
    if new_value is None:
        return CounterDelta(0, ["unread"])
    if new_value < 0:
        return CounterDelta(0, ["invalid"])
    if prev_value is None:
        return CounterDelta(0, ["baseline"])

    flags: List[str] = []
    if new_value >= prev_value:
        delta = new_value - prev_value
    else:
        delta = new_value
        flags.append("counter_reset")

    elapsed_min = max(1.0, (now_ts - (prev_ts if prev_ts is not None else now_ts)) / 60.0)
    cap = max(1, math.ceil(max_per_minute * elapsed_min))
    if delta > cap:
        flags.append(f"capped:{delta}->{cap}")
        delta = cap
    return CounterDelta(delta, flags)


class GateState:
    """Last good cumulative reading (value, timestamp) per gate per counter."""

    def __init__(self, max_per_minute: float):
        self.max_per_minute = max_per_minute
        self._last: Dict[Tuple[str, str], Tuple[int, float]] = {}

    def update(self, gate: str, enter: Optional[int], leave: Optional[int],
               now_ts: float) -> Tuple[CounterDelta, CounterDelta]:
        out = []
        for counter, value in (("enter", enter), ("leave", leave)):
            prev = self._last.get((gate, counter))
            res = counter_delta(prev[0] if prev else None, prev[1] if prev else None,
                                value, now_ts, self.max_per_minute)
            if value is not None and value >= 0:
                self._last[(gate, counter)] = (value, now_ts)
            out.append(res)
        return out[0], out[1]

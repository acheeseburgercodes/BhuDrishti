"""Small in-process token-bucket limiter for public ingestion.

Adequate for a single-process prototype. Behind multiple workers or a proxy, enforce
limits at the edge (reverse proxy / API gateway) as well.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from threading import Lock
from typing import Callable


@dataclass
class _Bucket:
    tokens: float
    updated: float


class TokenBucketLimiter:
    def __init__(self, rate_per_min: int, burst: int | None = None, clock: Callable[[], float] = time.monotonic, max_keys: int = 10000) -> None:
        self.rate_per_s = max(1, rate_per_min) / 60.0
        self.capacity = float(burst or max(1, rate_per_min // 4 or 1))
        self.clock = clock
        self.max_keys = max_keys
        self._buckets: dict[str, _Bucket] = {}
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        now = self.clock()
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                if len(self._buckets) >= self.max_keys:
                    self._buckets.pop(next(iter(self._buckets)))
                bucket = self._buckets[key] = _Bucket(self.capacity, now)
            bucket.tokens = min(self.capacity, bucket.tokens + (now - bucket.updated) * self.rate_per_s)
            bucket.updated = now
            if bucket.tokens >= 1:
                bucket.tokens -= 1
                return True
            return False

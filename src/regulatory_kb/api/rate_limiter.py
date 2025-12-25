"""Rate limiting service for API access control.

Implements Requirements 13.6:
- Rate limiting for API access
"""

import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from regulatory_kb.core import get_logger

logger = get_logger(__name__)


@dataclass
class RateLimitConfig:
    """Configuration for rate limiting."""
    
    default_requests_per_minute: int = 100
    default_requests_per_hour: int = 1000
    default_requests_per_day: int = 10000
    burst_multiplier: float = 2.0
    window_size_seconds: int = 60


@dataclass
class RateLimitResult:
    """Result of a rate limit check."""
    
    allowed: bool
    remaining: int
    limit: int
    reset_at: datetime
    retry_after_seconds: Optional[int] = None
    
    def to_headers(self) -> dict[str, str]:
        """Convert to rate limit headers."""
        headers = {
            "X-RateLimit-Limit": str(self.limit),
            "X-RateLimit-Remaining": str(max(0, self.remaining)),
            "X-RateLimit-Reset": str(int(self.reset_at.timestamp())),
        }
        if self.retry_after_seconds:
            headers["Retry-After"] = str(self.retry_after_seconds)
        return headers


@dataclass
class RateLimitBucket:
    """Token bucket for rate limiting."""
    
    tokens: float
    last_update: float
    requests_in_window: int = 0
    window_start: float = field(default_factory=time.time)


class RateLimiter:
    """Rate limiter using token bucket algorithm.
    
    Provides:
    - Per-client rate limiting
    - Configurable limits per minute/hour/day
    - Burst handling
    - Rate limit headers for responses
    """
    
    def __init__(self, config: Optional[RateLimitConfig] = None):
        """Initialize the rate limiter.
        
        Args:
            config: Rate limit configuration.
        """
        self.config = config or RateLimitConfig()
        self._buckets: dict[str, RateLimitBucket] = {}
        self._client_limits: dict[str, int] = {}
    
    def set_client_limit(self, client_id: str, requests_per_minute: int) -> None:
        """Set a custom rate limit for a client.
        
        Args:
            client_id: Client identifier.
            requests_per_minute: Custom rate limit.
        """
        self._client_limits[client_id] = requests_per_minute
        logger.info(
            "client_limit_set",
            client_id=client_id,
            limit=requests_per_minute,
        )
    
    def get_client_limit(self, client_id: str) -> int:
        """Get the rate limit for a client.
        
        Args:
            client_id: Client identifier.
            
        Returns:
            Rate limit in requests per minute.
        """
        return self._client_limits.get(
            client_id,
            self.config.default_requests_per_minute,
        )
    
    def check_rate_limit(self, client_id: str) -> RateLimitResult:
        """Check if a request is allowed under rate limits.
        
        Args:
            client_id: Client identifier.
            
        Returns:
            RateLimitResult indicating if request is allowed.
        """
        now = time.time()
        limit = self.get_client_limit(client_id)
        
        # Get or create bucket
        bucket = self._get_or_create_bucket(client_id, limit, now)
        
        # Refill tokens based on time elapsed
        self._refill_tokens(bucket, limit, now)
        
        # Check if request is allowed
        if bucket.tokens >= 1:
            bucket.tokens -= 1
            bucket.requests_in_window += 1
            
            # Calculate reset time
            reset_at = datetime.fromtimestamp(
                bucket.window_start + self.config.window_size_seconds,
                tz=timezone.utc,
            )
            
            return RateLimitResult(
                allowed=True,
                remaining=int(bucket.tokens),
                limit=limit,
                reset_at=reset_at,
            )
        else:
            # Calculate retry after
            tokens_needed = 1 - bucket.tokens
            refill_rate = limit / self.config.window_size_seconds
            retry_after = int(tokens_needed / refill_rate) + 1
            
            reset_at = datetime.fromtimestamp(
                now + retry_after,
                tz=timezone.utc,
            )
            
            logger.warning(
                "rate_limit_exceeded",
                client_id=client_id,
                limit=limit,
                retry_after=retry_after,
            )
            
            return RateLimitResult(
                allowed=False,
                remaining=0,
                limit=limit,
                reset_at=reset_at,
                retry_after_seconds=retry_after,
            )
    
    def consume(self, client_id: str, tokens: int = 1) -> RateLimitResult:
        """Consume tokens from a client's bucket.
        
        Args:
            client_id: Client identifier.
            tokens: Number of tokens to consume.
            
        Returns:
            RateLimitResult indicating if consumption was allowed.
        """
        now = time.time()
        limit = self.get_client_limit(client_id)
        bucket = self._get_or_create_bucket(client_id, limit, now)
        
        self._refill_tokens(bucket, limit, now)
        
        if bucket.tokens >= tokens:
            bucket.tokens -= tokens
            bucket.requests_in_window += tokens
            
            reset_at = datetime.fromtimestamp(
                bucket.window_start + self.config.window_size_seconds,
                tz=timezone.utc,
            )
            
            return RateLimitResult(
                allowed=True,
                remaining=int(bucket.tokens),
                limit=limit,
                reset_at=reset_at,
            )
        else:
            retry_after = int(
                (tokens - bucket.tokens) / (limit / self.config.window_size_seconds)
            ) + 1
            
            reset_at = datetime.fromtimestamp(now + retry_after, tz=timezone.utc)
            
            return RateLimitResult(
                allowed=False,
                remaining=0,
                limit=limit,
                reset_at=reset_at,
                retry_after_seconds=retry_after,
            )
    
    def reset_client(self, client_id: str) -> None:
        """Reset rate limit for a client.
        
        Args:
            client_id: Client identifier.
        """
        if client_id in self._buckets:
            del self._buckets[client_id]
            logger.info("client_rate_limit_reset", client_id=client_id)
    
    def get_client_stats(self, client_id: str) -> dict[str, Any]:
        """Get rate limit statistics for a client.
        
        Args:
            client_id: Client identifier.
            
        Returns:
            Dictionary with rate limit stats.
        """
        limit = self.get_client_limit(client_id)
        bucket = self._buckets.get(client_id)
        
        if not bucket:
            return {
                "client_id": client_id,
                "limit": limit,
                "remaining": limit,
                "requests_in_window": 0,
            }
        
        now = time.time()
        self._refill_tokens(bucket, limit, now)
        
        return {
            "client_id": client_id,
            "limit": limit,
            "remaining": int(bucket.tokens),
            "requests_in_window": bucket.requests_in_window,
            "window_start": datetime.fromtimestamp(bucket.window_start, tz=timezone.utc).isoformat(),
        }
    
    def _get_or_create_bucket(
        self,
        client_id: str,
        limit: int,
        now: float,
    ) -> RateLimitBucket:
        """Get or create a rate limit bucket for a client."""
        if client_id not in self._buckets:
            # Allow burst up to multiplier
            max_tokens = limit * self.config.burst_multiplier
            self._buckets[client_id] = RateLimitBucket(
                tokens=max_tokens,
                last_update=now,
                window_start=now,
            )
        return self._buckets[client_id]
    
    def _refill_tokens(
        self,
        bucket: RateLimitBucket,
        limit: int,
        now: float,
    ) -> None:
        """Refill tokens based on time elapsed."""
        elapsed = now - bucket.last_update
        
        # Calculate tokens to add
        refill_rate = limit / self.config.window_size_seconds
        tokens_to_add = elapsed * refill_rate
        
        # Cap at max tokens (with burst)
        max_tokens = limit * self.config.burst_multiplier
        bucket.tokens = min(max_tokens, bucket.tokens + tokens_to_add)
        bucket.last_update = now
        
        # Reset window if needed
        if now - bucket.window_start >= self.config.window_size_seconds:
            bucket.window_start = now
            bucket.requests_in_window = 0

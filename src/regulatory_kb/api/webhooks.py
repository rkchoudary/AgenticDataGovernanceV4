"""Webhook notification system for regulatory document updates.

Implements Requirements 13.7:
- Webhook notifications when high-priority documents are updated
- Configurable event subscriptions
- Webhook delivery with retry logic
- Payload signing for security
- Dead letter queue for failed deliveries
"""

import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Any, Callable, Optional
from collections import deque

import aiohttp
import asyncio

from regulatory_kb.core import get_logger

logger = get_logger(__name__)


class WebhookEventType(str, Enum):
    """Types of webhook events."""
    
    # Document events
    DOCUMENT_CREATED = "document.created"
    DOCUMENT_UPDATED = "document.updated"
    DOCUMENT_DELETED = "document.deleted"
    
    # High-priority document events
    CCAR_INSTRUCTIONS_UPDATED = "document.ccar_instructions.updated"
    CFR_AMENDMENT = "document.cfr.amended"
    REGULATORY_DEADLINE_APPROACHING = "deadline.approaching"
    
    # Upload events (Implements Requirements 3.6, 6.5)
    UPLOAD_PROCESSING_COMPLETED = "upload.processing.completed"
    UPLOAD_PROCESSING_FAILED = "upload.processing.failed"
    UPLOAD_DOCUMENT_REPLACED = "upload.document.replaced"
    
    # System events
    PROCESSING_COMPLETED = "processing.completed"
    PROCESSING_FAILED = "processing.failed"
    
    # Health events
    SYSTEM_HEALTH_ALERT = "system.health.alert"


class WebhookStatus(str, Enum):
    """Status of a webhook delivery."""
    
    PENDING = "pending"
    DELIVERED = "delivered"
    FAILED = "failed"
    RETRYING = "retrying"
    DEAD_LETTER = "dead_letter"


@dataclass
class WebhookSubscription:
    """A webhook subscription configuration."""
    
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    url: str = ""
    secret: str = field(default_factory=lambda: uuid.uuid4().hex)
    events: list[WebhookEventType] = field(default_factory=list)
    is_active: bool = True
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = field(default_factory=dict)
    
    # Filtering options
    regulator_filter: Optional[list[str]] = None  # Filter by regulator IDs
    category_filter: Optional[list[str]] = None  # Filter by document categories
    
    def matches_event(self, event_type: WebhookEventType, payload: dict) -> bool:
        """Check if subscription matches an event."""
        if not self.is_active:
            return False
        
        if event_type not in self.events:
            return False
        
        # Apply filters
        if self.regulator_filter:
            regulator_id = payload.get("regulator_id")
            if regulator_id and regulator_id not in self.regulator_filter:
                return False
        
        if self.category_filter:
            categories = payload.get("categories", [])
            if not any(cat in self.category_filter for cat in categories):
                return False
        
        return True


@dataclass
class WebhookDelivery:
    """A webhook delivery attempt."""
    
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    subscription_id: str = ""
    event_type: WebhookEventType = WebhookEventType.DOCUMENT_UPDATED
    payload: dict[str, Any] = field(default_factory=dict)
    status: WebhookStatus = WebhookStatus.PENDING
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    delivered_at: Optional[datetime] = None
    attempts: int = 0
    max_attempts: int = 5
    last_error: Optional[str] = None
    response_status: Optional[int] = None
    next_retry_at: Optional[datetime] = None
    
    @property
    def can_retry(self) -> bool:
        """Check if delivery can be retried."""
        return self.attempts < self.max_attempts and self.status != WebhookStatus.DELIVERED
    
    def calculate_next_retry(self) -> datetime:
        """Calculate next retry time with exponential backoff."""
        # Exponential backoff: 1s, 2s, 4s, 8s, 16s
        delay_seconds = 2 ** self.attempts
        return datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)


@dataclass
class WebhookPayload:
    """Payload for a webhook delivery."""
    
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    data: dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "timestamp": self.timestamp,
            "data": self.data,
        }
    
    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict())


class WebhookService:
    """Webhook notification service for regulatory document updates.
    
    Provides:
    - Configurable event subscriptions
    - Webhook delivery with retry logic
    - Payload signing for security
    - Dead letter queue for failed deliveries
    """
    
    def __init__(
        self,
        signing_secret: str = "webhook-signing-secret",
        max_retries: int = 5,
        delivery_timeout: int = 30,
    ):
        """Initialize the webhook service.
        
        Args:
            signing_secret: Secret for signing payloads.
            max_retries: Maximum delivery attempts.
            delivery_timeout: Timeout for delivery requests in seconds.
        """
        self.signing_secret = signing_secret
        self.max_retries = max_retries
        self.delivery_timeout = delivery_timeout
        
        self._subscriptions: dict[str, WebhookSubscription] = {}
        self._deliveries: dict[str, WebhookDelivery] = {}
        self._dead_letter_queue: deque[WebhookDelivery] = deque(maxlen=1000)
        self._pending_retries: list[WebhookDelivery] = []
    
    # ==================== Subscription Management ====================
    
    def create_subscription(
        self,
        url: str,
        events: list[WebhookEventType],
        regulator_filter: Optional[list[str]] = None,
        category_filter: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> WebhookSubscription:
        """Create a new webhook subscription.
        
        Args:
            url: Webhook endpoint URL.
            events: List of event types to subscribe to.
            regulator_filter: Optional filter by regulator IDs.
            category_filter: Optional filter by document categories.
            metadata: Additional metadata.
            
        Returns:
            Created WebhookSubscription.
        """
        subscription = WebhookSubscription(
            url=url,
            events=events,
            regulator_filter=regulator_filter,
            category_filter=category_filter,
            metadata=metadata or {},
        )
        
        self._subscriptions[subscription.id] = subscription
        
        logger.info(
            "webhook_subscription_created",
            subscription_id=subscription.id,
            url=url,
            events=[e.value for e in events],
        )
        
        return subscription
    
    def get_subscription(self, subscription_id: str) -> Optional[WebhookSubscription]:
        """Get a subscription by ID."""
        return self._subscriptions.get(subscription_id)
    
    def update_subscription(
        self,
        subscription_id: str,
        url: Optional[str] = None,
        events: Optional[list[WebhookEventType]] = None,
        is_active: Optional[bool] = None,
        regulator_filter: Optional[list[str]] = None,
        category_filter: Optional[list[str]] = None,
    ) -> Optional[WebhookSubscription]:
        """Update a subscription.
        
        Args:
            subscription_id: ID of subscription to update.
            url: New URL (optional).
            events: New event list (optional).
            is_active: New active status (optional).
            regulator_filter: New regulator filter (optional).
            category_filter: New category filter (optional).
            
        Returns:
            Updated subscription or None if not found.
        """
        subscription = self._subscriptions.get(subscription_id)
        if not subscription:
            return None
        
        if url is not None:
            subscription.url = url
        if events is not None:
            subscription.events = events
        if is_active is not None:
            subscription.is_active = is_active
        if regulator_filter is not None:
            subscription.regulator_filter = regulator_filter
        if category_filter is not None:
            subscription.category_filter = category_filter
        
        logger.info(
            "webhook_subscription_updated",
            subscription_id=subscription_id,
        )
        
        return subscription
    
    def delete_subscription(self, subscription_id: str) -> bool:
        """Delete a subscription.
        
        Args:
            subscription_id: ID of subscription to delete.
            
        Returns:
            True if deleted.
        """
        if subscription_id in self._subscriptions:
            del self._subscriptions[subscription_id]
            logger.info("webhook_subscription_deleted", subscription_id=subscription_id)
            return True
        return False
    
    def list_subscriptions(
        self,
        event_type: Optional[WebhookEventType] = None,
        active_only: bool = True,
    ) -> list[WebhookSubscription]:
        """List subscriptions with optional filtering.
        
        Args:
            event_type: Filter by event type.
            active_only: Only return active subscriptions.
            
        Returns:
            List of matching subscriptions.
        """
        subscriptions = list(self._subscriptions.values())
        
        if active_only:
            subscriptions = [s for s in subscriptions if s.is_active]
        
        if event_type:
            subscriptions = [s for s in subscriptions if event_type in s.events]
        
        return subscriptions
    
    # ==================== Event Dispatch ====================
    
    def dispatch_event(
        self,
        event_type: WebhookEventType,
        data: dict[str, Any],
    ) -> list[WebhookDelivery]:
        """Dispatch an event to all matching subscriptions.
        
        Args:
            event_type: Type of event.
            data: Event data payload.
            
        Returns:
            List of created deliveries.
        """
        deliveries = []
        
        # Find matching subscriptions
        for subscription in self._subscriptions.values():
            if subscription.matches_event(event_type, data):
                delivery = self._create_delivery(subscription, event_type, data)
                deliveries.append(delivery)
        
        logger.info(
            "webhook_event_dispatched",
            event_type=event_type.value,
            delivery_count=len(deliveries),
        )
        
        return deliveries
    
    def dispatch_document_created(
        self,
        document_id: str,
        title: str,
        regulator_id: str,
        categories: list[str],
        metadata: Optional[dict[str, Any]] = None,
    ) -> list[WebhookDelivery]:
        """Dispatch a document created event.
        
        Args:
            document_id: ID of the created document.
            title: Document title.
            regulator_id: Regulator ID.
            categories: Document categories.
            metadata: Additional metadata.
            
        Returns:
            List of created deliveries.
        """
        data = {
            "document_id": document_id,
            "title": title,
            "regulator_id": regulator_id,
            "categories": categories,
            **(metadata or {}),
        }
        return self.dispatch_event(WebhookEventType.DOCUMENT_CREATED, data)
    
    def dispatch_document_updated(
        self,
        document_id: str,
        title: str,
        regulator_id: str,
        categories: list[str],
        changes: Optional[dict[str, Any]] = None,
        is_high_priority: bool = False,
    ) -> list[WebhookDelivery]:
        """Dispatch a document updated event.
        
        Args:
            document_id: ID of the updated document.
            title: Document title.
            regulator_id: Regulator ID.
            categories: Document categories.
            changes: Description of changes.
            is_high_priority: Whether this is a high-priority update.
            
        Returns:
            List of created deliveries.
        """
        data = {
            "document_id": document_id,
            "title": title,
            "regulator_id": regulator_id,
            "categories": categories,
            "changes": changes or {},
            "is_high_priority": is_high_priority,
        }
        
        deliveries = self.dispatch_event(WebhookEventType.DOCUMENT_UPDATED, data)
        
        # Also dispatch high-priority events if applicable
        if is_high_priority:
            if "ccar" in title.lower() or "fr y-14" in title.lower():
                deliveries.extend(
                    self.dispatch_event(WebhookEventType.CCAR_INSTRUCTIONS_UPDATED, data)
                )
            if "cfr" in title.lower():
                deliveries.extend(
                    self.dispatch_event(WebhookEventType.CFR_AMENDMENT, data)
                )
        
        return deliveries
    
    def dispatch_deadline_approaching(
        self,
        deadline_type: str,
        deadline_date: str,
        document_id: str,
        document_title: str,
        days_remaining: int,
    ) -> list[WebhookDelivery]:
        """Dispatch a deadline approaching event.
        
        Args:
            deadline_type: Type of deadline.
            deadline_date: Deadline date.
            document_id: Related document ID.
            document_title: Related document title.
            days_remaining: Days until deadline.
            
        Returns:
            List of created deliveries.
        """
        data = {
            "deadline_type": deadline_type,
            "deadline_date": deadline_date,
            "document_id": document_id,
            "document_title": document_title,
            "days_remaining": days_remaining,
        }
        return self.dispatch_event(WebhookEventType.REGULATORY_DEADLINE_APPROACHING, data)

    # ==================== Upload Event Dispatch ====================
    # Implements Requirements 3.6, 6.5
    
    def dispatch_upload_processing_completed(
        self,
        upload_id: str,
        kb_document_id: str,
        title: Optional[str] = None,
        regulator: Optional[str] = None,
        categories: Optional[list[str]] = None,
        chunk_count: int = 0,
        validation_score: float = 0.0,
        uploader_id: Optional[str] = None,
    ) -> list[WebhookDelivery]:
        """Dispatch an upload processing completed event.
        
        Implements Requirement 3.6:
        - Triggers webhook on processing complete
        
        Args:
            upload_id: Upload identifier.
            kb_document_id: Knowledge base document ID.
            title: Document title.
            regulator: Regulator identifier.
            categories: Document categories.
            chunk_count: Number of chunks created.
            validation_score: Content validation score.
            uploader_id: ID of the uploader.
            
        Returns:
            List of created deliveries.
        """
        data = {
            "upload_id": upload_id,
            "kb_document_id": kb_document_id,
            "title": title,
            "regulator_id": regulator,
            "categories": categories or [],
            "chunk_count": chunk_count,
            "validation_score": validation_score,
            "uploader_id": uploader_id,
        }
        return self.dispatch_event(WebhookEventType.UPLOAD_PROCESSING_COMPLETED, data)
    
    def dispatch_upload_processing_failed(
        self,
        upload_id: str,
        error_message: str,
        error_stage: str,
        uploader_id: Optional[str] = None,
        file_name: Optional[str] = None,
    ) -> list[WebhookDelivery]:
        """Dispatch an upload processing failed event.
        
        Implements Requirement 3.6:
        - Triggers webhook on processing failed
        
        Args:
            upload_id: Upload identifier.
            error_message: Error message.
            error_stage: Stage where error occurred.
            uploader_id: ID of the uploader.
            file_name: Original file name.
            
        Returns:
            List of created deliveries.
        """
        data = {
            "upload_id": upload_id,
            "error_message": error_message,
            "error_stage": error_stage,
            "uploader_id": uploader_id,
            "file_name": file_name,
        }
        return self.dispatch_event(WebhookEventType.UPLOAD_PROCESSING_FAILED, data)
    
    def dispatch_document_replaced(
        self,
        new_document_id: str,
        previous_document_id: str,
        title: str,
        regulator: Optional[str] = None,
        version_number: int = 1,
        uploader_id: Optional[str] = None,
    ) -> list[WebhookDelivery]:
        """Dispatch a document replaced event.
        
        Implements Requirement 6.5:
        - Triggers webhook on document replaced
        
        Args:
            new_document_id: New document ID.
            previous_document_id: Previous version document ID.
            title: Document title.
            regulator: Regulator identifier.
            version_number: New version number.
            uploader_id: ID of the uploader.
            
        Returns:
            List of created deliveries.
        """
        data = {
            "new_document_id": new_document_id,
            "previous_document_id": previous_document_id,
            "title": title,
            "regulator_id": regulator,
            "version_number": version_number,
            "uploader_id": uploader_id,
        }
        return self.dispatch_event(WebhookEventType.UPLOAD_DOCUMENT_REPLACED, data)
    
    def _create_delivery(
        self,
        subscription: WebhookSubscription,
        event_type: WebhookEventType,
        data: dict[str, Any],
    ) -> WebhookDelivery:
        """Create a delivery for a subscription."""
        payload = WebhookPayload(
            event_type=event_type.value,
            data=data,
        )
        
        delivery = WebhookDelivery(
            subscription_id=subscription.id,
            event_type=event_type,
            payload=payload.to_dict(),
            max_attempts=self.max_retries,
        )
        
        self._deliveries[delivery.id] = delivery
        
        return delivery
    
    # ==================== Delivery ====================
    
    async def deliver(self, delivery: WebhookDelivery) -> bool:
        """Deliver a webhook.
        
        Args:
            delivery: Delivery to send.
            
        Returns:
            True if delivery was successful.
        """
        subscription = self._subscriptions.get(delivery.subscription_id)
        if not subscription:
            delivery.status = WebhookStatus.FAILED
            delivery.last_error = "Subscription not found"
            return False
        
        delivery.attempts += 1
        delivery.status = WebhookStatus.RETRYING if delivery.attempts > 1 else WebhookStatus.PENDING
        
        # Sign the payload
        payload_json = json.dumps(delivery.payload)
        signature = self._sign_payload(payload_json, subscription.secret)
        
        headers = {
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature,
            "X-Webhook-Event": delivery.event_type.value,
            "X-Webhook-Delivery-Id": delivery.id,
            "X-Webhook-Timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    subscription.url,
                    data=payload_json,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=self.delivery_timeout),
                ) as response:
                    delivery.response_status = response.status
                    
                    if 200 <= response.status < 300:
                        delivery.status = WebhookStatus.DELIVERED
                        delivery.delivered_at = datetime.now(timezone.utc)
                        
                        logger.info(
                            "webhook_delivered",
                            delivery_id=delivery.id,
                            subscription_id=subscription.id,
                            status=response.status,
                        )
                        
                        return True
                    else:
                        delivery.last_error = f"HTTP {response.status}"
                        
        except asyncio.TimeoutError:
            delivery.last_error = "Request timeout"
        except aiohttp.ClientError as e:
            delivery.last_error = str(e)
        except Exception as e:
            delivery.last_error = str(e)
        
        # Handle failure
        if delivery.can_retry:
            delivery.status = WebhookStatus.RETRYING
            delivery.next_retry_at = delivery.calculate_next_retry()
            self._pending_retries.append(delivery)
            
            logger.warning(
                "webhook_delivery_failed_will_retry",
                delivery_id=delivery.id,
                attempt=delivery.attempts,
                error=delivery.last_error,
                next_retry=delivery.next_retry_at.isoformat(),
            )
        else:
            delivery.status = WebhookStatus.DEAD_LETTER
            self._dead_letter_queue.append(delivery)
            
            logger.error(
                "webhook_delivery_failed_dead_letter",
                delivery_id=delivery.id,
                attempts=delivery.attempts,
                error=delivery.last_error,
            )
        
        return False
    
    def deliver_sync(self, delivery: WebhookDelivery) -> bool:
        """Synchronous wrapper for deliver.
        
        Args:
            delivery: Delivery to send.
            
        Returns:
            True if delivery was successful.
        """
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        return loop.run_until_complete(self.deliver(delivery))
    
    async def process_pending_retries(self) -> int:
        """Process pending retries.
        
        Returns:
            Number of deliveries processed.
        """
        now = datetime.now(timezone.utc)
        processed = 0
        
        # Get deliveries ready for retry
        ready = [
            d for d in self._pending_retries
            if d.next_retry_at and d.next_retry_at <= now
        ]
        
        for delivery in ready:
            self._pending_retries.remove(delivery)
            await self.deliver(delivery)
            processed += 1
        
        return processed
    
    def _sign_payload(self, payload: str, secret: str) -> str:
        """Sign a payload with HMAC-SHA256.
        
        Args:
            payload: Payload to sign.
            secret: Signing secret.
            
        Returns:
            Signature string.
        """
        signature = hmac.new(
            secret.encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()
        
        return f"sha256={signature}"
    
    def verify_signature(
        self,
        payload: str,
        signature: str,
        secret: str,
    ) -> bool:
        """Verify a webhook signature.
        
        Args:
            payload: Payload that was signed.
            signature: Signature to verify.
            secret: Signing secret.
            
        Returns:
            True if signature is valid.
        """
        expected = self._sign_payload(payload, secret)
        return hmac.compare_digest(expected, signature)
    
    # ==================== Dead Letter Queue ====================
    
    def get_dead_letter_queue(self) -> list[WebhookDelivery]:
        """Get all deliveries in the dead letter queue.
        
        Returns:
            List of failed deliveries.
        """
        return list(self._dead_letter_queue)
    
    def retry_dead_letter(self, delivery_id: str) -> Optional[WebhookDelivery]:
        """Retry a delivery from the dead letter queue.
        
        Args:
            delivery_id: ID of delivery to retry.
            
        Returns:
            Delivery if found and reset for retry.
        """
        for delivery in self._dead_letter_queue:
            if delivery.id == delivery_id:
                self._dead_letter_queue.remove(delivery)
                delivery.status = WebhookStatus.PENDING
                delivery.attempts = 0
                delivery.last_error = None
                delivery.next_retry_at = None
                return delivery
        return None
    
    def clear_dead_letter_queue(self) -> int:
        """Clear the dead letter queue.
        
        Returns:
            Number of deliveries cleared.
        """
        count = len(self._dead_letter_queue)
        self._dead_letter_queue.clear()
        return count
    
    # ==================== Statistics ====================
    
    def get_delivery_stats(self) -> dict[str, Any]:
        """Get delivery statistics.
        
        Returns:
            Dictionary with delivery stats.
        """
        deliveries = list(self._deliveries.values())
        
        return {
            "total_deliveries": len(deliveries),
            "delivered": len([d for d in deliveries if d.status == WebhookStatus.DELIVERED]),
            "pending": len([d for d in deliveries if d.status == WebhookStatus.PENDING]),
            "retrying": len([d for d in deliveries if d.status == WebhookStatus.RETRYING]),
            "failed": len([d for d in deliveries if d.status == WebhookStatus.FAILED]),
            "dead_letter": len(self._dead_letter_queue),
            "pending_retries": len(self._pending_retries),
            "subscriptions": len(self._subscriptions),
            "active_subscriptions": len([s for s in self._subscriptions.values() if s.is_active]),
        }
    
    def get_delivery(self, delivery_id: str) -> Optional[WebhookDelivery]:
        """Get a delivery by ID.
        
        Args:
            delivery_id: Delivery ID.
            
        Returns:
            WebhookDelivery or None.
        """
        return self._deliveries.get(delivery_id)
    
    def list_deliveries(
        self,
        subscription_id: Optional[str] = None,
        status: Optional[WebhookStatus] = None,
        limit: int = 100,
    ) -> list[WebhookDelivery]:
        """List deliveries with optional filtering.
        
        Args:
            subscription_id: Filter by subscription.
            status: Filter by status.
            limit: Maximum results.
            
        Returns:
            List of deliveries.
        """
        deliveries = list(self._deliveries.values())
        
        if subscription_id:
            deliveries = [d for d in deliveries if d.subscription_id == subscription_id]
        
        if status:
            deliveries = [d for d in deliveries if d.status == status]
        
        # Sort by created_at descending
        deliveries.sort(key=lambda d: d.created_at, reverse=True)
        
        return deliveries[:limit]

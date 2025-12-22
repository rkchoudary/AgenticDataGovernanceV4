"""
Azure Marketplace integration for the Agentic Data Governance System.

This module provides landing page handling, webhook processing, and
Metering API integration for Azure Marketplace.

Requirements: 38.1, 38.2, 38.3
"""

from datetime import datetime, timedelta
from typing import Optional, Any, Literal
from pydantic import BaseModel, Field
from uuid import uuid4
import json
import threading

from models.tenant import (
    Tenant,
    TenantConfig,
    Subscription,
    TenantProvisioningRequest,
    SubscriptionTier,
)
from models.metering import UsageAggregate


# Azure Marketplace specific types
AzureSubscriptionStatus = Literal[
    'NotStarted',
    'PendingFulfillmentStart',
    'Subscribed',
    'Suspended',
    'Unsubscribed'
]

AzureWebhookAction = Literal[
    'Subscribe',
    'Unsubscribe',
    'Suspend',
    'Reinstate',
    'ChangePlan',
    'ChangeQuantity',
    'Renew'
]

AzureMeteringDimension = Literal[
    'agent_invocations',
    'tokens_1k',
    'storage_gb',
    'api_calls',
    'users'
]


class AzureMarketplaceSubscription(BaseModel):
    """
    Azure Marketplace subscription details.
    
    Validates: Requirements 38.1, 38.2
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    marketplace_subscription_id: str  # Azure Marketplace subscription ID
    offer_id: str
    plan_id: str
    publisher_id: str
    subscription_name: str
    purchaser_email: str
    purchaser_tenant_id: str  # Azure AD tenant ID
    beneficiary_email: Optional[str] = None
    beneficiary_tenant_id: Optional[str] = None
    status: AzureSubscriptionStatus = 'NotStarted'
    term_start_date: Optional[datetime] = None
    term_end_date: Optional[datetime] = None
    is_free_trial: bool = False
    is_test: bool = False
    tenant_id: Optional[str] = None  # Our internal tenant ID
    quantity: int = 1
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class AzureMeteringRecord(BaseModel):
    """
    Azure Marketplace metering record.
    
    Validates: Requirements 38.3
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: str
    marketplace_subscription_id: str
    plan_id: str
    dimension: AzureMeteringDimension
    quantity: float
    effective_start_time: datetime
    usage_event_id: Optional[str] = None  # Returned by Azure
    status: Literal['pending', 'submitted', 'accepted', 'rejected', 'duplicate'] = 'pending'
    message_time: datetime = Field(default_factory=datetime.now)
    error_code: Optional[str] = None
    error_message: Optional[str] = None


class AzureWebhookPayload(BaseModel):
    """Azure Marketplace webhook payload."""
    id: str
    activityId: str
    publisherId: str
    offerId: str
    planId: str
    quantity: Optional[int] = None
    subscriptionId: str
    timeStamp: str
    action: AzureWebhookAction
    status: str
    operationRequestSource: str


class AzureLandingPageRequest(BaseModel):
    """Request from Azure Marketplace landing page."""
    token: str  # Marketplace token from redirect


class AzureMarketplaceLandingPage:
    """
    Handler for Azure Marketplace landing page flow.
    
    Processes the landing page redirect and resolves subscription details.
    
    Validates: Requirements 38.2
    """
    
    def __init__(
        self,
        publisher_id: str,
        offer_id: str,
        provisioning_callback: Optional[callable] = None
    ):
        """
        Initialize the landing page handler.
        
        Args:
            publisher_id: Azure Marketplace publisher ID.
            offer_id: Azure Marketplace offer ID.
            provisioning_callback: Callback for tenant provisioning.
        """
        self.publisher_id = publisher_id
        self.offer_id = offer_id
        self.provisioning_callback = provisioning_callback
        self._pending_tokens: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
    
    def handle_landing_page(self, token: str) -> dict[str, Any]:
        """
        Handle landing page redirect with marketplace token.
        
        Validates: Requirements 38.2
        
        Args:
            token: Marketplace token from redirect URL.
            
        Returns:
            Subscription resolution result.
        """
        # In production, would call Azure Marketplace API to resolve token
        # POST https://marketplaceapi.microsoft.com/api/saas/subscriptions/resolve
        
        # Store pending token for later activation
        with self._lock:
            self._pending_tokens[token] = {
                "received_at": datetime.now(),
                "status": "pending_resolution"
            }
        
        # Simulate token resolution
        resolved = self._resolve_token(token)
        
        return {
            "status": "resolved",
            "token": token,
            "subscription": resolved
        }
    
    def _resolve_token(self, token: str) -> dict[str, Any]:
        """
        Resolve marketplace token to subscription details.
        
        In production, calls Azure Marketplace Fulfillment API.
        """
        # Simulated resolution - in production would call Azure API
        return {
            "id": f"sub_{token[:8]}",
            "subscriptionName": "Data Governance Platform",
            "offerId": self.offer_id,
            "planId": "professional",
            "quantity": 1,
            "subscription": {
                "id": f"sub_{token[:8]}",
                "publisherId": self.publisher_id,
                "offerId": self.offer_id,
                "name": "Data Governance Platform",
                "saasSubscriptionStatus": "PendingFulfillmentStart",
                "beneficiary": {
                    "emailId": "user@example.com",
                    "objectId": str(uuid4()),
                    "tenantId": str(uuid4())
                },
                "purchaser": {
                    "emailId": "purchaser@example.com",
                    "objectId": str(uuid4()),
                    "tenantId": str(uuid4())
                },
                "planId": "professional",
                "term": {
                    "startDate": datetime.now().isoformat(),
                    "endDate": (datetime.now() + timedelta(days=30)).isoformat(),
                    "termUnit": "P1M"
                },
                "isTest": False,
                "isFreeTrial": False
            }
        }
    
    def activate_subscription(
        self,
        marketplace_subscription_id: str,
        plan_id: str,
        quantity: int = 1
    ) -> dict[str, Any]:
        """
        Activate a subscription after landing page flow.
        
        Validates: Requirements 38.2
        
        Args:
            marketplace_subscription_id: Azure subscription ID.
            plan_id: Selected plan ID.
            quantity: Number of seats/units.
            
        Returns:
            Activation result.
        """
        # In production, would call Azure Marketplace API
        # POST https://marketplaceapi.microsoft.com/api/saas/subscriptions/{subscriptionId}/activate
        
        return {
            "status": "activated",
            "subscription_id": marketplace_subscription_id,
            "plan_id": plan_id,
            "quantity": quantity
        }


class AzureMarketplaceWebhookHandler:
    """
    Handler for Azure Marketplace webhook notifications.
    
    Processes subscription lifecycle events.
    
    Validates: Requirements 38.2, 38.4
    """
    
    def __init__(
        self,
        publisher_id: str,
        offer_id: str,
        provisioning_callback: Optional[callable] = None,
        suspension_callback: Optional[callable] = None,
        cancellation_callback: Optional[callable] = None
    ):
        """
        Initialize the webhook handler.
        
        Args:
            publisher_id: Azure Marketplace publisher ID.
            offer_id: Azure Marketplace offer ID.
            provisioning_callback: Callback for tenant provisioning.
            suspension_callback: Callback for tenant suspension.
            cancellation_callback: Callback for tenant cancellation.
        """
        self.publisher_id = publisher_id
        self.offer_id = offer_id
        self.provisioning_callback = provisioning_callback
        self.suspension_callback = suspension_callback
        self.cancellation_callback = cancellation_callback
        self._subscriptions: dict[str, AzureMarketplaceSubscription] = {}
        self._operations: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
    
    def handle_webhook(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Handle incoming webhook notification.
        
        Validates: Requirements 38.2, 38.4
        
        Args:
            payload: Webhook payload from Azure Marketplace.
            
        Returns:
            Processing result.
        """
        webhook = AzureWebhookPayload(**payload)
        
        # Store operation for tracking
        with self._lock:
            self._operations[webhook.id] = {
                "payload": payload,
                "received_at": datetime.now(),
                "status": "processing"
            }
        
        action = webhook.action
        
        if action == "Subscribe":
            return self._handle_subscribe(webhook)
        elif action == "Unsubscribe":
            return self._handle_unsubscribe(webhook)
        elif action == "Suspend":
            return self._handle_suspend(webhook)
        elif action == "Reinstate":
            return self._handle_reinstate(webhook)
        elif action == "ChangePlan":
            return self._handle_change_plan(webhook)
        elif action == "ChangeQuantity":
            return self._handle_change_quantity(webhook)
        elif action == "Renew":
            return self._handle_renew(webhook)
        
        return {"status": "unknown_action", "action": action}
    
    def _handle_subscribe(self, webhook: AzureWebhookPayload) -> dict[str, Any]:
        """
        Handle subscription activation.
        
        Validates: Requirements 38.2
        """
        subscription = AzureMarketplaceSubscription(
            marketplace_subscription_id=webhook.subscriptionId,
            offer_id=webhook.offerId,
            plan_id=webhook.planId,
            publisher_id=webhook.publisherId,
            subscription_name=f"Subscription {webhook.subscriptionId[:8]}",
            purchaser_email="",  # Would be populated from API call
            purchaser_tenant_id="",
            status='Subscribed',
            quantity=webhook.quantity or 1
        )
        
        with self._lock:
            self._subscriptions[webhook.subscriptionId] = subscription
        
        # Trigger tenant provisioning
        tenant_id = None
        if self.provisioning_callback:
            try:
                result = self.provisioning_callback(
                    marketplace_subscription_id=webhook.subscriptionId,
                    plan_id=webhook.planId,
                    quantity=webhook.quantity or 1
                )
                tenant_id = result.get("tenant_id")
                subscription.tenant_id = tenant_id
            except Exception as e:
                return {
                    "status": "provisioning_failed",
                    "subscription_id": webhook.subscriptionId,
                    "error": str(e)
                }
        
        # Update operation status
        self._update_operation_status(webhook.id, "completed")
        
        return {
            "status": "success",
            "action": "Subscribe",
            "subscription_id": webhook.subscriptionId,
            "tenant_id": tenant_id
        }
    
    def _handle_unsubscribe(self, webhook: AzureWebhookPayload) -> dict[str, Any]:
        """
        Handle subscription cancellation.
        
        Validates: Requirements 38.4
        """
        subscription = self._subscriptions.get(webhook.subscriptionId)
        tenant_id = None
        
        if subscription:
            subscription.status = 'Unsubscribed'
            subscription.updated_at = datetime.now()
            tenant_id = subscription.tenant_id
        
        # Trigger cancellation callback
        if self.cancellation_callback and tenant_id:
            try:
                self.cancellation_callback(tenant_id=tenant_id)
            except Exception as e:
                return {
                    "status": "cancellation_callback_failed",
                    "subscription_id": webhook.subscriptionId,
                    "error": str(e)
                }
        
        self._update_operation_status(webhook.id, "completed")
        
        return {
            "status": "unsubscribed",
            "subscription_id": webhook.subscriptionId,
            "tenant_id": tenant_id
        }
    
    def _handle_suspend(self, webhook: AzureWebhookPayload) -> dict[str, Any]:
        """
        Handle subscription suspension.
        
        Validates: Requirements 38.4
        """
        subscription = self._subscriptions.get(webhook.subscriptionId)
        tenant_id = None
        
        if subscription:
            subscription.status = 'Suspended'
            subscription.updated_at = datetime.now()
            tenant_id = subscription.tenant_id
        
        # Trigger suspension callback
        if self.suspension_callback and tenant_id:
            try:
                self.suspension_callback(tenant_id=tenant_id)
            except Exception as e:
                return {
                    "status": "suspension_callback_failed",
                    "subscription_id": webhook.subscriptionId,
                    "error": str(e)
                }
        
        self._update_operation_status(webhook.id, "completed")
        
        return {
            "status": "suspended",
            "subscription_id": webhook.subscriptionId,
            "tenant_id": tenant_id
        }
    
    def _handle_reinstate(self, webhook: AzureWebhookPayload) -> dict[str, Any]:
        """
        Handle subscription reinstatement.
        
        Validates: Requirements 38.4
        """
        subscription = self._subscriptions.get(webhook.subscriptionId)
        tenant_id = None
        
        if subscription:
            subscription.status = 'Subscribed'
            subscription.updated_at = datetime.now()
            tenant_id = subscription.tenant_id
        
        self._update_operation_status(webhook.id, "completed")
        
        return {
            "status": "reinstated",
            "subscription_id": webhook.subscriptionId,
            "tenant_id": tenant_id
        }
    
    def _handle_change_plan(self, webhook: AzureWebhookPayload) -> dict[str, Any]:
        """
        Handle plan change (upgrade/downgrade).
        
        Validates: Requirements 38.4
        """
        subscription = self._subscriptions.get(webhook.subscriptionId)
        old_plan = None
        
        if subscription:
            old_plan = subscription.plan_id
            subscription.plan_id = webhook.planId
            subscription.updated_at = datetime.now()
        
        self._update_operation_status(webhook.id, "completed")
        
        return {
            "status": "plan_changed",
            "subscription_id": webhook.subscriptionId,
            "old_plan": old_plan,
            "new_plan": webhook.planId,
            "tenant_id": subscription.tenant_id if subscription else None
        }
    
    def _handle_change_quantity(self, webhook: AzureWebhookPayload) -> dict[str, Any]:
        """Handle quantity change."""
        subscription = self._subscriptions.get(webhook.subscriptionId)
        old_quantity = None
        
        if subscription:
            old_quantity = subscription.quantity
            subscription.quantity = webhook.quantity or 1
            subscription.updated_at = datetime.now()
        
        self._update_operation_status(webhook.id, "completed")
        
        return {
            "status": "quantity_changed",
            "subscription_id": webhook.subscriptionId,
            "old_quantity": old_quantity,
            "new_quantity": webhook.quantity,
            "tenant_id": subscription.tenant_id if subscription else None
        }
    
    def _handle_renew(self, webhook: AzureWebhookPayload) -> dict[str, Any]:
        """Handle subscription renewal."""
        subscription = self._subscriptions.get(webhook.subscriptionId)
        
        if subscription:
            subscription.updated_at = datetime.now()
            # Would update term dates from API response
        
        self._update_operation_status(webhook.id, "completed")
        
        return {
            "status": "renewed",
            "subscription_id": webhook.subscriptionId,
            "tenant_id": subscription.tenant_id if subscription else None
        }
    
    def _update_operation_status(self, operation_id: str, status: str) -> None:
        """Update operation status."""
        with self._lock:
            if operation_id in self._operations:
                self._operations[operation_id]["status"] = status
                self._operations[operation_id]["completed_at"] = datetime.now()
    
    def update_operation_status_api(
        self,
        subscription_id: str,
        operation_id: str,
        status: Literal['Success', 'Failure']
    ) -> dict[str, Any]:
        """
        Update operation status via Azure API.
        
        In production, calls Azure Marketplace API to acknowledge operation.
        
        PATCH https://marketplaceapi.microsoft.com/api/saas/subscriptions/{subscriptionId}/operations/{operationId}
        """
        return {
            "status": "acknowledged",
            "subscription_id": subscription_id,
            "operation_id": operation_id,
            "result": status
        }
    
    def get_subscription(
        self,
        marketplace_subscription_id: str
    ) -> Optional[AzureMarketplaceSubscription]:
        """Get subscription by marketplace subscription ID."""
        return self._subscriptions.get(marketplace_subscription_id)
    
    def get_subscription_by_tenant(
        self,
        tenant_id: str
    ) -> Optional[AzureMarketplaceSubscription]:
        """Get subscription by internal tenant ID."""
        for sub in self._subscriptions.values():
            if sub.tenant_id == tenant_id:
                return sub
        return None


class AzureMarketplaceMeteringService:
    """
    Azure Marketplace Metering API integration.
    
    Reports usage to Azure Marketplace for billing.
    
    Validates: Requirements 38.3
    """
    
    def __init__(self, publisher_id: str, offer_id: str):
        """
        Initialize the metering service.
        
        Args:
            publisher_id: Azure Marketplace publisher ID.
            offer_id: Azure Marketplace offer ID.
        """
        self.publisher_id = publisher_id
        self.offer_id = offer_id
        self._metering_records: list[AzureMeteringRecord] = []
        self._lock = threading.Lock()
    
    def report_usage(
        self,
        tenant_id: str,
        marketplace_subscription_id: str,
        plan_id: str,
        dimension: AzureMeteringDimension,
        quantity: float,
        effective_start_time: Optional[datetime] = None
    ) -> AzureMeteringRecord:
        """
        Report usage to Azure Marketplace.
        
        Validates: Requirements 38.3
        
        Args:
            tenant_id: Internal tenant ID.
            marketplace_subscription_id: Azure subscription ID.
            plan_id: Plan ID.
            dimension: Usage dimension.
            quantity: Usage quantity.
            effective_start_time: Start time for usage (defaults to current hour).
            
        Returns:
            The metering record.
        """
        # Azure requires usage to be reported for the previous hour
        if effective_start_time is None:
            now = datetime.now()
            effective_start_time = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
        
        record = AzureMeteringRecord(
            tenant_id=tenant_id,
            marketplace_subscription_id=marketplace_subscription_id,
            plan_id=plan_id,
            dimension=dimension,
            quantity=quantity,
            effective_start_time=effective_start_time
        )
        
        with self._lock:
            self._metering_records.append(record)
        
        # In production, would call Azure Marketplace Metering API
        # POST https://marketplaceapi.microsoft.com/api/usageEvent
        record.status = 'submitted'
        record.usage_event_id = str(uuid4())
        
        return record
    
    def report_batch_usage(
        self,
        usage_events: list[dict[str, Any]]
    ) -> list[AzureMeteringRecord]:
        """
        Report batch usage to Azure Marketplace.
        
        Validates: Requirements 38.3
        
        Args:
            usage_events: List of usage events.
            
        Returns:
            List of metering records.
        """
        # In production, would call Azure Marketplace Batch Usage API
        # POST https://marketplaceapi.microsoft.com/api/batchUsageEvent
        
        records = []
        for event in usage_events:
            record = self.report_usage(
                tenant_id=event['tenant_id'],
                marketplace_subscription_id=event['marketplace_subscription_id'],
                plan_id=event['plan_id'],
                dimension=event['dimension'],
                quantity=event['quantity'],
                effective_start_time=event.get('effective_start_time')
            )
            records.append(record)
        
        return records
    
    def report_from_aggregate(
        self,
        aggregate: UsageAggregate,
        marketplace_subscription_id: str,
        plan_id: str
    ) -> list[AzureMeteringRecord]:
        """
        Report usage from a UsageAggregate.
        
        Validates: Requirements 38.3
        
        Args:
            aggregate: Usage aggregate to report.
            marketplace_subscription_id: Azure subscription ID.
            plan_id: Plan ID.
            
        Returns:
            List of metering records.
        """
        records = []
        effective_time = aggregate.period_end
        
        # Report agent invocations
        if aggregate.agent_invocations > 0:
            records.append(self.report_usage(
                tenant_id=aggregate.tenant_id,
                marketplace_subscription_id=marketplace_subscription_id,
                plan_id=plan_id,
                dimension='agent_invocations',
                quantity=float(aggregate.agent_invocations),
                effective_start_time=effective_time
            ))
        
        # Report tokens (in thousands)
        tokens_1k = aggregate.total_tokens / 1000.0
        if tokens_1k > 0:
            records.append(self.report_usage(
                tenant_id=aggregate.tenant_id,
                marketplace_subscription_id=marketplace_subscription_id,
                plan_id=plan_id,
                dimension='tokens_1k',
                quantity=tokens_1k,
                effective_start_time=effective_time
            ))
        
        # Report storage (in GB)
        storage_gb = aggregate.total_storage_bytes / (1024 ** 3)
        if storage_gb > 0:
            records.append(self.report_usage(
                tenant_id=aggregate.tenant_id,
                marketplace_subscription_id=marketplace_subscription_id,
                plan_id=plan_id,
                dimension='storage_gb',
                quantity=storage_gb,
                effective_start_time=effective_time
            ))
        
        # Report API calls
        if aggregate.api_calls > 0:
            records.append(self.report_usage(
                tenant_id=aggregate.tenant_id,
                marketplace_subscription_id=marketplace_subscription_id,
                plan_id=plan_id,
                dimension='api_calls',
                quantity=float(aggregate.api_calls),
                effective_start_time=effective_time
            ))
        
        # Report active users
        if aggregate.active_users > 0:
            records.append(self.report_usage(
                tenant_id=aggregate.tenant_id,
                marketplace_subscription_id=marketplace_subscription_id,
                plan_id=plan_id,
                dimension='users',
                quantity=float(aggregate.active_users),
                effective_start_time=effective_time
            ))
        
        return records
    
    def get_metering_records(
        self,
        tenant_id: Optional[str] = None,
        marketplace_subscription_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> list[AzureMeteringRecord]:
        """Get metering records with optional filters."""
        with self._lock:
            records = list(self._metering_records)
        
        if tenant_id:
            records = [r for r in records if r.tenant_id == tenant_id]
        if marketplace_subscription_id:
            records = [r for r in records if r.marketplace_subscription_id == marketplace_subscription_id]
        if start_time:
            records = [r for r in records if r.effective_start_time >= start_time]
        if end_time:
            records = [r for r in records if r.effective_start_time <= end_time]
        
        return records


class AzureMarketplaceService:
    """
    Main Azure Marketplace service combining landing page, webhooks, and metering.
    
    Validates: Requirements 38.1, 38.2, 38.3
    """
    
    def __init__(
        self,
        publisher_id: str,
        offer_id: str,
        provisioning_callback: Optional[callable] = None,
        suspension_callback: Optional[callable] = None,
        cancellation_callback: Optional[callable] = None
    ):
        """
        Initialize the Azure Marketplace service.
        
        Args:
            publisher_id: Azure Marketplace publisher ID.
            offer_id: Azure Marketplace offer ID.
            provisioning_callback: Callback for tenant provisioning.
            suspension_callback: Callback for tenant suspension.
            cancellation_callback: Callback for tenant cancellation.
        """
        self.publisher_id = publisher_id
        self.offer_id = offer_id
        
        self.landing_page = AzureMarketplaceLandingPage(
            publisher_id=publisher_id,
            offer_id=offer_id,
            provisioning_callback=provisioning_callback
        )
        
        self.webhook_handler = AzureMarketplaceWebhookHandler(
            publisher_id=publisher_id,
            offer_id=offer_id,
            provisioning_callback=provisioning_callback,
            suspension_callback=suspension_callback,
            cancellation_callback=cancellation_callback
        )
        
        self.metering_service = AzureMarketplaceMeteringService(
            publisher_id=publisher_id,
            offer_id=offer_id
        )
    
    def handle_landing_page(self, token: str) -> dict[str, Any]:
        """Handle landing page redirect."""
        return self.landing_page.handle_landing_page(token)
    
    def activate_subscription(
        self,
        marketplace_subscription_id: str,
        plan_id: str,
        quantity: int = 1
    ) -> dict[str, Any]:
        """Activate a subscription."""
        return self.landing_page.activate_subscription(
            marketplace_subscription_id=marketplace_subscription_id,
            plan_id=plan_id,
            quantity=quantity
        )
    
    def handle_webhook(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Handle incoming webhook notification."""
        return self.webhook_handler.handle_webhook(payload)
    
    def report_usage(
        self,
        tenant_id: str,
        marketplace_subscription_id: str,
        plan_id: str,
        dimension: AzureMeteringDimension,
        quantity: float,
        effective_start_time: Optional[datetime] = None
    ) -> AzureMeteringRecord:
        """Report usage to Azure Marketplace."""
        return self.metering_service.report_usage(
            tenant_id=tenant_id,
            marketplace_subscription_id=marketplace_subscription_id,
            plan_id=plan_id,
            dimension=dimension,
            quantity=quantity,
            effective_start_time=effective_start_time
        )
    
    def report_aggregate_usage(
        self,
        aggregate: UsageAggregate,
        marketplace_subscription_id: str,
        plan_id: str
    ) -> list[AzureMeteringRecord]:
        """Report aggregated usage to Azure Marketplace."""
        return self.metering_service.report_from_aggregate(
            aggregate=aggregate,
            marketplace_subscription_id=marketplace_subscription_id,
            plan_id=plan_id
        )
    
    def get_subscription(
        self,
        marketplace_subscription_id: str
    ) -> Optional[AzureMarketplaceSubscription]:
        """Get subscription by marketplace subscription ID."""
        return self.webhook_handler.get_subscription(marketplace_subscription_id)
    
    def get_subscription_by_tenant(
        self,
        tenant_id: str
    ) -> Optional[AzureMarketplaceSubscription]:
        """Get subscription by internal tenant ID."""
        return self.webhook_handler.get_subscription_by_tenant(tenant_id)


# Global service instance
_azure_marketplace_service: Optional[AzureMarketplaceService] = None


def get_azure_marketplace_service(
    publisher_id: Optional[str] = None,
    offer_id: Optional[str] = None,
    provisioning_callback: Optional[callable] = None,
    suspension_callback: Optional[callable] = None,
    cancellation_callback: Optional[callable] = None
) -> AzureMarketplaceService:
    """
    Get the global Azure Marketplace service instance.
    
    Args:
        publisher_id: Azure Marketplace publisher ID (required on first call).
        offer_id: Azure Marketplace offer ID (required on first call).
        provisioning_callback: Callback for tenant provisioning.
        suspension_callback: Callback for tenant suspension.
        cancellation_callback: Callback for tenant cancellation.
        
    Returns:
        AzureMarketplaceService instance.
    """
    global _azure_marketplace_service
    if _azure_marketplace_service is None:
        if not publisher_id or not offer_id:
            raise ValueError("publisher_id and offer_id required for initial service creation")
        _azure_marketplace_service = AzureMarketplaceService(
            publisher_id=publisher_id,
            offer_id=offer_id,
            provisioning_callback=provisioning_callback,
            suspension_callback=suspension_callback,
            cancellation_callback=cancellation_callback
        )
    return _azure_marketplace_service

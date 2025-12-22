"""
AWS Marketplace integration for the Agentic Data Governance System.

This module provides SNS subscription handling for provisioning and
Metering Service usage reporting for AWS Marketplace.

Requirements: 37.1, 37.2, 37.3
"""

from datetime import datetime, timedelta
from typing import Optional, Any, Literal
from pydantic import BaseModel, Field
from uuid import uuid4
import json
import hashlib
import hmac
import base64
import threading

from models.tenant import (
    Tenant,
    TenantConfig,
    Subscription,
    TenantProvisioningRequest,
    SubscriptionTier,
)
from models.metering import UsageAggregate


# AWS Marketplace specific types
AWSMarketplaceAction = Literal[
    'subscribe-success',
    'subscribe-fail',
    'unsubscribe-pending',
    'unsubscribe-success',
    'entitlement-updated'
]

AWSMeteringDimension = Literal[
    'agent_invocations',
    'tokens_1k',
    'storage_gb',
    'api_calls',
    'users'
]


class AWSMarketplaceSubscription(BaseModel):
    """
    AWS Marketplace subscription details.
    
    Validates: Requirements 37.1, 37.2
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    customer_identifier: str  # AWS Marketplace customer ID
    product_code: str
    customer_aws_account_id: str
    action: AWSMarketplaceAction
    tenant_id: Optional[str] = None
    entitlements: dict[str, Any] = Field(default_factory=dict)
    free_trial_end_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class AWSMeteringRecord(BaseModel):
    """
    AWS Marketplace metering record.
    
    Validates: Requirements 37.3
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: str
    customer_identifier: str
    product_code: str
    dimension: AWSMeteringDimension
    quantity: int
    timestamp: datetime = Field(default_factory=datetime.now)
    usage_record_id: Optional[str] = None  # Returned by AWS
    status: Literal['pending', 'submitted', 'accepted', 'rejected'] = 'pending'
    error_message: Optional[str] = None


class SNSNotification(BaseModel):
    """AWS SNS notification payload."""
    Type: str
    MessageId: str
    TopicArn: str
    Subject: Optional[str] = None
    Message: str
    Timestamp: str
    SignatureVersion: str
    Signature: str
    SigningCertURL: str
    UnsubscribeURL: Optional[str] = None


class AWSMarketplaceSNSHandler:
    """
    Handler for AWS Marketplace SNS notifications.
    
    Processes subscription events and triggers tenant provisioning.
    
    Validates: Requirements 37.2
    """
    
    def __init__(
        self,
        product_code: str,
        provisioning_callback: Optional[callable] = None,
        region: str = "us-east-1"
    ):
        """
        Initialize the SNS handler.
        
        Args:
            product_code: AWS Marketplace product code.
            provisioning_callback: Callback for tenant provisioning.
            region: AWS region.
        """
        self.product_code = product_code
        self.provisioning_callback = provisioning_callback
        self.region = region
        self._subscriptions: dict[str, AWSMarketplaceSubscription] = {}
        self._lock = threading.Lock()
    
    def handle_notification(self, notification_body: dict[str, Any]) -> dict[str, Any]:
        """
        Handle an incoming SNS notification.
        
        Validates: Requirements 37.2
        
        Args:
            notification_body: The SNS notification payload.
            
        Returns:
            Processing result with status and details.
        """
        notification = SNSNotification(**notification_body)
        
        # Handle subscription confirmation
        if notification.Type == "SubscriptionConfirmation":
            return self._handle_subscription_confirmation(notification)
        
        # Handle notification
        if notification.Type == "Notification":
            return self._handle_marketplace_notification(notification)
        
        return {"status": "ignored", "type": notification.Type}
    
    def _handle_subscription_confirmation(
        self,
        notification: SNSNotification
    ) -> dict[str, Any]:
        """Handle SNS subscription confirmation."""
        # In production, would confirm the subscription via the SubscribeURL
        return {
            "status": "confirmation_required",
            "topic_arn": notification.TopicArn,
            "message_id": notification.MessageId
        }
    
    def _handle_marketplace_notification(
        self,
        notification: SNSNotification
    ) -> dict[str, Any]:
        """
        Handle AWS Marketplace notification.
        
        Validates: Requirements 37.2
        """
        try:
            message = json.loads(notification.Message)
        except json.JSONDecodeError:
            return {"status": "error", "message": "Invalid JSON in notification"}
        
        action = message.get("action")
        customer_identifier = message.get("customer-identifier")
        product_code = message.get("product-code")
        
        if product_code != self.product_code:
            return {
                "status": "ignored",
                "message": f"Product code mismatch: {product_code}"
            }
        
        if action == "subscribe-success":
            return self._handle_subscribe_success(message)
        elif action == "subscribe-fail":
            return self._handle_subscribe_fail(message)
        elif action == "unsubscribe-pending":
            return self._handle_unsubscribe_pending(message)
        elif action == "unsubscribe-success":
            return self._handle_unsubscribe_success(message)
        elif action == "entitlement-updated":
            return self._handle_entitlement_updated(message)
        
        return {"status": "unknown_action", "action": action}
    
    def _handle_subscribe_success(self, message: dict[str, Any]) -> dict[str, Any]:
        """
        Handle successful subscription.
        
        Auto-creates tenant on successful subscription.
        
        Validates: Requirements 37.2
        """
        customer_identifier = message.get("customer-identifier")
        customer_aws_account_id = message.get("customer-aws-account-id", "")
        
        # Create subscription record
        subscription = AWSMarketplaceSubscription(
            customer_identifier=customer_identifier,
            product_code=self.product_code,
            customer_aws_account_id=customer_aws_account_id,
            action='subscribe-success',
            entitlements=message.get("entitlements", {}),
            free_trial_end_date=self._parse_trial_date(message)
        )
        
        with self._lock:
            self._subscriptions[customer_identifier] = subscription
        
        # Trigger tenant provisioning
        tenant_id = None
        if self.provisioning_callback:
            try:
                result = self.provisioning_callback(
                    customer_identifier=customer_identifier,
                    customer_aws_account_id=customer_aws_account_id,
                    entitlements=subscription.entitlements,
                    free_trial_end_date=subscription.free_trial_end_date
                )
                tenant_id = result.get("tenant_id")
                subscription.tenant_id = tenant_id
            except Exception as e:
                return {
                    "status": "provisioning_failed",
                    "customer_identifier": customer_identifier,
                    "error": str(e)
                }
        
        return {
            "status": "success",
            "action": "subscribe-success",
            "customer_identifier": customer_identifier,
            "tenant_id": tenant_id,
            "subscription_id": subscription.id
        }
    
    def _handle_subscribe_fail(self, message: dict[str, Any]) -> dict[str, Any]:
        """Handle failed subscription."""
        customer_identifier = message.get("customer-identifier")
        return {
            "status": "subscription_failed",
            "customer_identifier": customer_identifier,
            "reason": message.get("failure-reason", "Unknown")
        }
    
    def _handle_unsubscribe_pending(self, message: dict[str, Any]) -> dict[str, Any]:
        """Handle pending unsubscription."""
        customer_identifier = message.get("customer-identifier")
        
        subscription = self._subscriptions.get(customer_identifier)
        if subscription:
            subscription.action = 'unsubscribe-pending'
            subscription.updated_at = datetime.now()
        
        return {
            "status": "unsubscribe_pending",
            "customer_identifier": customer_identifier,
            "tenant_id": subscription.tenant_id if subscription else None
        }
    
    def _handle_unsubscribe_success(self, message: dict[str, Any]) -> dict[str, Any]:
        """
        Handle successful unsubscription.
        
        Validates: Requirements 37.4
        """
        customer_identifier = message.get("customer-identifier")
        
        subscription = self._subscriptions.get(customer_identifier)
        tenant_id = None
        if subscription:
            subscription.action = 'unsubscribe-success'
            subscription.updated_at = datetime.now()
            tenant_id = subscription.tenant_id
        
        return {
            "status": "unsubscribed",
            "customer_identifier": customer_identifier,
            "tenant_id": tenant_id
        }
    
    def _handle_entitlement_updated(self, message: dict[str, Any]) -> dict[str, Any]:
        """
        Handle entitlement update (upgrade/downgrade).
        
        Validates: Requirements 37.4
        """
        customer_identifier = message.get("customer-identifier")
        new_entitlements = message.get("entitlements", {})
        
        subscription = self._subscriptions.get(customer_identifier)
        if subscription:
            subscription.entitlements = new_entitlements
            subscription.action = 'entitlement-updated'
            subscription.updated_at = datetime.now()
        
        return {
            "status": "entitlement_updated",
            "customer_identifier": customer_identifier,
            "entitlements": new_entitlements,
            "tenant_id": subscription.tenant_id if subscription else None
        }
    
    def _parse_trial_date(self, message: dict[str, Any]) -> Optional[datetime]:
        """Parse free trial end date from message."""
        trial_date_str = message.get("free-trial-end-date")
        if trial_date_str:
            try:
                return datetime.fromisoformat(trial_date_str.replace("Z", "+00:00"))
            except ValueError:
                pass
        return None
    
    def get_subscription(self, customer_identifier: str) -> Optional[AWSMarketplaceSubscription]:
        """Get subscription by customer identifier."""
        return self._subscriptions.get(customer_identifier)
    
    def get_subscription_by_tenant(self, tenant_id: str) -> Optional[AWSMarketplaceSubscription]:
        """Get subscription by tenant ID."""
        for sub in self._subscriptions.values():
            if sub.tenant_id == tenant_id:
                return sub
        return None


class AWSMarketplaceMeteringService:
    """
    AWS Marketplace Metering Service integration.
    
    Reports usage to AWS Marketplace for billing.
    
    Validates: Requirements 37.3
    """
    
    def __init__(
        self,
        product_code: str,
        region: str = "us-east-1"
    ):
        """
        Initialize the metering service.
        
        Args:
            product_code: AWS Marketplace product code.
            region: AWS region.
        """
        self.product_code = product_code
        self.region = region
        self._metering_records: list[AWSMeteringRecord] = []
        self._lock = threading.Lock()
    
    def report_usage(
        self,
        tenant_id: str,
        customer_identifier: str,
        dimension: AWSMeteringDimension,
        quantity: int,
        timestamp: Optional[datetime] = None
    ) -> AWSMeteringRecord:
        """
        Report usage to AWS Marketplace.
        
        Validates: Requirements 37.3
        
        Args:
            tenant_id: Internal tenant ID.
            customer_identifier: AWS Marketplace customer ID.
            dimension: Usage dimension.
            quantity: Usage quantity.
            timestamp: Usage timestamp (defaults to now).
            
        Returns:
            The metering record.
        """
        record = AWSMeteringRecord(
            tenant_id=tenant_id,
            customer_identifier=customer_identifier,
            product_code=self.product_code,
            dimension=dimension,
            quantity=quantity,
            timestamp=timestamp or datetime.now()
        )
        
        with self._lock:
            self._metering_records.append(record)
        
        # In production, would call AWS Marketplace Metering API
        # boto3.client('meteringmarketplace').meter_usage(...)
        record.status = 'submitted'
        
        return record
    
    def report_batch_usage(
        self,
        tenant_id: str,
        customer_identifier: str,
        usage_records: list[dict[str, Any]]
    ) -> list[AWSMeteringRecord]:
        """
        Report batch usage to AWS Marketplace.
        
        Validates: Requirements 37.3
        
        Args:
            tenant_id: Internal tenant ID.
            customer_identifier: AWS Marketplace customer ID.
            usage_records: List of usage records with dimension and quantity.
            
        Returns:
            List of metering records.
        """
        records = []
        for usage in usage_records:
            record = self.report_usage(
                tenant_id=tenant_id,
                customer_identifier=customer_identifier,
                dimension=usage['dimension'],
                quantity=usage['quantity'],
                timestamp=usage.get('timestamp')
            )
            records.append(record)
        return records
    
    def report_from_aggregate(
        self,
        aggregate: UsageAggregate,
        customer_identifier: str
    ) -> list[AWSMeteringRecord]:
        """
        Report usage from a UsageAggregate.
        
        Validates: Requirements 37.3
        
        Args:
            aggregate: Usage aggregate to report.
            customer_identifier: AWS Marketplace customer ID.
            
        Returns:
            List of metering records.
        """
        records = []
        
        # Report agent invocations
        if aggregate.agent_invocations > 0:
            records.append(self.report_usage(
                tenant_id=aggregate.tenant_id,
                customer_identifier=customer_identifier,
                dimension='agent_invocations',
                quantity=aggregate.agent_invocations,
                timestamp=aggregate.period_end
            ))
        
        # Report tokens (in thousands)
        tokens_1k = aggregate.total_tokens // 1000
        if tokens_1k > 0:
            records.append(self.report_usage(
                tenant_id=aggregate.tenant_id,
                customer_identifier=customer_identifier,
                dimension='tokens_1k',
                quantity=tokens_1k,
                timestamp=aggregate.period_end
            ))
        
        # Report storage (in GB, rounded up)
        storage_gb = int(aggregate.total_storage_bytes / (1024 ** 3)) + 1
        if storage_gb > 0:
            records.append(self.report_usage(
                tenant_id=aggregate.tenant_id,
                customer_identifier=customer_identifier,
                dimension='storage_gb',
                quantity=storage_gb,
                timestamp=aggregate.period_end
            ))
        
        # Report API calls
        if aggregate.api_calls > 0:
            records.append(self.report_usage(
                tenant_id=aggregate.tenant_id,
                customer_identifier=customer_identifier,
                dimension='api_calls',
                quantity=aggregate.api_calls,
                timestamp=aggregate.period_end
            ))
        
        # Report active users
        if aggregate.active_users > 0:
            records.append(self.report_usage(
                tenant_id=aggregate.tenant_id,
                customer_identifier=customer_identifier,
                dimension='users',
                quantity=aggregate.active_users,
                timestamp=aggregate.period_end
            ))
        
        return records
    
    def get_metering_records(
        self,
        tenant_id: Optional[str] = None,
        customer_identifier: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> list[AWSMeteringRecord]:
        """Get metering records with optional filters."""
        with self._lock:
            records = list(self._metering_records)
        
        if tenant_id:
            records = [r for r in records if r.tenant_id == tenant_id]
        if customer_identifier:
            records = [r for r in records if r.customer_identifier == customer_identifier]
        if start_time:
            records = [r for r in records if r.timestamp >= start_time]
        if end_time:
            records = [r for r in records if r.timestamp <= end_time]
        
        return records


class AWSMarketplaceService:
    """
    Main AWS Marketplace service combining SNS handling and metering.
    
    Validates: Requirements 37.1, 37.2, 37.3
    """
    
    def __init__(
        self,
        product_code: str,
        region: str = "us-east-1",
        provisioning_callback: Optional[callable] = None
    ):
        """
        Initialize the AWS Marketplace service.
        
        Args:
            product_code: AWS Marketplace product code.
            region: AWS region.
            provisioning_callback: Callback for tenant provisioning.
        """
        self.product_code = product_code
        self.region = region
        
        self.sns_handler = AWSMarketplaceSNSHandler(
            product_code=product_code,
            provisioning_callback=provisioning_callback,
            region=region
        )
        
        self.metering_service = AWSMarketplaceMeteringService(
            product_code=product_code,
            region=region
        )
    
    def handle_sns_notification(self, notification_body: dict[str, Any]) -> dict[str, Any]:
        """Handle incoming SNS notification."""
        return self.sns_handler.handle_notification(notification_body)
    
    def report_usage(
        self,
        tenant_id: str,
        customer_identifier: str,
        dimension: AWSMeteringDimension,
        quantity: int,
        timestamp: Optional[datetime] = None
    ) -> AWSMeteringRecord:
        """Report usage to AWS Marketplace."""
        return self.metering_service.report_usage(
            tenant_id=tenant_id,
            customer_identifier=customer_identifier,
            dimension=dimension,
            quantity=quantity,
            timestamp=timestamp
        )
    
    def report_aggregate_usage(
        self,
        aggregate: UsageAggregate,
        customer_identifier: str
    ) -> list[AWSMeteringRecord]:
        """Report aggregated usage to AWS Marketplace."""
        return self.metering_service.report_from_aggregate(
            aggregate=aggregate,
            customer_identifier=customer_identifier
        )
    
    def get_subscription(self, customer_identifier: str) -> Optional[AWSMarketplaceSubscription]:
        """Get subscription by customer identifier."""
        return self.sns_handler.get_subscription(customer_identifier)
    
    def get_subscription_by_tenant(self, tenant_id: str) -> Optional[AWSMarketplaceSubscription]:
        """Get subscription by tenant ID."""
        return self.sns_handler.get_subscription_by_tenant(tenant_id)
    
    def resolve_customer(self, registration_token: str) -> dict[str, Any]:
        """
        Resolve customer from registration token.
        
        In production, calls AWS Marketplace API to resolve the customer.
        
        Validates: Requirements 37.2
        """
        # In production: boto3.client('marketplace-entitlement').resolve_customer(...)
        return {
            "customer_identifier": f"cust_{registration_token[:8]}",
            "product_code": self.product_code
        }
    
    def get_entitlements(self, customer_identifier: str) -> dict[str, Any]:
        """
        Get customer entitlements.
        
        In production, calls AWS Marketplace Entitlement Service.
        
        Validates: Requirements 37.1
        """
        # In production: boto3.client('marketplace-entitlement').get_entitlements(...)
        subscription = self.sns_handler.get_subscription(customer_identifier)
        if subscription:
            return subscription.entitlements
        return {}


# Global service instance
_aws_marketplace_service: Optional[AWSMarketplaceService] = None


def get_aws_marketplace_service(
    product_code: Optional[str] = None,
    region: str = "us-east-1",
    provisioning_callback: Optional[callable] = None
) -> AWSMarketplaceService:
    """
    Get the global AWS Marketplace service instance.
    
    Args:
        product_code: AWS Marketplace product code (required on first call).
        region: AWS region.
        provisioning_callback: Callback for tenant provisioning.
        
    Returns:
        AWSMarketplaceService instance.
    """
    global _aws_marketplace_service
    if _aws_marketplace_service is None:
        if not product_code:
            raise ValueError("product_code required for initial service creation")
        _aws_marketplace_service = AWSMarketplaceService(
            product_code=product_code,
            region=region,
            provisioning_callback=provisioning_callback
        )
    return _aws_marketplace_service

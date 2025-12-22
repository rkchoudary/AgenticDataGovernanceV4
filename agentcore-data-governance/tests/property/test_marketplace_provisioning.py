"""
**Feature: agentcore-python-refactor, Property 27: Marketplace Subscription Provisioning**

For any valid marketplace subscription event (AWS or Azure), the system SHALL
create a corresponding tenant with correct configuration and the subscription
SHALL be trackable by both marketplace ID and internal tenant ID.

**Validates: Requirements 37.2, 38.2**
"""

import pytest
from datetime import datetime, timedelta
from hypothesis import given, settings, assume
from hypothesis import strategies as st
from uuid import uuid4

from services.marketplace.aws_marketplace import (
    AWSMarketplaceSNSHandler,
    AWSMarketplaceService,
    AWSMarketplaceSubscription,
    AWSMeteringRecord,
)
from services.marketplace.azure_marketplace import (
    AzureMarketplaceWebhookHandler,
    AzureMarketplaceService,
    AzureMarketplaceSubscription,
    AzureMeteringRecord,
)


# Strategies for generating test data
customer_id_strategy = st.text(
    min_size=8,
    max_size=32,
    alphabet=st.characters(whitelist_categories=('L', 'N'))
).filter(lambda s: len(s.strip()) >= 8)

aws_account_id_strategy = st.text(
    min_size=12,
    max_size=12,
    alphabet=st.characters(whitelist_categories=('N',))
)

product_code_strategy = st.text(
    min_size=5,
    max_size=20,
    alphabet=st.characters(whitelist_categories=('L', 'N'))
).filter(lambda s: len(s.strip()) >= 5)


plan_id_strategy = st.sampled_from(['starter', 'professional', 'enterprise'])

quantity_strategy = st.integers(min_value=1, max_value=1000)


@st.composite
def aws_subscribe_message_strategy(draw, product_code: str):
    """Generate an AWS Marketplace subscribe-success message."""
    return {
        "action": "subscribe-success",
        "customer-identifier": draw(customer_id_strategy),
        "customer-aws-account-id": draw(aws_account_id_strategy),
        "product-code": product_code,
        "entitlements": {
            "tier": draw(plan_id_strategy),
            "users": draw(quantity_strategy)
        },
        "free-trial-end-date": None
    }


@st.composite
def azure_subscribe_webhook_strategy(draw):
    """Generate an Azure Marketplace Subscribe webhook payload."""
    return {
        "id": str(uuid4()),
        "activityId": str(uuid4()),
        "publisherId": "test-publisher",
        "offerId": "data-governance",
        "planId": draw(plan_id_strategy),
        "quantity": draw(quantity_strategy),
        "subscriptionId": f"sub-{draw(customer_id_strategy)}",
        "timeStamp": datetime.now().isoformat(),
        "action": "Subscribe",
        "status": "InProgress",
        "operationRequestSource": "Azure"
    }


class TestAWSMarketplaceProvisioning:
    """
    Property tests for AWS Marketplace subscription provisioning.
    
    **Validates: Requirements 37.2**
    """
    
    @settings(max_examples=100)
    @given(
        customer_id=customer_id_strategy,
        aws_account_id=aws_account_id_strategy,
        plan=plan_id_strategy,
        quantity=quantity_strategy
    )
    def test_subscribe_success_creates_subscription(
        self,
        customer_id: str,
        aws_account_id: str,
        plan: str,
        quantity: int
    ):
        """
        **Property 27: Marketplace Subscription Provisioning**
        **Validates: Requirements 37.2**
        
        For any valid subscribe-success event, a subscription record SHALL be created
        with the correct customer identifier and entitlements.
        """
        product_code = "test-product-code"
        provisioned_tenants = []
        
        def provisioning_callback(**kwargs):
            tenant_id = f"tenant-{kwargs['customer_identifier'][:8]}"
            provisioned_tenants.append({
                "tenant_id": tenant_id,
                "customer_identifier": kwargs['customer_identifier'],
                "entitlements": kwargs.get('entitlements', {})
            })
            return {"tenant_id": tenant_id}
        
        handler = AWSMarketplaceSNSHandler(
            product_code=product_code,
            provisioning_callback=provisioning_callback
        )
        
        # Create subscribe-success notification
        notification = {
            "Type": "Notification",
            "MessageId": str(uuid4()),
            "TopicArn": "arn:aws:sns:us-east-1:123456789:marketplace",
            "Message": str({
                "action": "subscribe-success",
                "customer-identifier": customer_id,
                "customer-aws-account-id": aws_account_id,
                "product-code": product_code,
                "entitlements": {"tier": plan, "users": quantity}
            }).replace("'", '"'),
            "Timestamp": datetime.now().isoformat(),
            "SignatureVersion": "1",
            "Signature": "test-signature",
            "SigningCertURL": "https://example.com/cert"
        }
        
        import json
        notification["Message"] = json.dumps({
            "action": "subscribe-success",
            "customer-identifier": customer_id,
            "customer-aws-account-id": aws_account_id,
            "product-code": product_code,
            "entitlements": {"tier": plan, "users": quantity}
        })
        
        result = handler.handle_notification(notification)
        
        # Verify subscription was created
        assert result["status"] == "success", \
            f"Subscribe should succeed. Got: {result}"
        assert result["customer_identifier"] == customer_id, \
            "Customer identifier should match"
        
        # Verify subscription is retrievable
        subscription = handler.get_subscription(customer_id)
        assert subscription is not None, \
            "Subscription should be retrievable by customer ID"
        assert subscription.customer_identifier == customer_id, \
            "Subscription customer ID should match"
        assert subscription.product_code == product_code, \
            "Subscription product code should match"
        assert subscription.action == "subscribe-success", \
            "Subscription action should be subscribe-success"
        
        # Verify provisioning callback was called
        assert len(provisioned_tenants) == 1, \
            "Provisioning callback should be called exactly once"
        assert provisioned_tenants[0]["customer_identifier"] == customer_id, \
            "Provisioning should receive correct customer ID"


    @settings(max_examples=100)
    @given(
        customer_id=customer_id_strategy,
        aws_account_id=aws_account_id_strategy
    )
    def test_subscription_retrievable_by_tenant_id(
        self,
        customer_id: str,
        aws_account_id: str
    ):
        """
        **Property 27: Marketplace Subscription Provisioning**
        **Validates: Requirements 37.2**
        
        For any provisioned subscription, it SHALL be retrievable by tenant ID.
        """
        product_code = "test-product-code"
        tenant_id = f"tenant-{customer_id[:8]}"
        
        def provisioning_callback(**kwargs):
            return {"tenant_id": tenant_id}
        
        handler = AWSMarketplaceSNSHandler(
            product_code=product_code,
            provisioning_callback=provisioning_callback
        )
        
        import json
        notification = {
            "Type": "Notification",
            "MessageId": str(uuid4()),
            "TopicArn": "arn:aws:sns:us-east-1:123456789:marketplace",
            "Message": json.dumps({
                "action": "subscribe-success",
                "customer-identifier": customer_id,
                "customer-aws-account-id": aws_account_id,
                "product-code": product_code,
                "entitlements": {}
            }),
            "Timestamp": datetime.now().isoformat(),
            "SignatureVersion": "1",
            "Signature": "test-signature",
            "SigningCertURL": "https://example.com/cert"
        }
        
        handler.handle_notification(notification)
        
        # Verify subscription is retrievable by tenant ID
        subscription = handler.get_subscription_by_tenant(tenant_id)
        assert subscription is not None, \
            "Subscription should be retrievable by tenant ID"
        assert subscription.tenant_id == tenant_id, \
            "Subscription tenant ID should match"
        assert subscription.customer_identifier == customer_id, \
            "Subscription customer ID should match"


class TestAzureMarketplaceProvisioning:
    """
    Property tests for Azure Marketplace subscription provisioning.
    
    **Validates: Requirements 38.2**
    """
    
    @settings(max_examples=100)
    @given(
        subscription_id=customer_id_strategy,
        plan=plan_id_strategy,
        quantity=quantity_strategy
    )
    def test_subscribe_webhook_creates_subscription(
        self,
        subscription_id: str,
        plan: str,
        quantity: int
    ):
        """
        **Property 27: Marketplace Subscription Provisioning**
        **Validates: Requirements 38.2**
        
        For any valid Subscribe webhook, a subscription record SHALL be created
        with the correct subscription ID and plan.
        """
        provisioned_tenants = []
        
        def provisioning_callback(**kwargs):
            tenant_id = f"tenant-{kwargs['marketplace_subscription_id'][:8]}"
            provisioned_tenants.append({
                "tenant_id": tenant_id,
                "subscription_id": kwargs['marketplace_subscription_id'],
                "plan_id": kwargs['plan_id']
            })
            return {"tenant_id": tenant_id}
        
        handler = AzureMarketplaceWebhookHandler(
            publisher_id="test-publisher",
            offer_id="data-governance",
            provisioning_callback=provisioning_callback
        )
        
        webhook_payload = {
            "id": str(uuid4()),
            "activityId": str(uuid4()),
            "publisherId": "test-publisher",
            "offerId": "data-governance",
            "planId": plan,
            "quantity": quantity,
            "subscriptionId": subscription_id,
            "timeStamp": datetime.now().isoformat(),
            "action": "Subscribe",
            "status": "InProgress",
            "operationRequestSource": "Azure"
        }
        
        result = handler.handle_webhook(webhook_payload)
        
        # Verify subscription was created
        assert result["status"] == "success", \
            f"Subscribe should succeed. Got: {result}"
        assert result["subscription_id"] == subscription_id, \
            "Subscription ID should match"
        
        # Verify subscription is retrievable
        subscription = handler.get_subscription(subscription_id)
        assert subscription is not None, \
            "Subscription should be retrievable by subscription ID"
        assert subscription.marketplace_subscription_id == subscription_id, \
            "Subscription ID should match"
        assert subscription.plan_id == plan, \
            "Plan ID should match"
        assert subscription.status == "Subscribed", \
            "Status should be Subscribed"
        
        # Verify provisioning callback was called
        assert len(provisioned_tenants) == 1, \
            "Provisioning callback should be called exactly once"
        assert provisioned_tenants[0]["subscription_id"] == subscription_id, \
            "Provisioning should receive correct subscription ID"


    @settings(max_examples=100)
    @given(
        subscription_id=customer_id_strategy,
        plan=plan_id_strategy
    )
    def test_subscription_retrievable_by_tenant_id(
        self,
        subscription_id: str,
        plan: str
    ):
        """
        **Property 27: Marketplace Subscription Provisioning**
        **Validates: Requirements 38.2**
        
        For any provisioned Azure subscription, it SHALL be retrievable by tenant ID.
        """
        tenant_id = f"tenant-{subscription_id[:8]}"
        
        def provisioning_callback(**kwargs):
            return {"tenant_id": tenant_id}
        
        handler = AzureMarketplaceWebhookHandler(
            publisher_id="test-publisher",
            offer_id="data-governance",
            provisioning_callback=provisioning_callback
        )
        
        webhook_payload = {
            "id": str(uuid4()),
            "activityId": str(uuid4()),
            "publisherId": "test-publisher",
            "offerId": "data-governance",
            "planId": plan,
            "quantity": 1,
            "subscriptionId": subscription_id,
            "timeStamp": datetime.now().isoformat(),
            "action": "Subscribe",
            "status": "InProgress",
            "operationRequestSource": "Azure"
        }
        
        handler.handle_webhook(webhook_payload)
        
        # Verify subscription is retrievable by tenant ID
        subscription = handler.get_subscription_by_tenant(tenant_id)
        assert subscription is not None, \
            "Subscription should be retrievable by tenant ID"
        assert subscription.tenant_id == tenant_id, \
            "Subscription tenant ID should match"


class TestMarketplaceLifecycle:
    """
    Property tests for marketplace subscription lifecycle events.
    
    **Validates: Requirements 37.2, 38.2**
    """
    
    @settings(max_examples=50)
    @given(
        customer_id=customer_id_strategy,
        aws_account_id=aws_account_id_strategy
    )
    def test_aws_unsubscribe_updates_status(
        self,
        customer_id: str,
        aws_account_id: str
    ):
        """
        **Property 27: Marketplace Subscription Provisioning**
        **Validates: Requirements 37.2**
        
        For any unsubscribe event, the subscription status SHALL be updated.
        """
        import json
        product_code = "test-product-code"
        
        handler = AWSMarketplaceSNSHandler(
            product_code=product_code,
            provisioning_callback=lambda **kwargs: {"tenant_id": f"tenant-{customer_id[:8]}"}
        )
        
        # First subscribe
        subscribe_notification = {
            "Type": "Notification",
            "MessageId": str(uuid4()),
            "TopicArn": "arn:aws:sns:us-east-1:123456789:marketplace",
            "Message": json.dumps({
                "action": "subscribe-success",
                "customer-identifier": customer_id,
                "customer-aws-account-id": aws_account_id,
                "product-code": product_code,
                "entitlements": {}
            }),
            "Timestamp": datetime.now().isoformat(),
            "SignatureVersion": "1",
            "Signature": "test-signature",
            "SigningCertURL": "https://example.com/cert"
        }
        handler.handle_notification(subscribe_notification)
        
        # Then unsubscribe
        unsubscribe_notification = {
            "Type": "Notification",
            "MessageId": str(uuid4()),
            "TopicArn": "arn:aws:sns:us-east-1:123456789:marketplace",
            "Message": json.dumps({
                "action": "unsubscribe-success",
                "customer-identifier": customer_id,
                "product-code": product_code
            }),
            "Timestamp": datetime.now().isoformat(),
            "SignatureVersion": "1",
            "Signature": "test-signature",
            "SigningCertURL": "https://example.com/cert"
        }
        result = handler.handle_notification(unsubscribe_notification)
        
        assert result["status"] == "unsubscribed", \
            f"Unsubscribe should succeed. Got: {result}"
        
        # Verify subscription status updated
        subscription = handler.get_subscription(customer_id)
        assert subscription is not None, \
            "Subscription should still exist"
        assert subscription.action == "unsubscribe-success", \
            "Subscription action should be updated to unsubscribe-success"

    @settings(max_examples=50)
    @given(
        subscription_id=customer_id_strategy,
        plan=plan_id_strategy
    )
    def test_azure_suspend_updates_status(
        self,
        subscription_id: str,
        plan: str
    ):
        """
        **Property 27: Marketplace Subscription Provisioning**
        **Validates: Requirements 38.2**
        
        For any Suspend webhook, the subscription status SHALL be updated.
        """
        handler = AzureMarketplaceWebhookHandler(
            publisher_id="test-publisher",
            offer_id="data-governance",
            provisioning_callback=lambda **kwargs: {"tenant_id": f"tenant-{subscription_id[:8]}"}
        )
        
        # First subscribe
        subscribe_payload = {
            "id": str(uuid4()),
            "activityId": str(uuid4()),
            "publisherId": "test-publisher",
            "offerId": "data-governance",
            "planId": plan,
            "quantity": 1,
            "subscriptionId": subscription_id,
            "timeStamp": datetime.now().isoformat(),
            "action": "Subscribe",
            "status": "InProgress",
            "operationRequestSource": "Azure"
        }
        handler.handle_webhook(subscribe_payload)
        
        # Then suspend
        suspend_payload = {
            "id": str(uuid4()),
            "activityId": str(uuid4()),
            "publisherId": "test-publisher",
            "offerId": "data-governance",
            "planId": plan,
            "quantity": 1,
            "subscriptionId": subscription_id,
            "timeStamp": datetime.now().isoformat(),
            "action": "Suspend",
            "status": "InProgress",
            "operationRequestSource": "Azure"
        }
        result = handler.handle_webhook(suspend_payload)
        
        assert result["status"] == "suspended", \
            f"Suspend should succeed. Got: {result}"
        
        # Verify subscription status updated
        subscription = handler.get_subscription(subscription_id)
        assert subscription is not None, \
            "Subscription should still exist"
        assert subscription.status == "Suspended", \
            "Subscription status should be Suspended"

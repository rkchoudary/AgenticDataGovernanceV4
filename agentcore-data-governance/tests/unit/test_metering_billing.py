"""
Unit tests for metering and billing services.

Requirements: 22.1, 22.2, 22.3, 22.5
"""

import pytest
from datetime import datetime, timedelta

from models.metering import (
    UsageEvent,
    UsageAggregate,
    BillingRecord,
    TenantQuota,
    UsageSummary,
)
from services.metering import MeteringService
from services.billing import BillingPipeline, BillingEvent, BillingEventType
from services.usage_dashboard import UsageDashboardService
from services.tenant_context import TenantContextManager


class TestMeteringModels:
    """Tests for metering data models."""
    
    def test_usage_event_creation(self):
        """Test UsageEvent creation with defaults."""
        event = UsageEvent(
            tenant_id="tenant-123",
            event_type="agent_invocation",
            tokens_input=100,
            tokens_output=50
        )
        
        assert event.tenant_id == "tenant-123"
        assert event.event_type == "agent_invocation"
        assert event.quantity == 1
        assert event.tokens_input == 100
        assert event.tokens_output == 50
        assert event.total_tokens == 150
        assert event.id is not None
    
    def test_usage_aggregate_totals(self):
        """Test UsageAggregate computed properties."""
        aggregate = UsageAggregate(
            tenant_id="tenant-123",
            period="daily",
            period_start=datetime.now(),
            period_end=datetime.now() + timedelta(days=1),
            total_tokens_input=1000,
            total_tokens_output=500,
            storage_bytes_written=1024 * 1024,
            storage_bytes_read=512 * 1024
        )
        
        assert aggregate.total_tokens == 1500
        assert aggregate.total_storage_bytes == 1024 * 1024 + 512 * 1024
    
    def test_billing_record_cost_calculation(self):
        """Test BillingRecord cost calculation."""
        record = BillingRecord(
            tenant_id="tenant-123",
            period_start=datetime.now(),
            period_end=datetime.now() + timedelta(days=30),
            agent_invocations=100,
            total_tokens=10000,
            storage_gb=5.0,
            api_calls=1000
        )
        
        record.calculate_costs()
        
        # Verify costs are calculated
        assert record.agent_invocation_cost == 100 * 0.01  # $1.00
        assert record.token_cost == (10000 / 1000) * 0.002  # $0.02
        assert record.storage_cost == 5.0 * 0.10  # $0.50
        assert record.api_call_cost == 1000 * 0.001  # $1.00
        assert record.subtotal == 1.0 + 0.02 + 0.50 + 1.0  # $2.52
        assert record.total_amount == record.subtotal  # No discount
    
    def test_billing_record_with_discount(self):
        """Test BillingRecord with discount applied."""
        record = BillingRecord(
            tenant_id="tenant-123",
            period_start=datetime.now(),
            period_end=datetime.now() + timedelta(days=30),
            agent_invocations=100,
            total_tokens=10000,
            storage_gb=5.0,
            api_calls=1000,
            discount_percent=10.0
        )
        
        record.calculate_costs()
        
        assert record.discount_amount == record.subtotal * 0.10
        assert record.total_amount == record.subtotal - record.discount_amount
    
    def test_tenant_quota_usage_percent(self):
        """Test TenantQuota usage percentage calculations."""
        quota = TenantQuota(
            tenant_id="tenant-123",
            max_agent_invocations=1000,
            max_tokens=100000,
            max_storage_gb=10.0,
            max_api_calls=10000,
            current_agent_invocations=500,
            current_tokens=80000,
            current_storage_gb=9.5,
            current_api_calls=5000
        )
        
        assert quota.agent_invocation_usage_percent == 50.0
        assert quota.token_usage_percent == 80.0
        assert quota.storage_usage_percent == 95.0
        assert quota.api_call_usage_percent == 50.0
    
    def test_tenant_quota_status(self):
        """Test TenantQuota status determination."""
        quota = TenantQuota(
            tenant_id="tenant-123",
            max_agent_invocations=1000,
            max_tokens=100000,
            max_storage_gb=10.0,
            max_api_calls=10000,
            current_agent_invocations=500,  # 50% - ok
            current_tokens=85000,  # 85% - warning
            current_storage_gb=9.8,  # 98% - critical
            current_api_calls=10000,  # 100% - exceeded
            warning_threshold=80,
            critical_threshold=95
        )
        
        assert quota.get_quota_status("agent_invocations") == "ok"
        assert quota.get_quota_status("tokens") == "warning"
        assert quota.get_quota_status("storage") == "critical"
        assert quota.get_quota_status("api_calls") == "exceeded"


class TestMeteringService:
    """Tests for MeteringService."""
    
    def test_record_event(self):
        """Test recording a usage event."""
        service = MeteringService()
        
        event = service.record_event(
            event_type="agent_invocation",
            tenant_id="tenant-123",
            quantity=1,
            tokens_input=100,
            tokens_output=50,
            agent_id="regulatory-agent"
        )
        
        assert event.tenant_id == "tenant-123"
        assert event.event_type == "agent_invocation"
        assert event.agent_id == "regulatory-agent"
    
    def test_record_agent_invocation(self):
        """Test recording an agent invocation."""
        service = MeteringService()
        
        event = service.record_agent_invocation(
            agent_id="cde-agent",
            tokens_input=200,
            tokens_output=100,
            tenant_id="tenant-456"
        )
        
        assert event.event_type == "agent_invocation"
        assert event.agent_id == "cde-agent"
        assert event.total_tokens == 300
    
    def test_record_storage_operation(self):
        """Test recording storage operations."""
        service = MeteringService()
        
        write_event = service.record_storage_operation(
            operation="write",
            bytes_transferred=1024,
            tenant_id="tenant-123"
        )
        
        read_event = service.record_storage_operation(
            operation="read",
            bytes_transferred=512,
            tenant_id="tenant-123"
        )
        
        assert write_event.event_type == "storage_write"
        assert read_event.event_type == "storage_read"
    
    def test_get_events_filtering(self):
        """Test getting events with filters."""
        service = MeteringService()
        
        # Record some events
        service.record_event("agent_invocation", tenant_id="tenant-123")
        service.record_event("api_call", tenant_id="tenant-123")
        service.record_event("agent_invocation", tenant_id="tenant-456")
        
        # Get events for tenant-123
        events = service.get_events(tenant_id="tenant-123")
        assert len(events) == 2
        
        # Get only agent invocations
        events = service.get_events(
            tenant_id="tenant-123",
            event_type="agent_invocation"
        )
        assert len(events) == 1
    
    def test_aggregate_usage(self):
        """Test usage aggregation."""
        service = MeteringService()
        tenant_id = "tenant-agg-test"
        
        # Record events
        for _ in range(5):
            service.record_agent_invocation(
                agent_id="test-agent",
                tokens_input=100,
                tokens_output=50,
                tenant_id=tenant_id
            )
        
        service.record_api_call(endpoint="/api/test", tenant_id=tenant_id)
        service.record_api_call(endpoint="/api/test2", tenant_id=tenant_id)
        
        # Aggregate
        now = datetime.now()
        aggregate = service.aggregate_usage(
            tenant_id=tenant_id,
            period="hourly",
            period_start=now - timedelta(hours=1)
        )
        
        assert aggregate.agent_invocations == 5
        assert aggregate.total_tokens_input == 500
        assert aggregate.total_tokens_output == 250
        assert aggregate.api_calls == 2
    
    def test_quota_tracking(self):
        """Test quota tracking."""
        service = MeteringService()
        tenant_id = "tenant-quota-test"
        
        # Set quota
        quota = TenantQuota(
            tenant_id=tenant_id,
            max_agent_invocations=10,
            max_tokens=1000
        )
        service.set_quota(quota)
        
        # Record events
        service.record_agent_invocation(
            agent_id="test-agent",
            tokens_input=100,
            tokens_output=50,
            tenant_id=tenant_id
        )
        
        # Check quota was updated
        updated_quota = service.get_quota(tenant_id)
        assert updated_quota.current_agent_invocations == 1
    
    def test_usage_summary(self):
        """Test getting usage summary."""
        service = MeteringService()
        tenant_id = "tenant-summary-test"
        
        # Record events
        service.record_agent_invocation(
            agent_id="agent-1",
            tokens_input=100,
            tokens_output=50,
            tenant_id=tenant_id,
            user_id="user-1"
        )
        service.record_agent_invocation(
            agent_id="agent-1",
            tokens_input=200,
            tokens_output=100,
            tenant_id=tenant_id,
            user_id="user-2"
        )
        
        summary = service.get_usage_summary(tenant_id)
        
        assert summary.agent_invocations == 2
        assert summary.total_tokens == 450
        assert len(summary.top_agents) > 0
        assert len(summary.top_users) > 0


class TestBillingPipeline:
    """Tests for BillingPipeline."""
    
    def test_emit_event(self):
        """Test emitting a billing event."""
        pipeline = BillingPipeline()
        
        event = BillingEvent(
            event_type=BillingEventType.USAGE_REPORT,
            tenant_id="tenant-123",
            data={"amount": 100.0}
        )
        
        result = pipeline.emit_event(event)
        assert result is True
        
        # Event should be queued since no handler
        pending = pipeline.get_pending_events()
        assert len(pending) == 1
    
    def test_register_handler(self):
        """Test registering a billing handler."""
        pipeline = BillingPipeline()
        handled_events = []
        
        def test_handler(event: BillingEvent) -> bool:
            handled_events.append(event)
            return True
        
        pipeline.register_handler("stripe", test_handler)
        
        event = BillingEvent(
            event_type=BillingEventType.USAGE_REPORT,
            tenant_id="tenant-123",
            data={"amount": 100.0}
        )
        
        result = pipeline.emit_event(event, provider="stripe")
        assert result is True
        assert len(handled_events) == 1
    
    def test_aggregate_and_emit(self):
        """Test aggregating usage and emitting billing event."""
        metering = MeteringService()
        pipeline = BillingPipeline(metering_service=metering)
        
        tenant_id = "tenant-billing-test"
        
        # Record some usage
        for _ in range(3):
            metering.record_agent_invocation(
                agent_id="test-agent",
                tokens_input=100,
                tokens_output=50,
                tenant_id=tenant_id
            )
        
        # Aggregate and emit
        now = datetime.now()
        record = pipeline.aggregate_and_emit(
            tenant_id=tenant_id,
            period="hourly",
            period_start=now - timedelta(hours=1),
            tier="starter"
        )
        
        assert record.tenant_id == tenant_id
        assert record.agent_invocations == 3
        assert record.total_amount > 0
    
    def test_billing_record_retrieval(self):
        """Test retrieving billing records."""
        metering = MeteringService()
        pipeline = BillingPipeline(metering_service=metering)
        
        tenant_id = "tenant-records-test"
        
        # Create a billing record
        now = datetime.now()
        record = pipeline.aggregate_and_emit(
            tenant_id=tenant_id,
            period="daily",
            period_start=now - timedelta(days=1),
            tier="starter"
        )
        
        # Retrieve by ID
        retrieved = pipeline.get_billing_record(record.id)
        assert retrieved is not None
        assert retrieved.id == record.id
        
        # Retrieve by tenant
        records = pipeline.get_billing_records(tenant_id)
        assert len(records) == 1


class TestUsageDashboardService:
    """Tests for UsageDashboardService."""
    
    def test_get_dashboard_metrics(self):
        """Test getting dashboard metrics."""
        metering = MeteringService()
        billing = BillingPipeline(metering_service=metering)
        dashboard = UsageDashboardService(
            metering_service=metering,
            billing_pipeline=billing
        )
        
        tenant_id = "tenant-dashboard-test"
        
        # Record some usage
        metering.record_agent_invocation(
            agent_id="test-agent",
            tokens_input=100,
            tokens_output=50,
            tenant_id=tenant_id
        )
        
        metrics = dashboard.get_dashboard_metrics(tenant_id, period="month")
        
        assert metrics.tenant_id == tenant_id
        assert metrics.agent_invocations >= 0
        assert metrics.period_label == "This Month"
    
    def test_get_quota_status(self):
        """Test getting quota status."""
        metering = MeteringService()
        dashboard = UsageDashboardService(metering_service=metering)
        
        tenant_id = "tenant-quota-dashboard-test"
        
        # Set quota
        quota = TenantQuota(
            tenant_id=tenant_id,
            max_agent_invocations=100,
            current_agent_invocations=50
        )
        metering.set_quota(quota)
        
        statuses = dashboard.get_quota_status(tenant_id)
        
        assert len(statuses) == 4  # 4 metrics
        agent_status = next(s for s in statuses if s.metric == "agent_invocations")
        assert agent_status.percentage == 50.0
        assert agent_status.status == "ok"
    
    def test_get_usage_breakdown_by_agent(self):
        """Test getting usage breakdown by agent."""
        metering = MeteringService()
        dashboard = UsageDashboardService(metering_service=metering)
        
        tenant_id = "tenant-breakdown-test"
        
        # Record usage for different agents
        for _ in range(3):
            metering.record_agent_invocation(
                agent_id="agent-a",
                tokens_input=100,
                tokens_output=50,
                tenant_id=tenant_id
            )
        
        metering.record_agent_invocation(
            agent_id="agent-b",
            tokens_input=100,
            tokens_output=50,
            tenant_id=tenant_id
        )
        
        breakdown = dashboard.get_usage_breakdown_by_agent(tenant_id)
        
        # Should have breakdown by agent
        assert len(breakdown) > 0
    
    def test_get_full_dashboard(self):
        """Test getting full dashboard data."""
        metering = MeteringService()
        billing = BillingPipeline(metering_service=metering)
        dashboard = UsageDashboardService(
            metering_service=metering,
            billing_pipeline=billing
        )
        
        tenant_id = "tenant-full-dashboard-test"
        
        # Record some usage
        metering.record_agent_invocation(
            agent_id="test-agent",
            tokens_input=100,
            tokens_output=50,
            tenant_id=tenant_id
        )
        
        response = dashboard.get_full_dashboard(tenant_id, period="month")
        
        assert response.metrics is not None
        assert response.metrics.tenant_id == tenant_id
        assert isinstance(response.quotas, list)
        assert isinstance(response.usage_by_agent, list)
        assert isinstance(response.history, list)
        assert isinstance(response.billing_history, list)


class TestTenantContextIntegration:
    """Tests for tenant context integration with metering."""
    
    def test_metering_with_tenant_context(self):
        """Test metering uses tenant context when not explicitly provided."""
        service = MeteringService()
        
        with TenantContextManager(tenant_id="context-tenant-123"):
            event = service.record_event(
                event_type="api_call",
                quantity=1
            )
            
            assert event.tenant_id == "context-tenant-123"
    
    def test_metering_explicit_tenant_overrides_context(self):
        """Test explicit tenant_id overrides context."""
        service = MeteringService()
        
        with TenantContextManager(tenant_id="context-tenant"):
            event = service.record_event(
                event_type="api_call",
                tenant_id="explicit-tenant",
                quantity=1
            )
            
            assert event.tenant_id == "explicit-tenant"

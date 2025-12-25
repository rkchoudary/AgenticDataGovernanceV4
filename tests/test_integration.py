"""End-to-end integration tests for the Regulatory Knowledge Base system.

Tests complete document ingestion pipeline, natural language query processing,
API request/response cycles with authentication, and webhook delivery mechanisms.

Implements Task 10.1: Build end-to-end integration tests
- Test complete document ingestion pipeline
- Validate natural language query processing
- Test API request/response cycles with authentication
- Verify webhook delivery and retry mechanisms
- Requirements: All system integration points
"""

import asyncio
import json
import pytest
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch, AsyncMock

from regulatory_kb.processing.parser import DocumentParser, DocumentFormat, ParsedDocument
from regulatory_kb.processing.metadata import MetadataExtractor
from regulatory_kb.processing.validation import ContentValidator
from regulatory_kb.storage.graph_store import FalkorDBStore, GraphStoreConfig
from regulatory_kb.models.document import (
    Document,
    DocumentType,
    DocumentCategory,
    DocumentMetadata,
)
from regulatory_kb.models.regulator import Regulator, Country, RegulatorType
from regulatory_kb.api.rest import DocumentSearchService, SearchFilters, SearchResult
from regulatory_kb.api.auth import AuthService, AuthConfig, Permission
from regulatory_kb.api.webhooks import (
    WebhookService,
    WebhookEventType,
    WebhookStatus,
    WebhookSubscription,
)
from regulatory_kb.agent.bedrock_agent import BedrockAgentService, AgentConfig
from regulatory_kb.agent.query_processor import QueryProcessor, QueryIntent, RegulatoryTopic


class TestDocumentIngestionPipeline:
    """Integration tests for the complete document ingestion pipeline."""

    @pytest.fixture
    def parser(self):
        """Create document parser."""
        return DocumentParser()

    @pytest.fixture
    def metadata_extractor(self):
        """Create metadata extractor."""
        return MetadataExtractor()

    @pytest.fixture
    def validator(self):
        """Create content validator."""
        return ContentValidator()

    @pytest.fixture
    def mock_graph_store(self):
        """Create a mocked graph store."""
        with patch("regulatory_kb.storage.graph_store.FalkorDB") as mock_falkordb:
            mock_client = MagicMock()
            mock_graph = MagicMock()
            mock_falkordb.return_value = mock_client
            mock_client.select_graph.return_value = mock_graph
            
            store = FalkorDBStore()
            store.connect()
            yield store, mock_graph

    def test_html_document_ingestion_pipeline(self, parser, metadata_extractor, validator):
        """Test complete pipeline for HTML document ingestion."""
        # Sample Federal Reserve HTML document
        html_content = """
        <html>
        <head><title>FR Y-14A Instructions</title></head>
        <body>
            <main>
                <h1>Instructions for FR Y-14A Capital Assessments</h1>
                <p>OMB Control Number: 7100-0341</p>
                <p>Effective Date: January 1, 2024</p>
                <h2>Section 1: General Instructions</h2>
                <p>This regulation establishes requirements for capital plan submissions.
                The filing deadline is April 5 annually. All covered institutions must
                comply with these reporting requirements. The compliance threshold is set
                at the regulatory level for all banking organizations.</p>
                <h2>Section 2: Schedule Requirements</h2>
                <p>The following schedules must be submitted quarterly:</p>
                <ul>
                    <li>Summary Schedule</li>
                    <li>Scenario Schedule</li>
                    <li>Capital Schedule</li>
                </ul>
            </main>
        </body>
        </html>
        """
        
        # Step 1: Parse the document
        parsed = parser.parse(html_content, DocumentFormat.HTML)
        
        assert parsed.text is not None
        assert len(parsed.text) > 0
        assert "FR Y-14A" in parsed.text
        assert len(parsed.sections) >= 2
        
        # Step 2: Extract metadata (returns ExtractedMetadata object)
        metadata = metadata_extractor.extract(parsed.text, "us_frb")
        
        assert metadata is not None
        assert metadata.omb_control_number == "7100-0341"
        
        # Step 3: Validate content (returns ValidationResult object)
        validation_result = validator.validate(parsed)
        
        assert validation_result.is_valid is True

    def test_cfr_document_ingestion_pipeline(self, parser, metadata_extractor, validator):
        """Test complete pipeline for CFR document ingestion."""
        cfr_content = """
        § 249.1 Purpose and applicability.
        (a) This part establishes minimum liquidity requirements for certain
        banking organizations under the Liquidity Coverage Ratio rule.
        (b) The requirements apply to covered companies as defined in this part.
        The regulation sets forth compliance deadlines and reporting thresholds.
        
        § 249.2 Definitions.
        (a) Covered company means a bank holding company with total consolidated
        assets of $250 billion or more.
        (b) High-quality liquid assets means assets that meet the criteria in
        section 249.20.
        
        § 249.20 High-quality liquid asset criteria.
        (a) Level 1 liquid assets include central bank reserves and certain
        government securities. Filing requirements are quarterly.
        """
        
        # Step 1: Parse CFR content
        parsed = parser.parse(cfr_content, DocumentFormat.CFR)
        
        assert parsed.text is not None
        assert len(parsed.sections) >= 2
        assert parsed.sections[0].number == "§ 249.1"
        
        # Step 2: Extract metadata (returns ExtractedMetadata object)
        metadata = metadata_extractor.extract(parsed.text, "us_frb")
        
        assert metadata is not None
        
        # Step 3: Validate content (returns ValidationResult object)
        validation_result = validator.validate(parsed)
        
        assert validation_result.is_valid is True

    def test_fintrac_document_ingestion_pipeline(self, parser, metadata_extractor, validator):
        """Test complete pipeline for FINTRAC document ingestion."""
        fintrac_html = """
        <html>
        <body>
            <main>
                <h1>Reporting large cash transactions to FINTRAC</h1>
                <p>You must report large cash transactions of C$10,000 or more
                within 15 days of the transaction. This regulation establishes
                compliance requirements for all reporting entities.</p>
                <h2>When to report</h2>
                <p>A large cash transaction report must be submitted within 15 calendar
                days after the day on which the transaction occurred. The filing
                deadline is strictly enforced.</p>
                <h2>Electronic funds transfers</h2>
                <p>Electronic funds transfers of C$10,000 or more must be reported
                within 5 business days. Threshold requirements apply to all transfers.</p>
            </main>
        </body>
        </html>
        """
        
        # Step 1: Parse FINTRAC content
        parsed = parser.parse(fintrac_html, DocumentFormat.FINTRAC)
        
        assert parsed.text is not None
        assert "C$10,000" in parsed.metadata.get("thresholds", [])
        
        # Step 2: Extract metadata (returns ExtractedMetadata object)
        metadata = metadata_extractor.extract(parsed.text, "ca_fintrac")
        
        assert metadata is not None
        
        # Step 3: Validate content (returns ValidationResult object)
        validation_result = validator.validate(parsed)
        
        assert validation_result.is_valid is True

    def test_document_storage_integration(self, mock_graph_store, parser):
        """Test document storage after parsing."""
        store, mock_graph = mock_graph_store
        mock_graph.query.return_value = MagicMock(result_set=[["doc_id"]])
        
        # Parse a document
        html_content = """
        <html><body><main>
            <h1>Test Regulation</h1>
            <p>This regulation establishes compliance requirements for filing reports.</p>
        </main></body></html>
        """
        parsed = parser.parse(html_content, DocumentFormat.HTML)
        
        # Create document model
        document = Document(
            id="test_doc_001",
            title="Test Regulation",
            document_type=DocumentType.REGULATION,
            regulator_id="us_frb",
            source_url="https://example.com/test",
            categories=[DocumentCategory.CAPITAL_REQUIREMENTS],
            metadata=DocumentMetadata(
                effective_date=date(2024, 1, 1),
                version="1.0",
            ),
        )
        
        # Store document
        result = store.create_document_node(document)
        
        assert result is not None
        mock_graph.query.assert_called()


class TestNaturalLanguageQueryProcessing:
    """Integration tests for natural language query processing."""

    @pytest.fixture
    def query_processor(self):
        """Create query processor."""
        return QueryProcessor()

    @pytest.fixture
    def agent_service(self):
        """Create agent service with mocked Bedrock client."""
        config = AgentConfig(
            region="us-east-1",
            model_id="anthropic.claude-3-sonnet-20240229-v1:0",
        )
        return BedrockAgentService(config)

    def test_ccar_query_processing(self, query_processor):
        """Test processing of CCAR-related queries."""
        result = query_processor.process_query(
            "What are the CCAR capital requirements?"
        )
        
        assert result is not None
        assert result.topic == RegulatoryTopic.CAPITAL
        assert result.answer is not None
        assert len(result.answer) > 0

    def test_liquidity_query_processing(self, query_processor):
        """Test processing of liquidity-related queries."""
        result = query_processor.process_query(
            "What is the difference between LCR and NSFR?"
        )
        
        assert result is not None
        assert result.topic == RegulatoryTopic.LIQUIDITY
        assert result.answer is not None

    def test_aml_deadline_query_processing(self, query_processor):
        """Test processing of AML deadline queries."""
        result = query_processor.process_query(
            "What is the CTR filing deadline?"
        )
        
        assert result is not None
        # CTR queries may be classified as AML_BSA or REPORTING depending on keywords
        assert result.topic in [RegulatoryTopic.AML_BSA, RegulatoryTopic.REPORTING]
        assert result.intent == QueryIntent.DEADLINE_INQUIRY

    def test_comparison_query_processing(self, query_processor):
        """Test processing of comparison queries."""
        result = query_processor.process_query(
            "Compare US and Canadian AML requirements"
        )
        
        assert result is not None
        assert result.intent == QueryIntent.COMPARISON
        assert result.topic == RegulatoryTopic.AML_BSA

    def test_multi_turn_conversation_context(self, query_processor):
        """Test multi-turn conversation context management."""
        session_id = "test-session-001"
        
        # First query
        result1 = query_processor.process_query(
            "What is CCAR?",
            session_id=session_id,
        )
        
        assert result1 is not None
        
        # Second query in same session
        result2 = query_processor.process_query(
            "What forms are required?",
            session_id=session_id,
        )
        
        assert result2 is not None
        
        # Verify context is maintained
        context = query_processor.get_context(session_id)
        assert context.turn_count == 2

    def test_agent_session_management(self, agent_service):
        """Test agent session creation and management."""
        # Create session
        session = agent_service.create_session()
        
        assert session is not None
        assert session.session_id is not None
        
        # Retrieve session
        retrieved = agent_service.get_session(session.session_id)
        
        assert retrieved is not None
        assert retrieved.session_id == session.session_id
        
        # Delete session
        result = agent_service.delete_session(session.session_id)
        
        assert result is True
        assert agent_service.get_session(session.session_id) is None


class TestAPIRequestResponseCycles:
    """Integration tests for API request/response cycles with authentication."""

    @pytest.fixture
    def auth_service(self):
        """Create auth service."""
        config = AuthConfig(secret_key="test-secret-key")
        return AuthService(config)

    @pytest.fixture
    def mock_search_service(self):
        """Create mocked search service."""
        with patch("regulatory_kb.storage.graph_store.FalkorDB") as mock_falkordb:
            mock_client = MagicMock()
            mock_graph = MagicMock()
            mock_falkordb.return_value = mock_client
            mock_client.select_graph.return_value = mock_graph
            
            store = FalkorDBStore()
            store.connect()
            
            service = DocumentSearchService(store)
            yield service, mock_graph

    def test_api_key_generation_and_validation(self, auth_service):
        """Test API key generation and validation flow."""
        # Generate API key
        raw_key, api_key = auth_service.generate_api_key(
            name="Test API Key",
            permissions=[Permission.SEARCH_DOCUMENTS, Permission.READ_DOCUMENTS],
        )
        
        assert raw_key is not None
        assert raw_key.startswith("rk_")
        assert api_key.name == "Test API Key"
        
        # Validate API key
        result = auth_service.validate_api_key(raw_key)
        
        assert result.success is True
        assert result.api_key is not None
        assert Permission.SEARCH_DOCUMENTS in result.permissions

    def test_api_authentication_with_bearer_token(self, auth_service):
        """Test API authentication using Bearer token."""
        raw_key, _ = auth_service.generate_api_key(
            name="Bearer Test Key",
            permissions=[Permission.SEARCH_DOCUMENTS],
        )
        
        headers = {"Authorization": f"Bearer {raw_key}"}
        
        result = auth_service.authenticate_request(
            headers,
            required_permission=Permission.SEARCH_DOCUMENTS,
        )
        
        assert result.success is True

    def test_api_authentication_with_x_api_key(self, auth_service):
        """Test API authentication using X-API-Key header."""
        raw_key, _ = auth_service.generate_api_key(
            name="X-API-Key Test",
            permissions=[Permission.SEARCH_DOCUMENTS],
        )
        
        headers = {"X-API-Key": raw_key}
        
        result = auth_service.authenticate_request(
            headers,
            required_permission=Permission.SEARCH_DOCUMENTS,
        )
        
        assert result.success is True

    def test_api_authentication_permission_denied(self, auth_service):
        """Test API authentication with insufficient permissions."""
        raw_key, _ = auth_service.generate_api_key(
            name="Limited Key",
            permissions=[Permission.READ_DOCUMENTS],  # No SEARCH permission
        )
        
        headers = {"Authorization": f"Bearer {raw_key}"}
        
        result = auth_service.authenticate_request(
            headers,
            required_permission=Permission.SEARCH_DOCUMENTS,
        )
        
        assert result.success is False
        assert "Permission denied" in result.error

    def test_api_authentication_invalid_key(self, auth_service):
        """Test API authentication with invalid key."""
        headers = {"Authorization": "Bearer rk_invalid_key_12345"}
        
        result = auth_service.authenticate_request(headers)
        
        assert result.success is False
        assert "Invalid API key" in result.error

    def test_api_authentication_missing_key(self, auth_service):
        """Test API authentication with missing key."""
        headers = {}
        
        result = auth_service.authenticate_request(headers)
        
        assert result.success is False
        assert "No API key provided" in result.error

    def test_search_service_by_regulator(self, mock_search_service):
        """Test document search by regulator."""
        service, mock_graph = mock_search_service
        
        # Mock query result
        mock_node = MagicMock()
        mock_node.properties = {
            "id": "doc_1",
            "title": "FR Y-14A Instructions",
            "document_type": "instruction_manual",
            "regulator_id": "us_frb",
            "categories": "capital_requirements",
        }
        mock_result = MagicMock()
        mock_result.result_set = [[mock_node]]
        mock_result.nodes = [mock_node.properties]
        mock_graph.query.return_value = mock_result
        
        # Perform search
        filters = SearchFilters(regulator_abbreviation="FRB")
        result = service.search(filters)
        
        assert result is not None
        assert isinstance(result, SearchResult)

    def test_search_service_by_category(self, mock_search_service):
        """Test document search by category."""
        service, mock_graph = mock_search_service
        
        mock_node = MagicMock()
        mock_node.properties = {
            "id": "doc_2",
            "title": "LCR Requirements",
            "document_type": "regulation",
            "regulator_id": "us_frb",
            "categories": "liquidity_reporting",
        }
        mock_result = MagicMock()
        mock_result.result_set = [[mock_node]]
        mock_result.nodes = [mock_node.properties]
        mock_graph.query.return_value = mock_result
        
        filters = SearchFilters(category=DocumentCategory.LIQUIDITY_REPORTING)
        result = service.search(filters)
        
        assert result is not None


class TestWebhookDeliveryMechanisms:
    """Integration tests for webhook delivery and retry mechanisms."""

    @pytest.fixture
    def webhook_service(self):
        """Create webhook service."""
        return WebhookService(
            signing_secret="test-webhook-secret",
            max_retries=3,
            delivery_timeout=5,
        )

    def test_webhook_subscription_creation(self, webhook_service):
        """Test webhook subscription creation."""
        subscription = webhook_service.create_subscription(
            url="https://example.com/webhook",
            events=[WebhookEventType.DOCUMENT_UPDATED, WebhookEventType.DOCUMENT_CREATED],
            regulator_filter=["us_frb", "us_occ"],
        )
        
        assert subscription is not None
        assert subscription.id is not None
        assert subscription.url == "https://example.com/webhook"
        assert len(subscription.events) == 2
        assert subscription.is_active is True

    def test_webhook_event_dispatch(self, webhook_service):
        """Test webhook event dispatch to subscriptions."""
        # Create subscription
        subscription = webhook_service.create_subscription(
            url="https://example.com/webhook",
            events=[WebhookEventType.DOCUMENT_UPDATED],
        )
        
        # Dispatch event
        deliveries = webhook_service.dispatch_event(
            WebhookEventType.DOCUMENT_UPDATED,
            {
                "document_id": "doc_001",
                "title": "Updated Document",
                "regulator_id": "us_frb",
                "categories": ["capital_requirements"],
            },
        )
        
        assert len(deliveries) == 1
        assert deliveries[0].subscription_id == subscription.id
        assert deliveries[0].event_type == WebhookEventType.DOCUMENT_UPDATED

    def test_webhook_event_filtering_by_regulator(self, webhook_service):
        """Test webhook event filtering by regulator."""
        # Create subscription with regulator filter
        subscription = webhook_service.create_subscription(
            url="https://example.com/webhook",
            events=[WebhookEventType.DOCUMENT_UPDATED],
            regulator_filter=["us_frb"],  # Only FRB documents
        )
        
        # Dispatch event for FRB (should match)
        deliveries_frb = webhook_service.dispatch_event(
            WebhookEventType.DOCUMENT_UPDATED,
            {"document_id": "doc_1", "regulator_id": "us_frb", "categories": []},
        )
        
        assert len(deliveries_frb) == 1
        
        # Dispatch event for OCC (should not match)
        deliveries_occ = webhook_service.dispatch_event(
            WebhookEventType.DOCUMENT_UPDATED,
            {"document_id": "doc_2", "regulator_id": "us_occ", "categories": []},
        )
        
        assert len(deliveries_occ) == 0

    def test_webhook_payload_signing(self, webhook_service):
        """Test webhook payload signing and verification."""
        subscription = webhook_service.create_subscription(
            url="https://example.com/webhook",
            events=[WebhookEventType.DOCUMENT_CREATED],
        )
        
        payload = '{"event_type": "document.created", "data": {}}'
        
        # Sign payload
        signature = webhook_service._sign_payload(payload, subscription.secret)
        
        assert signature.startswith("sha256=")
        
        # Verify signature
        is_valid = webhook_service.verify_signature(
            payload, signature, subscription.secret
        )
        
        assert is_valid is True
        
        # Verify with wrong secret fails
        is_invalid = webhook_service.verify_signature(
            payload, signature, "wrong-secret"
        )
        
        assert is_invalid is False

    def test_webhook_delivery_retry_calculation(self, webhook_service):
        """Test webhook delivery retry timing calculation."""
        from regulatory_kb.api.webhooks import WebhookDelivery
        
        delivery = WebhookDelivery(
            subscription_id="sub_001",
            event_type=WebhookEventType.DOCUMENT_UPDATED,
            payload={"test": "data"},
            max_attempts=5,
        )
        
        # First attempt
        delivery.attempts = 1
        next_retry = delivery.calculate_next_retry()
        
        assert next_retry is not None
        
        # Verify exponential backoff
        delivery.attempts = 2
        next_retry_2 = delivery.calculate_next_retry()
        
        delivery.attempts = 3
        next_retry_3 = delivery.calculate_next_retry()
        
        # Later retries should have longer delays
        assert next_retry_2 > next_retry
        assert next_retry_3 > next_retry_2

    def test_webhook_dead_letter_queue(self, webhook_service):
        """Test webhook dead letter queue functionality."""
        from regulatory_kb.api.webhooks import WebhookDelivery
        
        # Create a failed delivery
        delivery = WebhookDelivery(
            subscription_id="sub_001",
            event_type=WebhookEventType.DOCUMENT_UPDATED,
            payload={"test": "data"},
            max_attempts=3,
            attempts=3,
            status=WebhookStatus.DEAD_LETTER,
            last_error="Connection refused",
        )
        
        # Add to dead letter queue
        webhook_service._dead_letter_queue.append(delivery)
        
        # Verify it's in the queue
        dlq = webhook_service.get_dead_letter_queue()
        
        assert len(dlq) == 1
        assert dlq[0].id == delivery.id
        
        # Retry from dead letter queue
        retried = webhook_service.retry_dead_letter(delivery.id)
        
        assert retried is not None
        assert retried.status == WebhookStatus.PENDING
        assert retried.attempts == 0

    def test_webhook_subscription_update(self, webhook_service):
        """Test webhook subscription update."""
        subscription = webhook_service.create_subscription(
            url="https://example.com/webhook",
            events=[WebhookEventType.DOCUMENT_UPDATED],
        )
        
        # Update subscription
        updated = webhook_service.update_subscription(
            subscription.id,
            url="https://new-url.com/webhook",
            events=[WebhookEventType.DOCUMENT_CREATED, WebhookEventType.DOCUMENT_UPDATED],
            is_active=True,
        )
        
        assert updated is not None
        assert updated.url == "https://new-url.com/webhook"
        assert len(updated.events) == 2

    def test_webhook_subscription_deletion(self, webhook_service):
        """Test webhook subscription deletion."""
        subscription = webhook_service.create_subscription(
            url="https://example.com/webhook",
            events=[WebhookEventType.DOCUMENT_UPDATED],
        )
        
        # Delete subscription
        result = webhook_service.delete_subscription(subscription.id)
        
        assert result is True
        
        # Verify it's deleted
        retrieved = webhook_service.get_subscription(subscription.id)
        
        assert retrieved is None

    def test_webhook_delivery_statistics(self, webhook_service):
        """Test webhook delivery statistics."""
        # Create subscriptions and dispatch events
        webhook_service.create_subscription(
            url="https://example.com/webhook1",
            events=[WebhookEventType.DOCUMENT_UPDATED],
        )
        webhook_service.create_subscription(
            url="https://example.com/webhook2",
            events=[WebhookEventType.DOCUMENT_CREATED],
        )
        
        # Dispatch events
        webhook_service.dispatch_event(
            WebhookEventType.DOCUMENT_UPDATED,
            {"document_id": "doc_1", "categories": []},
        )
        webhook_service.dispatch_event(
            WebhookEventType.DOCUMENT_CREATED,
            {"document_id": "doc_2", "categories": []},
        )
        
        # Get statistics
        stats = webhook_service.get_delivery_stats()
        
        assert stats["total_deliveries"] == 2
        assert stats["subscriptions"] == 2
        assert stats["active_subscriptions"] == 2


class TestEndToEndWorkflows:
    """End-to-end workflow integration tests."""

    @pytest.fixture
    def full_pipeline_setup(self):
        """Set up full pipeline components."""
        parser = DocumentParser()
        metadata_extractor = MetadataExtractor()
        validator = ContentValidator()
        auth_service = AuthService(AuthConfig(secret_key="test-secret"))
        webhook_service = WebhookService()
        query_processor = QueryProcessor()
        
        return {
            "parser": parser,
            "metadata_extractor": metadata_extractor,
            "validator": validator,
            "auth_service": auth_service,
            "webhook_service": webhook_service,
            "query_processor": query_processor,
        }

    def test_complete_document_workflow(self, full_pipeline_setup):
        """Test complete document ingestion and query workflow."""
        components = full_pipeline_setup
        
        # Step 1: Parse document (with enough content to pass validation)
        html_content = """
        <html><body><main>
            <h1>12 CFR Part 249 - Liquidity Coverage Ratio</h1>
            <p>This regulation establishes minimum liquidity requirements for banking
            organizations. The LCR must be calculated daily. Compliance deadline is quarterly.
            All covered institutions must meet the threshold requirements set forth in this
            section. The filing requirements include detailed reporting of high-quality
            liquid assets and net cash outflows.</p>
            <h2>Section 1: Purpose</h2>
            <p>This part establishes minimum liquidity requirements.</p>
        </main></body></html>
        """
        
        parsed = components["parser"].parse(html_content, DocumentFormat.HTML)
        assert parsed.text is not None
        
        # Step 2: Extract metadata (returns ExtractedMetadata object)
        metadata = components["metadata_extractor"].extract(parsed.text, "us_frb")
        assert metadata is not None
        
        # Step 3: Validate content (returns ValidationResult object)
        validation_result = components["validator"].validate(parsed)
        assert validation_result.is_valid is True
        
        # Step 4: Query the content
        result = components["query_processor"].process_query(
            "What are the LCR requirements?"
        )
        assert result is not None
        assert result.topic == RegulatoryTopic.LIQUIDITY

    def test_authenticated_api_workflow(self, full_pipeline_setup):
        """Test authenticated API workflow."""
        auth_service = full_pipeline_setup["auth_service"]
        
        # Step 1: Generate API key
        raw_key, api_key = auth_service.generate_api_key(
            name="Integration Test Key",
            permissions=[
                Permission.SEARCH_DOCUMENTS,
                Permission.READ_DOCUMENTS,
                Permission.QUERY_NL,
            ],
        )
        
        # Step 2: Authenticate request
        headers = {"Authorization": f"Bearer {raw_key}"}
        
        # Test search permission
        search_result = auth_service.authenticate_request(
            headers, Permission.SEARCH_DOCUMENTS
        )
        assert search_result.success is True
        
        # Test NL query permission
        nl_result = auth_service.authenticate_request(
            headers, Permission.QUERY_NL
        )
        assert nl_result.success is True
        
        # Step 3: Revoke key
        revoke_result = auth_service.revoke_api_key(api_key.key_id)
        assert revoke_result is True
        
        # Step 4: Verify revoked key fails
        revoked_result = auth_service.authenticate_request(headers)
        assert revoked_result.success is False

    def test_webhook_notification_workflow(self, full_pipeline_setup):
        """Test webhook notification workflow for document updates."""
        webhook_service = full_pipeline_setup["webhook_service"]
        
        # Step 1: Create subscription for high-priority updates
        subscription = webhook_service.create_subscription(
            url="https://compliance-system.example.com/webhook",
            events=[
                WebhookEventType.CCAR_INSTRUCTIONS_UPDATED,
                WebhookEventType.CFR_AMENDMENT,
                WebhookEventType.REGULATORY_DEADLINE_APPROACHING,
            ],
            regulator_filter=["us_frb", "us_occ"],
        )
        
        assert subscription.is_active is True
        
        # Step 2: Dispatch high-priority document update
        deliveries = webhook_service.dispatch_document_updated(
            document_id="us_frb_fry14a_2024",
            title="FR Y-14A CCAR Instructions 2024",
            regulator_id="us_frb",
            categories=["capital_requirements", "stress_testing"],
            is_high_priority=True,
        )
        
        # Should create deliveries for both DOCUMENT_UPDATED and CCAR_INSTRUCTIONS_UPDATED
        assert len(deliveries) >= 1
        
        # Step 3: Dispatch deadline approaching notification
        deadline_deliveries = webhook_service.dispatch_deadline_approaching(
            deadline_type="CCAR Capital Plan",
            deadline_date="2024-04-05",
            document_id="us_frb_fry14a_2024",
            document_title="FR Y-14A Instructions",
            days_remaining=30,
        )
        
        assert len(deadline_deliveries) >= 1

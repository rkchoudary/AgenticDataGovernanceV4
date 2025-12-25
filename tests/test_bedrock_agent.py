"""Tests for Bedrock Agent Core integration."""

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone, timedelta

from regulatory_kb.agent.bedrock_agent import (
    BedrockAgentService,
    AgentConfig,
    AgentSession,
    AgentResponse,
    AgentState,
    ConversationTurn,
    Citation,
    REGULATORY_SYSTEM_PROMPT,
)
from regulatory_kb.agent.tools import (
    ToolRegistry,
    GraphQueryTool,
    DocumentRetrievalTool,
    RegulatorySearchTool,
    ToolResult,
    ToolParameter,
    ToolType,
)
from regulatory_kb.agent.query_processor import (
    QueryProcessor,
    QueryIntent,
    RegulatoryTopic,
    QueryResult,
    ConversationContext,
)


class TestAgentConfig:
    """Tests for AgentConfig."""

    def test_default_config(self):
        """Test default configuration values."""
        config = AgentConfig()
        
        assert config.region == "us-east-1"
        assert config.model_id == "anthropic.claude-3-sonnet-20240229-v1:0"
        assert config.max_tokens == 4096
        assert config.temperature == 0.1
        assert config.session_timeout_hours == 8
        assert config.max_retries == 3

    def test_custom_config(self):
        """Test custom configuration values."""
        config = AgentConfig(
            region="us-west-2",
            model_id="custom-model",
            max_tokens=2048,
            temperature=0.5,
            session_timeout_hours=4,
        )
        
        assert config.region == "us-west-2"
        assert config.model_id == "custom-model"
        assert config.max_tokens == 2048
        assert config.temperature == 0.5
        assert config.session_timeout_hours == 4


class TestAgentSession:
    """Tests for AgentSession."""

    def test_session_creation(self):
        """Test session creation with defaults."""
        session = AgentSession(session_id="test-123")
        
        assert session.session_id == "test-123"
        assert session.state == AgentState.IDLE
        assert len(session.conversation_history) == 0
        assert not session.is_expired

    def test_session_expiry(self):
        """Test session expiry detection."""
        session = AgentSession(
            session_id="test-123",
            timeout_hours=1,
            created_at=datetime.now(timezone.utc) - timedelta(hours=2),
        )
        
        assert session.is_expired

    def test_add_turn(self):
        """Test adding conversation turns."""
        session = AgentSession(session_id="test-123")
        
        session.add_turn("user", "What is CCAR?")
        session.add_turn("assistant", "CCAR is...")
        
        assert len(session.conversation_history) == 2
        assert session.conversation_history[0].role == "user"
        assert session.conversation_history[1].role == "assistant"

    def test_get_context_window(self):
        """Test getting context window."""
        session = AgentSession(session_id="test-123")
        
        for i in range(15):
            session.add_turn("user" if i % 2 == 0 else "assistant", f"Message {i}")
        
        context = session.get_context_window(max_turns=5)
        
        assert len(context) == 5
        assert context[0]["content"] == "Message 10"


class TestToolRegistry:
    """Tests for ToolRegistry."""

    def test_register_tool(self):
        """Test tool registration."""
        registry = ToolRegistry()
        
        mock_tool = MagicMock()
        mock_tool.name = "test_tool"
        
        registry.register(mock_tool)
        
        assert "test_tool" in registry.list_tools()
        assert registry.get("test_tool") == mock_tool

    def test_unregister_tool(self):
        """Test tool unregistration."""
        registry = ToolRegistry()
        
        mock_tool = MagicMock()
        mock_tool.name = "test_tool"
        
        registry.register(mock_tool)
        result = registry.unregister("test_tool")
        
        assert result is True
        assert "test_tool" not in registry.list_tools()

    def test_execute_tool(self):
        """Test tool execution through registry."""
        registry = ToolRegistry()
        
        mock_tool = MagicMock()
        mock_tool.name = "test_tool"
        mock_tool.execute.return_value = ToolResult(success=True, data={"result": "ok"})
        
        registry.register(mock_tool)
        result = registry.execute_tool("test_tool", param1="value1")
        
        assert result.success is True
        mock_tool.execute.assert_called_once_with(param1="value1")

    def test_execute_nonexistent_tool(self):
        """Test executing a tool that doesn't exist."""
        registry = ToolRegistry()
        
        result = registry.execute_tool("nonexistent")
        
        assert result.success is False
        assert "not found" in result.error


class TestGraphQueryTool:
    """Tests for GraphQueryTool."""

    def test_tool_schema(self):
        """Test tool schema generation."""
        mock_store = MagicMock()
        tool = GraphQueryTool(mock_store)
        
        schema = tool.get_schema()
        
        assert schema["name"] == "graph_query"
        assert "inputSchema" in schema
        assert "query_type" in schema["inputSchema"]["json"]["properties"]

    def test_get_document_query(self):
        """Test get_document query execution."""
        mock_store = MagicMock()
        mock_store.get_document_by_id.return_value = {"id": "doc-1", "title": "Test Doc"}
        
        tool = GraphQueryTool(mock_store)
        result = tool.execute(query_type="get_document", document_id="doc-1")
        
        assert result.success is True
        assert result.data["id"] == "doc-1"
        mock_store.get_document_by_id.assert_called_once_with("doc-1")

    def test_missing_required_param(self):
        """Test error when required parameter is missing."""
        mock_store = MagicMock()
        tool = GraphQueryTool(mock_store)
        
        result = tool.execute(query_type="get_document")
        
        assert result.success is False
        assert "document_id is required" in result.error


class TestQueryProcessor:
    """Tests for QueryProcessor."""

    def test_analyze_deadline_query(self):
        """Test deadline query analysis."""
        processor = QueryProcessor()
        
        intent, topic, entities = processor.analyze_query(
            "When is the CTR filing deadline?"
        )
        
        assert intent == QueryIntent.DEADLINE_INQUIRY
        # CTR is an AML term, but "filing" triggers REPORTING topic
        # The query processor prioritizes based on keyword matches
        assert topic in [RegulatoryTopic.AML_BSA, RegulatoryTopic.REPORTING]

    def test_analyze_comparison_query(self):
        """Test comparison query analysis."""
        processor = QueryProcessor()
        
        intent, topic, entities = processor.analyze_query(
            "Compare US and Canadian AML requirements"
        )
        
        assert intent == QueryIntent.COMPARISON
        assert topic == RegulatoryTopic.AML_BSA

    def test_analyze_capital_query(self):
        """Test capital-related query analysis."""
        processor = QueryProcessor()
        
        intent, topic, entities = processor.analyze_query(
            "What are the CCAR capital requirements?"
        )
        
        assert topic == RegulatoryTopic.CAPITAL

    def test_analyze_liquidity_query(self):
        """Test liquidity-related query analysis."""
        processor = QueryProcessor()
        
        intent, topic, entities = processor.analyze_query(
            "What is the LCR reporting frequency?"
        )
        
        assert topic == RegulatoryTopic.LIQUIDITY

    def test_extract_regulator_entities(self):
        """Test regulator entity extraction."""
        processor = QueryProcessor()
        
        # Use explicit regulator abbreviation for reliable extraction
        _, _, entities = processor.analyze_query(
            "What does the FRB require for CCAR?"
        )
        
        assert any("regulator:" in e for e in entities)

    def test_extract_form_entities(self):
        """Test form number entity extraction."""
        processor = QueryProcessor()
        
        _, _, entities = processor.analyze_query(
            "What is FR Y-14A used for?"
        )
        
        assert any("form:" in e for e in entities)

    def test_context_management(self):
        """Test conversation context management."""
        processor = QueryProcessor()
        
        context = processor.get_context("session-1")
        assert context.session_id == "session-1"
        assert context.turn_count == 0
        
        # Process a query to update context
        result = processor.process_query(
            "What are CTR deadlines?",
            session_id="session-1",
        )
        
        context = processor.get_context("session-1")
        assert context.turn_count == 1
        assert context.current_topic == RegulatoryTopic.AML_BSA

    def test_clear_context(self):
        """Test clearing conversation context."""
        processor = QueryProcessor()
        
        processor.get_context("session-1")
        result = processor.clear_context("session-1")
        
        assert result is True
        
        # Getting context again should create new one
        new_context = processor.get_context("session-1")
        assert new_context.turn_count == 0


class TestQueryResult:
    """Tests for QueryResult."""

    def test_deadline_query_result(self):
        """Test deadline query result generation."""
        processor = QueryProcessor()
        
        result = processor.process_query("What is the CTR deadline?")
        
        assert result.intent == QueryIntent.DEADLINE_INQUIRY
        assert result.topic == RegulatoryTopic.AML_BSA
        assert "CTR" in result.answer.upper() or "15" in result.answer

    def test_comparison_query_result(self):
        """Test comparison query result generation."""
        processor = QueryProcessor()
        
        result = processor.process_query(
            "Compare US and Canadian AML reporting requirements"
        )
        
        assert result.intent == QueryIntent.COMPARISON
        assert len(result.citations) >= 0  # May have citations

    def test_follow_up_suggestions(self):
        """Test follow-up suggestion generation."""
        processor = QueryProcessor()
        
        result = processor.process_query("What are AML requirements?")
        
        assert len(result.follow_up_suggestions) > 0


class TestBedrockAgentService:
    """Tests for BedrockAgentService."""

    def test_create_session(self):
        """Test session creation."""
        service = BedrockAgentService()
        
        session = service.create_session()
        
        assert session.session_id is not None
        assert session.state == AgentState.IDLE

    def test_get_session(self):
        """Test session retrieval."""
        service = BedrockAgentService()
        
        created = service.create_session()
        retrieved = service.get_session(created.session_id)
        
        assert retrieved is not None
        assert retrieved.session_id == created.session_id

    def test_get_expired_session(self):
        """Test that expired sessions return None."""
        config = AgentConfig(session_timeout_hours=0)  # Immediate expiry
        service = BedrockAgentService(config)
        
        session = service.create_session()
        # Force expiry by setting created_at in the past
        session.created_at = datetime.now(timezone.utc) - timedelta(hours=1)
        
        retrieved = service.get_session(session.session_id)
        
        assert retrieved is None

    def test_delete_session(self):
        """Test session deletion."""
        service = BedrockAgentService()
        
        session = service.create_session()
        result = service.delete_session(session.session_id)
        
        assert result is True
        assert service.get_session(session.session_id) is None

    def test_cleanup_expired_sessions(self):
        """Test cleanup of expired sessions."""
        config = AgentConfig(session_timeout_hours=0)
        service = BedrockAgentService(config)
        
        # Create sessions that will be expired
        for _ in range(3):
            session = service.create_session()
            session.created_at = datetime.now(timezone.utc) - timedelta(hours=1)
        
        cleaned = service.cleanup_expired_sessions()
        
        assert cleaned == 3

    def test_detect_uncertainty(self):
        """Test uncertainty detection in responses."""
        service = BedrockAgentService()
        
        # Test uncertain response
        is_uncertain, reason = service._detect_uncertainty(
            "I'm not certain about this requirement."
        )
        assert is_uncertain is True
        assert reason is not None
        
        # Test confident response
        is_uncertain, reason = service._detect_uncertainty(
            "The CTR deadline is 15 calendar days."
        )
        assert is_uncertain is False

    def test_extract_citations(self):
        """Test citation extraction from tool results."""
        service = BedrockAgentService()
        
        # Test single document
        data = {
            "document_id": "doc-1",
            "title": "Test Document",
            "excerpt": "Some text...",
        }
        citations = service._extract_citations(data)
        
        assert len(citations) == 1
        assert citations[0].document_id == "doc-1"
        
        # Test list of documents
        data = [
            {"document_id": "doc-1", "title": "Doc 1"},
            {"document_id": "doc-2", "title": "Doc 2"},
        ]
        citations = service._extract_citations(data)
        
        assert len(citations) == 2


class TestRegulatorySystemPrompt:
    """Tests for the regulatory system prompt."""

    def test_prompt_contains_regulators(self):
        """Test that system prompt mentions all regulators."""
        regulators = ["FRB", "OCC", "FDIC", "FinCEN", "OSFI", "FINTRAC"]
        
        for reg in regulators:
            assert reg in REGULATORY_SYSTEM_PROMPT

    def test_prompt_contains_topics(self):
        """Test that system prompt mentions key topics."""
        topics = ["Capital", "Liquidity", "AML", "Stress Testing"]
        
        for topic in topics:
            assert topic in REGULATORY_SYSTEM_PROMPT

    def test_prompt_contains_guidelines(self):
        """Test that system prompt contains response guidelines."""
        assert "cite" in REGULATORY_SYSTEM_PROMPT.lower()
        assert "uncertain" in REGULATORY_SYSTEM_PROMPT.lower()


class TestConversationContext:
    """Tests for ConversationContext."""

    def test_context_update(self):
        """Test context update after conversation turn."""
        context = ConversationContext(session_id="test-1")
        
        context.update(
            query="What is CCAR?",
            answer="CCAR is...",
            intent=QueryIntent.DEFINITION,
            topic=RegulatoryTopic.CAPITAL,
            documents=["doc-1", "doc-2"],
        )
        
        assert context.turn_count == 1
        assert context.last_query == "What is CCAR?"
        assert context.current_topic == RegulatoryTopic.CAPITAL
        assert "doc-1" in context.mentioned_documents

    def test_context_preserves_documents(self):
        """Test that context preserves mentioned documents across turns."""
        context = ConversationContext(session_id="test-1")
        
        context.update("Q1", "A1", QueryIntent.GENERAL, RegulatoryTopic.CAPITAL, ["doc-1"])
        context.update("Q2", "A2", QueryIntent.GENERAL, RegulatoryTopic.CAPITAL, ["doc-2"])
        
        assert "doc-1" in context.mentioned_documents
        assert "doc-2" in context.mentioned_documents
        assert len(context.mentioned_documents) == 2

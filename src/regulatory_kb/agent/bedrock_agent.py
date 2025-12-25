"""AWS Bedrock Agent Core service for regulatory knowledge base.

Implements the Bedrock Agent runtime with regulatory domain knowledge,
session management, and tool integration.
"""

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Any, Optional

import boto3
from botocore.config import Config

from regulatory_kb.agent.tools import ToolRegistry, ToolResult
from regulatory_kb.core import get_logger

logger = get_logger(__name__)


class AgentState(str, Enum):
    """States of an agent session."""

    IDLE = "idle"
    PROCESSING = "processing"
    AWAITING_INPUT = "awaiting_input"
    ERROR = "error"
    EXPIRED = "expired"


@dataclass
class AgentConfig:
    """Configuration for Bedrock Agent service."""

    region: str = "us-east-1"
    model_id: str = "anthropic.claude-3-sonnet-20240229-v1:0"
    max_tokens: int = 4096
    temperature: float = 0.1
    session_timeout_hours: int = 8
    max_retries: int = 3
    connect_timeout: int = 10
    read_timeout: int = 60


@dataclass
class Citation:
    """Citation for a piece of information in agent response."""

    document_id: str
    document_title: str
    section: Optional[str] = None
    page: Optional[int] = None
    excerpt: Optional[str] = None
    confidence: float = 1.0


@dataclass
class AgentResponse:
    """Response from the Bedrock Agent."""

    text: str
    citations: list[Citation] = field(default_factory=list)
    confidence: float = 1.0
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    is_uncertain: bool = False
    uncertainty_reason: Optional[str] = None


@dataclass
class ConversationTurn:
    """A single turn in a conversation."""

    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    citations: list[Citation] = field(default_factory=list)


@dataclass
class AgentSession:
    """Represents an agent conversation session."""

    session_id: str
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_activity: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    state: AgentState = AgentState.IDLE
    conversation_history: list[ConversationTurn] = field(default_factory=list)
    context: dict[str, Any] = field(default_factory=dict)
    timeout_hours: int = 8

    @property
    def is_expired(self) -> bool:
        """Check if session has expired."""
        expiry_time = self.created_at + timedelta(hours=self.timeout_hours)
        return datetime.now(timezone.utc) > expiry_time

    def add_turn(self, role: str, content: str, **kwargs: Any) -> None:
        """Add a conversation turn."""
        turn = ConversationTurn(role=role, content=content, **kwargs)
        self.conversation_history.append(turn)
        self.last_activity = datetime.now(timezone.utc)

    def get_context_window(self, max_turns: int = 10) -> list[dict[str, str]]:
        """Get recent conversation history for context.
        
        Args:
            max_turns: Maximum number of turns to include.
            
        Returns:
            List of message dictionaries.
        """
        recent = self.conversation_history[-max_turns:]
        return [{"role": t.role, "content": t.content} for t in recent]


# Regulatory domain system prompt
REGULATORY_SYSTEM_PROMPT = """You are a regulatory knowledge assistant specializing in U.S. and Canadian banking regulations. You have access to a comprehensive knowledge base of regulatory documents from:

U.S. Regulators:
- Federal Reserve Board (FRB): CCAR, DFAST, FR Y-14, FR Y-9C, liquidity requirements
- Office of the Comptroller of the Currency (OCC): National bank supervision, Call Reports
- Federal Deposit Insurance Corporation (FDIC): Deposit insurance, resolution planning
- Financial Crimes Enforcement Network (FinCEN): BSA/AML compliance, CTR/SAR reporting

Canadian Regulators:
- Office of the Superintendent of Financial Institutions (OSFI): Capital, liquidity, stress testing guidelines
- Financial Transactions and Reports Analysis Centre of Canada (FINTRAC): AML reporting requirements

Key Regulatory Topics:
- Capital Requirements: Basel III, CCAR, DFAST, CAR guidelines
- Liquidity: LCR (daily), NSFR (quarterly), LAR guidelines
- AML/BSA: CTR ($10,000 threshold, 15 days), SAR (30 days), LCTR (C$10,000), EFTR (5 business days)
- Stress Testing: Annual capital plans, scenario analysis
- Resolution Planning: Living wills, IDI resolution plans
- Model Risk Management: SR 11-7, E-23 guidelines

Guidelines for Responses:
1. Always cite specific documents, CFR sections, or guidelines when providing information
2. Distinguish clearly between U.S. and Canadian requirements
3. Provide accurate deadlines and thresholds
4. When uncertain, indicate uncertainty and suggest verification sources
5. Use the available tools to search for and retrieve relevant documents
6. Maintain context across multi-turn conversations about complex topics
"""


class BedrockAgentService:
    """AWS Bedrock Agent service for regulatory queries.
    
    Provides:
    - Bedrock Agent Core runtime with regulatory domain knowledge
    - Custom tools for graph queries and document retrieval
    - Session management and context persistence
    - Multi-turn conversation support
    """

    def __init__(
        self,
        config: Optional[AgentConfig] = None,
        tool_registry: Optional[ToolRegistry] = None,
    ):
        """Initialize the Bedrock Agent service.
        
        Args:
            config: Agent configuration.
            tool_registry: Registry of available tools.
        """
        self.config = config or AgentConfig()
        self.tool_registry = tool_registry or ToolRegistry()
        self._sessions: dict[str, AgentSession] = {}
        self._client = None

    def _get_client(self):
        """Get or create Bedrock runtime client."""
        if self._client is None:
            boto_config = Config(
                region_name=self.config.region,
                retries={"max_attempts": self.config.max_retries},
                connect_timeout=self.config.connect_timeout,
                read_timeout=self.config.read_timeout,
            )
            self._client = boto3.client(
                "bedrock-runtime",
                config=boto_config,
            )
        return self._client

    # ==================== Session Management ====================

    def create_session(self, context: Optional[dict[str, Any]] = None) -> AgentSession:
        """Create a new agent session.
        
        Args:
            context: Optional initial context for the session.
            
        Returns:
            New AgentSession instance.
        """
        session_id = str(uuid.uuid4())
        session = AgentSession(
            session_id=session_id,
            context=context or {},
            timeout_hours=self.config.session_timeout_hours,
        )
        self._sessions[session_id] = session
        
        logger.info(
            "session_created",
            session_id=session_id,
            timeout_hours=self.config.session_timeout_hours,
        )
        
        return session

    def get_session(self, session_id: str) -> Optional[AgentSession]:
        """Get an existing session.
        
        Args:
            session_id: Session ID to retrieve.
            
        Returns:
            AgentSession or None if not found/expired.
        """
        session = self._sessions.get(session_id)
        
        if session and session.is_expired:
            session.state = AgentState.EXPIRED
            logger.info("session_expired", session_id=session_id)
            return None
        
        return session

    def delete_session(self, session_id: str) -> bool:
        """Delete a session.
        
        Args:
            session_id: Session ID to delete.
            
        Returns:
            True if session was deleted.
        """
        if session_id in self._sessions:
            del self._sessions[session_id]
            logger.info("session_deleted", session_id=session_id)
            return True
        return False

    def cleanup_expired_sessions(self) -> int:
        """Remove all expired sessions.
        
        Returns:
            Number of sessions removed.
        """
        expired = [
            sid for sid, session in self._sessions.items()
            if session.is_expired
        ]
        
        for sid in expired:
            del self._sessions[sid]
        
        if expired:
            logger.info("sessions_cleaned_up", count=len(expired))
        
        return len(expired)

    # ==================== Query Processing ====================

    def query(
        self,
        question: str,
        session_id: Optional[str] = None,
        context: Optional[dict[str, Any]] = None,
    ) -> AgentResponse:
        """Process a natural language query.
        
        Args:
            question: User's question about regulatory requirements.
            session_id: Optional session ID for multi-turn conversations.
            context: Optional additional context.
            
        Returns:
            AgentResponse with answer and citations.
        """
        # Get or create session
        if session_id:
            session = self.get_session(session_id)
            if not session:
                session = self.create_session(context)
        else:
            session = self.create_session(context)
        
        session.state = AgentState.PROCESSING
        session.add_turn("user", question)
        
        logger.info(
            "query_received",
            session_id=session.session_id,
            question_length=len(question),
        )
        
        try:
            # Build messages for the model
            messages = self._build_messages(session, question)
            
            # Get tool definitions
            tools = self._get_tool_definitions()
            
            # Call Bedrock
            response = self._invoke_model(messages, tools)
            
            # Process response and handle tool calls
            agent_response = self._process_response(response, session)
            
            # Add assistant turn to history
            session.add_turn(
                "assistant",
                agent_response.text,
                tool_calls=agent_response.tool_calls,
                citations=agent_response.citations,
            )
            
            session.state = AgentState.IDLE
            
            logger.info(
                "query_completed",
                session_id=session.session_id,
                response_length=len(agent_response.text),
                citations_count=len(agent_response.citations),
            )
            
            return agent_response
        
        except Exception as e:
            session.state = AgentState.ERROR
            logger.error(
                "query_failed",
                session_id=session.session_id,
                error=str(e),
            )
            
            return AgentResponse(
                text=f"I encountered an error processing your query: {str(e)}",
                is_uncertain=True,
                uncertainty_reason="Processing error",
            )

    def _build_messages(
        self,
        session: AgentSession,
        current_question: str,
    ) -> list[dict[str, Any]]:
        """Build message list for model invocation.
        
        Args:
            session: Current session.
            current_question: Current user question.
            
        Returns:
            List of messages for the model.
        """
        messages = []
        
        # Add conversation history (excluding current question)
        for turn in session.conversation_history[:-1]:
            messages.append({
                "role": turn.role,
                "content": [{"type": "text", "text": turn.content}],
            })
        
        # Add current question
        messages.append({
            "role": "user",
            "content": [{"type": "text", "text": current_question}],
        })
        
        return messages

    def _get_tool_definitions(self) -> list[dict[str, Any]]:
        """Get tool definitions for Bedrock.
        
        Returns:
            List of tool configurations.
        """
        schemas = self.tool_registry.get_all_schemas()
        return [{"toolSpec": schema} for schema in schemas]

    def _invoke_model(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Invoke the Bedrock model.
        
        Args:
            messages: Conversation messages.
            tools: Tool definitions.
            
        Returns:
            Model response.
        """
        client = self._get_client()
        
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": self.config.max_tokens,
            "temperature": self.config.temperature,
            "system": REGULATORY_SYSTEM_PROMPT,
            "messages": messages,
        }
        
        if tools:
            request_body["tools"] = tools
        
        response = client.invoke_model(
            modelId=self.config.model_id,
            body=json.dumps(request_body),
        )
        
        return json.loads(response["body"].read())

    def _process_response(
        self,
        response: dict[str, Any],
        session: AgentSession,
    ) -> AgentResponse:
        """Process model response and handle tool calls.
        
        Args:
            response: Raw model response.
            session: Current session.
            
        Returns:
            Processed AgentResponse.
        """
        content = response.get("content", [])
        stop_reason = response.get("stop_reason", "")
        
        text_parts = []
        tool_calls = []
        citations = []
        
        for block in content:
            if block.get("type") == "text":
                text_parts.append(block.get("text", ""))
            
            elif block.get("type") == "tool_use":
                tool_name = block.get("name")
                tool_input = block.get("input", {})
                tool_id = block.get("id")
                
                # Execute the tool
                result = self.tool_registry.execute_tool(tool_name, **tool_input)
                
                tool_calls.append({
                    "tool_id": tool_id,
                    "tool_name": tool_name,
                    "input": tool_input,
                    "result": result.data if result.success else result.error,
                    "success": result.success,
                })
                
                # Extract citations from tool results
                if result.success and result.data:
                    citations.extend(self._extract_citations(result.data))
        
        # If there were tool calls, we may need to continue the conversation
        if stop_reason == "tool_use" and tool_calls:
            # Add tool results and get final response
            return self._continue_with_tool_results(
                session, tool_calls, citations
            )
        
        # Check for uncertainty indicators
        full_text = " ".join(text_parts)
        is_uncertain, uncertainty_reason = self._detect_uncertainty(full_text)
        
        return AgentResponse(
            text=full_text,
            citations=citations,
            tool_calls=tool_calls,
            is_uncertain=is_uncertain,
            uncertainty_reason=uncertainty_reason,
            confidence=0.7 if is_uncertain else 0.95,
        )

    def _continue_with_tool_results(
        self,
        session: AgentSession,
        tool_calls: list[dict[str, Any]],
        citations: list[Citation],
    ) -> AgentResponse:
        """Continue conversation with tool results.
        
        Args:
            session: Current session.
            tool_calls: Executed tool calls.
            citations: Extracted citations.
            
        Returns:
            Final AgentResponse.
        """
        # Build tool result messages
        tool_results = []
        for tc in tool_calls:
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tc["tool_id"],
                "content": json.dumps(tc["result"]) if tc["success"] else tc["result"],
            })
        
        # Get conversation history
        messages = []
        for turn in session.conversation_history:
            messages.append({
                "role": turn.role,
                "content": [{"type": "text", "text": turn.content}],
            })
        
        # Add tool results as assistant message
        messages.append({
            "role": "user",
            "content": tool_results,
        })
        
        # Get final response
        response = self._invoke_model(messages, [])
        
        content = response.get("content", [])
        text_parts = []
        
        for block in content:
            if block.get("type") == "text":
                text_parts.append(block.get("text", ""))
        
        full_text = " ".join(text_parts)
        is_uncertain, uncertainty_reason = self._detect_uncertainty(full_text)
        
        return AgentResponse(
            text=full_text,
            citations=citations,
            tool_calls=tool_calls,
            is_uncertain=is_uncertain,
            uncertainty_reason=uncertainty_reason,
            confidence=0.7 if is_uncertain else 0.95,
        )

    def _extract_citations(self, data: Any) -> list[Citation]:
        """Extract citations from tool result data.
        
        Args:
            data: Tool result data.
            
        Returns:
            List of citations.
        """
        citations = []
        
        if isinstance(data, dict):
            if "document_id" in data:
                citations.append(Citation(
                    document_id=data.get("document_id", ""),
                    document_title=data.get("title", data.get("document_title", "")),
                    excerpt=data.get("excerpt", data.get("chunk_text")),
                ))
            elif "document" in data:
                doc = data["document"]
                citations.append(Citation(
                    document_id=doc.get("id", ""),
                    document_title=doc.get("title", ""),
                ))
        
        elif isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    if "document_id" in item:
                        citations.append(Citation(
                            document_id=item.get("document_id", ""),
                            document_title=item.get("title", ""),
                            excerpt=item.get("excerpt"),
                        ))
        
        return citations

    def _detect_uncertainty(self, text: str) -> tuple[bool, Optional[str]]:
        """Detect uncertainty indicators in response text.
        
        Args:
            text: Response text to analyze.
            
        Returns:
            Tuple of (is_uncertain, reason).
        """
        uncertainty_phrases = [
            "i'm not certain",
            "i'm not sure",
            "i cannot confirm",
            "may vary",
            "please verify",
            "consult the official",
            "check with",
            "i don't have specific",
            "unable to find",
            "could not locate",
        ]
        
        text_lower = text.lower()
        
        for phrase in uncertainty_phrases:
            if phrase in text_lower:
                return True, f"Response contains uncertainty indicator: '{phrase}'"
        
        return False, None

    # ==================== Regulatory-Specific Queries ====================

    def query_ccar_requirements(
        self,
        session_id: Optional[str] = None,
    ) -> AgentResponse:
        """Query about CCAR requirements.
        
        Args:
            session_id: Optional session ID.
            
        Returns:
            AgentResponse about CCAR.
        """
        return self.query(
            "What are the key CCAR requirements and which FR Y-14 forms are involved?",
            session_id=session_id,
        )

    def query_liquidity_requirements(
        self,
        session_id: Optional[str] = None,
    ) -> AgentResponse:
        """Query about liquidity requirements.
        
        Args:
            session_id: Optional session ID.
            
        Returns:
            AgentResponse about liquidity.
        """
        return self.query(
            "What are the differences between LCR and NSFR reporting requirements, "
            "including their frequencies and applicable CFR sections?",
            session_id=session_id,
        )

    def query_aml_deadlines(
        self,
        session_id: Optional[str] = None,
    ) -> AgentResponse:
        """Query about AML reporting deadlines.
        
        Args:
            session_id: Optional session ID.
            
        Returns:
            AgentResponse about AML deadlines.
        """
        return self.query(
            "What are the filing deadlines for CTR, SAR, and FINTRAC reports "
            "(LCTR, EFTR)? Include the threshold amounts.",
            session_id=session_id,
        )

    def compare_us_canadian_requirements(
        self,
        topic: str,
        session_id: Optional[str] = None,
    ) -> AgentResponse:
        """Compare U.S. and Canadian requirements on a topic.
        
        Args:
            topic: Regulatory topic to compare.
            session_id: Optional session ID.
            
        Returns:
            AgentResponse with comparison.
        """
        return self.query(
            f"Compare the U.S. and Canadian regulatory requirements for {topic}. "
            "Cite specific regulations and guidelines from both jurisdictions.",
            session_id=session_id,
        )

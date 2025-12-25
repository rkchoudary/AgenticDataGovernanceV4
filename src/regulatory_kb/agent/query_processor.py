"""Natural language query processing for regulatory knowledge base.

Implements query interpretation, response generation with citations,
uncertainty handling, and multi-turn conversation context management.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from regulatory_kb.agent.tools import ToolRegistry, ToolResult
from regulatory_kb.core import get_logger
from regulatory_kb.models.regulator import ALL_REGULATORS

logger = get_logger(__name__)


class QueryIntent(str, Enum):
    """Identified intent of a regulatory query."""

    DOCUMENT_SEARCH = "document_search"
    REQUIREMENT_LOOKUP = "requirement_lookup"
    DEADLINE_INQUIRY = "deadline_inquiry"
    COMPARISON = "comparison"
    DEFINITION = "definition"
    RELATIONSHIP = "relationship"
    GENERAL = "general"


class RegulatoryTopic(str, Enum):
    """Regulatory topics for query classification."""

    CAPITAL = "capital"
    LIQUIDITY = "liquidity"
    AML_BSA = "aml_bsa"
    STRESS_TESTING = "stress_testing"
    RESOLUTION = "resolution"
    MODEL_RISK = "model_risk"
    REPORTING = "reporting"
    GENERAL = "general"


@dataclass
class Citation:
    """Citation for information in a response."""

    document_id: str
    document_title: str
    section: Optional[str] = None
    page: Optional[int] = None
    excerpt: Optional[str] = None
    confidence: float = 1.0
    regulator: Optional[str] = None
    cfr_reference: Optional[str] = None


@dataclass
class QueryResult:
    """Result from query processing."""

    answer: str
    citations: list[Citation] = field(default_factory=list)
    confidence: float = 1.0
    intent: QueryIntent = QueryIntent.GENERAL
    topic: RegulatoryTopic = RegulatoryTopic.GENERAL
    is_uncertain: bool = False
    uncertainty_reason: Optional[str] = None
    follow_up_suggestions: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ConversationContext:
    """Context for multi-turn conversations."""

    session_id: str
    current_topic: Optional[RegulatoryTopic] = None
    current_regulator: Optional[str] = None
    mentioned_documents: list[str] = field(default_factory=list)
    mentioned_requirements: list[str] = field(default_factory=list)
    previous_intents: list[QueryIntent] = field(default_factory=list)
    turn_count: int = 0
    last_query: Optional[str] = None
    last_answer: Optional[str] = None

    def update(
        self,
        query: str,
        answer: str,
        intent: QueryIntent,
        topic: RegulatoryTopic,
        documents: list[str],
    ) -> None:
        """Update context after a conversation turn."""
        self.turn_count += 1
        self.last_query = query
        self.last_answer = answer
        self.previous_intents.append(intent)
        
        if topic != RegulatoryTopic.GENERAL:
            self.current_topic = topic
        
        for doc_id in documents:
            if doc_id not in self.mentioned_documents:
                self.mentioned_documents.append(doc_id)


# Regulatory keyword patterns for intent and topic detection
TOPIC_KEYWORDS = {
    RegulatoryTopic.CAPITAL: [
        "capital", "ccar", "dfast", "basel", "tier 1", "tier 2", "rwa",
        "risk-weighted", "car", "bcar", "fr y-14", "capital plan",
        "capital adequacy", "capital requirement",
    ],
    RegulatoryTopic.LIQUIDITY: [
        "liquidity", "lcr", "nsfr", "lar", "hqla", "net stable funding",
        "liquidity coverage", "fr 2052", "liquidity requirement",
        "liquidity ratio", "liquidity monitoring",
    ],
    RegulatoryTopic.AML_BSA: [
        "aml", "bsa", "ctr", "sar", "suspicious activity", "currency transaction",
        "fincen", "fintrac", "lctr", "eftr", "str", "money laundering",
        "kyc", "customer due diligence", "beneficial owner", "ofac",
    ],
    RegulatoryTopic.STRESS_TESTING: [
        "stress test", "scenario", "severely adverse", "baseline",
        "adverse scenario", "capital planning", "e-18", "stress testing",
    ],
    RegulatoryTopic.RESOLUTION: [
        "resolution", "living will", "recovery", "iddi", "resolution plan",
        "orderly liquidation", "cfr 360", "cfr 243", "cfr 381",
    ],
    RegulatoryTopic.MODEL_RISK: [
        "model risk", "sr 11-7", "e-23", "model validation",
        "model governance", "model development", "bcbs 239",
    ],
    RegulatoryTopic.REPORTING: [
        "report", "filing", "form", "call report", "ffiec", "schedule",
        "submission", "deadline", "quarterly", "annual", "monthly",
    ],
}

INTENT_PATTERNS = {
    QueryIntent.DEADLINE_INQUIRY: [
        r"when\s+(is|are|do|does)",
        r"deadline",
        r"due\s+date",
        r"filing\s+date",
        r"how\s+long",
        r"time\s+frame",
        r"within\s+\d+\s+days",
    ],
    QueryIntent.COMPARISON: [
        r"compare",
        r"difference\s+between",
        r"vs\.?",
        r"versus",
        r"how\s+does\s+.+\s+differ",
        r"canadian\s+.+\s+us",
        r"us\s+.+\s+canadian",
    ],
    QueryIntent.DEFINITION: [
        r"what\s+is",
        r"what\s+are",
        r"define",
        r"definition",
        r"meaning\s+of",
        r"explain",
    ],
    QueryIntent.REQUIREMENT_LOOKUP: [
        r"requirement",
        r"must\s+.+\s+file",
        r"obligat",
        r"comply",
        r"compliance",
        r"threshold",
        r"who\s+needs\s+to",
    ],
    QueryIntent.DOCUMENT_SEARCH: [
        r"find\s+.+\s+document",
        r"search\s+for",
        r"locate",
        r"where\s+can\s+i\s+find",
        r"guidance\s+on",
    ],
    QueryIntent.RELATIONSHIP: [
        r"related\s+to",
        r"connection\s+between",
        r"how\s+.+\s+relate",
        r"implements",
        r"supersedes",
    ],
}

# Regulatory deadlines knowledge base
REGULATORY_DEADLINES = {
    "ctr": {
        "deadline": "15 calendar days",
        "threshold": "$10,000",
        "regulator": "FinCEN",
        "cfr": "31 CFR 1010.311",
    },
    "sar": {
        "deadline": "30 calendar days (may extend to 60 days)",
        "threshold": "Varies by suspicious activity type",
        "regulator": "FinCEN",
        "cfr": "31 CFR 1020.320",
    },
    "lctr": {
        "deadline": "15 calendar days",
        "threshold": "C$10,000",
        "regulator": "FINTRAC",
    },
    "eftr": {
        "deadline": "5 business days",
        "threshold": "C$10,000 or more",
        "regulator": "FINTRAC",
    },
    "str": {
        "deadline": "3 business days (30 days for completed)",
        "threshold": "Reasonable grounds to suspect",
        "regulator": "FINTRAC",
    },
    "lcr": {
        "frequency": "Daily calculation, monthly reporting",
        "regulator": "Federal Reserve/OCC/FDIC",
        "cfr": "12 CFR Part 249",
    },
    "nsfr": {
        "frequency": "Quarterly",
        "regulator": "Federal Reserve/OCC/FDIC",
    },
    "ccar": {
        "frequency": "Annual",
        "deadline": "April 5",
        "regulator": "Federal Reserve",
    },
    "call_report": {
        "frequency": "Quarterly",
        "deadline": "30 days after quarter end",
        "regulator": "FFIEC",
    },
}


class QueryProcessor:
    """Processes natural language queries about regulatory requirements.
    
    Provides:
    - Query interpretation for regulatory topics
    - Response generation with proper citations
    - Uncertainty handling and confidence scoring
    - Multi-turn conversation context management
    """

    def __init__(self, tool_registry: Optional[ToolRegistry] = None):
        """Initialize the query processor.
        
        Args:
            tool_registry: Registry of available tools.
        """
        self.tool_registry = tool_registry
        self._contexts: dict[str, ConversationContext] = {}

    # ==================== Query Analysis ====================

    def analyze_query(self, query: str) -> tuple[QueryIntent, RegulatoryTopic, list[str]]:
        """Analyze a query to determine intent and topic.
        
        Args:
            query: User's query text.
            
        Returns:
            Tuple of (intent, topic, extracted_entities).
        """
        query_lower = query.lower()
        
        # Detect intent
        intent = self._detect_intent(query_lower)
        
        # Detect topic
        topic = self._detect_topic(query_lower)
        
        # Extract entities (regulators, form numbers, etc.)
        entities = self._extract_entities(query)
        
        logger.info(
            "query_analyzed",
            intent=intent.value,
            topic=topic.value,
            entities=entities,
        )
        
        return intent, topic, entities

    def _detect_intent(self, query_lower: str) -> QueryIntent:
        """Detect the intent of a query.
        
        Args:
            query_lower: Lowercase query text.
            
        Returns:
            Detected QueryIntent.
        """
        for intent, patterns in INTENT_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, query_lower):
                    return intent
        
        return QueryIntent.GENERAL

    def _detect_topic(self, query_lower: str) -> RegulatoryTopic:
        """Detect the regulatory topic of a query.
        
        Args:
            query_lower: Lowercase query text.
            
        Returns:
            Detected RegulatoryTopic.
        """
        topic_scores: dict[RegulatoryTopic, int] = {}
        
        for topic, keywords in TOPIC_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in query_lower)
            if score > 0:
                topic_scores[topic] = score
        
        if topic_scores:
            return max(topic_scores, key=topic_scores.get)
        
        return RegulatoryTopic.GENERAL

    def _extract_entities(self, query: str) -> list[str]:
        """Extract regulatory entities from query.
        
        Args:
            query: Query text.
            
        Returns:
            List of extracted entities.
        """
        entities = []
        query_lower = query.lower()
        
        # Extract regulator mentions
        for reg_key, regulator in ALL_REGULATORS.items():
            if reg_key in query_lower or regulator.abbreviation.lower() in query_lower:
                entities.append(f"regulator:{regulator.id}")
        
        # Extract form numbers (FR Y-14, FFIEC 031, etc.)
        form_patterns = [
            r"fr\s*y-?\d+[a-z]?",
            r"ffiec\s*\d+",
            r"fr\s*\d+[a-z]?",
        ]
        for pattern in form_patterns:
            matches = re.findall(pattern, query_lower)
            entities.extend([f"form:{m.upper()}" for m in matches])
        
        # Extract CFR references
        cfr_pattern = r"\d+\s*cfr\s*(?:part\s*)?\d+(?:\.\d+)?"
        cfr_matches = re.findall(cfr_pattern, query_lower)
        entities.extend([f"cfr:{m}" for m in cfr_matches])
        
        return entities

    # ==================== Context Management ====================

    def get_context(self, session_id: str) -> ConversationContext:
        """Get or create conversation context.
        
        Args:
            session_id: Session identifier.
            
        Returns:
            ConversationContext for the session.
        """
        if session_id not in self._contexts:
            self._contexts[session_id] = ConversationContext(session_id=session_id)
        return self._contexts[session_id]

    def clear_context(self, session_id: str) -> bool:
        """Clear conversation context.
        
        Args:
            session_id: Session identifier.
            
        Returns:
            True if context was cleared.
        """
        if session_id in self._contexts:
            del self._contexts[session_id]
            return True
        return False

    def apply_context(
        self,
        query: str,
        context: ConversationContext,
    ) -> str:
        """Apply conversation context to enhance query.
        
        Args:
            query: Original query.
            context: Conversation context.
            
        Returns:
            Enhanced query with context.
        """
        # If query uses pronouns or references, try to resolve them
        enhanced = query
        
        # Handle "it", "this", "that" references
        if context.mentioned_documents and re.search(r"\b(it|this|that)\b", query.lower()):
            # Reference the most recently mentioned document
            last_doc = context.mentioned_documents[-1]
            enhanced = f"{query} (referring to document: {last_doc})"
        
        # Handle topic continuation
        if context.current_topic and "same" in query.lower():
            enhanced = f"{query} (continuing topic: {context.current_topic.value})"
        
        return enhanced

    # ==================== Response Generation ====================

    def process_query(
        self,
        query: str,
        session_id: Optional[str] = None,
    ) -> QueryResult:
        """Process a regulatory query and generate response.
        
        Args:
            query: User's query.
            session_id: Optional session ID for context.
            
        Returns:
            QueryResult with answer and citations.
        """
        # Get context if session provided
        context = None
        if session_id:
            context = self.get_context(session_id)
            query = self.apply_context(query, context)
        
        # Analyze query
        intent, topic, entities = self.analyze_query(query)
        
        # Generate response based on intent
        if intent == QueryIntent.DEADLINE_INQUIRY:
            result = self._handle_deadline_query(query, topic, entities)
        elif intent == QueryIntent.COMPARISON:
            result = self._handle_comparison_query(query, topic, entities)
        elif intent == QueryIntent.DEFINITION:
            result = self._handle_definition_query(query, topic, entities)
        elif intent == QueryIntent.REQUIREMENT_LOOKUP:
            result = self._handle_requirement_query(query, topic, entities)
        elif intent == QueryIntent.DOCUMENT_SEARCH:
            result = self._handle_document_search(query, topic, entities)
        elif intent == QueryIntent.RELATIONSHIP:
            result = self._handle_relationship_query(query, topic, entities)
        else:
            result = self._handle_general_query(query, topic, entities)
        
        # Update context
        if context:
            doc_ids = [c.document_id for c in result.citations]
            context.update(query, result.answer, intent, topic, doc_ids)
        
        # Add follow-up suggestions
        result.follow_up_suggestions = self._generate_follow_ups(intent, topic)
        
        return result

    def _handle_deadline_query(
        self,
        query: str,
        topic: RegulatoryTopic,
        entities: list[str],
    ) -> QueryResult:
        """Handle deadline-related queries.
        
        Args:
            query: Query text.
            topic: Detected topic.
            entities: Extracted entities.
            
        Returns:
            QueryResult with deadline information.
        """
        query_lower = query.lower()
        citations = []
        answer_parts = []
        
        # Check for specific deadline types
        for deadline_key, info in REGULATORY_DEADLINES.items():
            if deadline_key in query_lower:
                deadline = info.get("deadline", info.get("frequency", ""))
                threshold = info.get("threshold", "")
                regulator = info.get("regulator", "")
                cfr = info.get("cfr", "")
                
                answer_parts.append(
                    f"**{deadline_key.upper()}**: {deadline}"
                    + (f" (threshold: {threshold})" if threshold else "")
                    + f" - {regulator}"
                )
                
                if cfr:
                    citations.append(Citation(
                        document_id=cfr.replace(" ", "_").lower(),
                        document_title=cfr,
                        cfr_reference=cfr,
                        regulator=regulator,
                    ))
        
        if answer_parts:
            answer = "Here are the relevant deadlines:\n\n" + "\n".join(answer_parts)
            confidence = 0.95
        else:
            answer = (
                "I can help with regulatory deadlines. Could you specify which "
                "report or filing you're asking about? Common ones include:\n"
                "- CTR (Currency Transaction Report)\n"
                "- SAR (Suspicious Activity Report)\n"
                "- LCTR/EFTR (FINTRAC reports)\n"
                "- LCR/NSFR (Liquidity reports)\n"
                "- CCAR/DFAST (Capital planning)"
            )
            confidence = 0.7
        
        return QueryResult(
            answer=answer,
            citations=citations,
            confidence=confidence,
            intent=QueryIntent.DEADLINE_INQUIRY,
            topic=topic,
            is_uncertain=confidence < 0.8,
        )

    def _handle_comparison_query(
        self,
        query: str,
        topic: RegulatoryTopic,
        entities: list[str],
    ) -> QueryResult:
        """Handle comparison queries between jurisdictions or requirements.
        
        Args:
            query: Query text.
            topic: Detected topic.
            entities: Extracted entities.
            
        Returns:
            QueryResult with comparison.
        """
        query_lower = query.lower()
        
        # Check for US vs Canadian comparison
        is_cross_border = (
            ("us" in query_lower or "u.s." in query_lower or "american" in query_lower)
            and ("canad" in query_lower)
        )
        
        if is_cross_border and topic == RegulatoryTopic.AML_BSA:
            answer = (
                "**U.S. vs Canadian AML Reporting Comparison:**\n\n"
                "**Currency Transaction Reports:**\n"
                "- U.S. (CTR): $10,000 threshold, 15 calendar days to file\n"
                "- Canada (LCTR): C$10,000 threshold, 15 calendar days to file\n\n"
                "**Electronic Funds Transfers:**\n"
                "- U.S.: Included in CTR/SAR as applicable\n"
                "- Canada (EFTR): C$10,000+, 5 business days to file\n\n"
                "**Suspicious Activity:**\n"
                "- U.S. (SAR): 30 days (extendable to 60)\n"
                "- Canada (STR): 3 business days initial, 30 days completed\n\n"
                "**Regulators:**\n"
                "- U.S.: FinCEN (31 CFR Chapter X)\n"
                "- Canada: FINTRAC (PCMLTFA)"
            )
            
            citations = [
                Citation(
                    document_id="31_cfr_1010",
                    document_title="31 CFR Part 1010 - General Provisions",
                    cfr_reference="31 CFR 1010",
                    regulator="FinCEN",
                ),
                Citation(
                    document_id="pcmltfa",
                    document_title="Proceeds of Crime (Money Laundering) and Terrorist Financing Act",
                    regulator="FINTRAC",
                ),
            ]
            
            return QueryResult(
                answer=answer,
                citations=citations,
                confidence=0.9,
                intent=QueryIntent.COMPARISON,
                topic=topic,
            )
        
        # Generic comparison response
        return QueryResult(
            answer=(
                "I can help compare regulatory requirements. Please specify:\n"
                "1. Which jurisdictions (U.S., Canada, or both)\n"
                "2. Which regulatory area (capital, liquidity, AML, etc.)\n"
                "3. Specific requirements or forms to compare"
            ),
            citations=[],
            confidence=0.6,
            intent=QueryIntent.COMPARISON,
            topic=topic,
            is_uncertain=True,
            uncertainty_reason="Need more specific comparison criteria",
        )

    def _handle_definition_query(
        self,
        query: str,
        topic: RegulatoryTopic,
        entities: list[str],
    ) -> QueryResult:
        """Handle definition queries.
        
        Args:
            query: Query text.
            topic: Detected topic.
            entities: Extracted entities.
            
        Returns:
            QueryResult with definition.
        """
        # This would typically use the tool registry to search for definitions
        # For now, provide a structured response
        return QueryResult(
            answer=(
                "I can provide definitions for regulatory terms. "
                "Please use the search functionality to find specific definitions "
                "in the regulatory documents."
            ),
            citations=[],
            confidence=0.7,
            intent=QueryIntent.DEFINITION,
            topic=topic,
            is_uncertain=True,
            uncertainty_reason="Definition lookup requires document search",
        )

    def _handle_requirement_query(
        self,
        query: str,
        topic: RegulatoryTopic,
        entities: list[str],
    ) -> QueryResult:
        """Handle requirement lookup queries.
        
        Args:
            query: Query text.
            topic: Detected topic.
            entities: Extracted entities.
            
        Returns:
            QueryResult with requirement information.
        """
        # Use tool registry if available
        if self.tool_registry:
            search_tool = self.tool_registry.get("regulatory_search")
            if search_tool:
                result = search_tool.execute(query=query, top_k=5)
                if result.success and result.data:
                    citations = [
                        Citation(
                            document_id=r["document_id"],
                            document_title=r["title"],
                            excerpt=r.get("excerpt"),
                        )
                        for r in result.data
                    ]
                    
                    return QueryResult(
                        answer=f"Found {len(result.data)} relevant documents for your requirement query.",
                        citations=citations,
                        confidence=0.85,
                        intent=QueryIntent.REQUIREMENT_LOOKUP,
                        topic=topic,
                    )
        
        return QueryResult(
            answer="Please specify the requirement you're looking for.",
            citations=[],
            confidence=0.5,
            intent=QueryIntent.REQUIREMENT_LOOKUP,
            topic=topic,
            is_uncertain=True,
        )

    def _handle_document_search(
        self,
        query: str,
        topic: RegulatoryTopic,
        entities: list[str],
    ) -> QueryResult:
        """Handle document search queries.
        
        Args:
            query: Query text.
            topic: Detected topic.
            entities: Extracted entities.
            
        Returns:
            QueryResult with search results.
        """
        if self.tool_registry:
            search_tool = self.tool_registry.get("regulatory_search")
            if search_tool:
                result = search_tool.execute(query=query, top_k=10)
                if result.success and result.data:
                    citations = [
                        Citation(
                            document_id=r["document_id"],
                            document_title=r["title"],
                            excerpt=r.get("excerpt"),
                        )
                        for r in result.data
                    ]
                    
                    return QueryResult(
                        answer=f"Found {len(result.data)} documents matching your search.",
                        citations=citations,
                        confidence=0.9,
                        intent=QueryIntent.DOCUMENT_SEARCH,
                        topic=topic,
                    )
        
        return QueryResult(
            answer="Document search is available. Please provide search terms.",
            citations=[],
            confidence=0.5,
            intent=QueryIntent.DOCUMENT_SEARCH,
            topic=topic,
        )

    def _handle_relationship_query(
        self,
        query: str,
        topic: RegulatoryTopic,
        entities: list[str],
    ) -> QueryResult:
        """Handle relationship queries between documents.
        
        Args:
            query: Query text.
            topic: Detected topic.
            entities: Extracted entities.
            
        Returns:
            QueryResult with relationship information.
        """
        if self.tool_registry:
            graph_tool = self.tool_registry.get("graph_query")
            if graph_tool:
                # Extract document ID from entities
                doc_ids = [e.split(":")[1] for e in entities if e.startswith("form:")]
                if doc_ids:
                    result = graph_tool.execute(
                        query_type="get_related_documents",
                        document_id=doc_ids[0],
                    )
                    if result.success and result.data:
                        return QueryResult(
                            answer=f"Found {len(result.data)} related documents.",
                            citations=[],
                            confidence=0.85,
                            intent=QueryIntent.RELATIONSHIP,
                            topic=topic,
                        )
        
        return QueryResult(
            answer="Please specify which documents you want to find relationships for.",
            citations=[],
            confidence=0.5,
            intent=QueryIntent.RELATIONSHIP,
            topic=topic,
            is_uncertain=True,
        )

    def _handle_general_query(
        self,
        query: str,
        topic: RegulatoryTopic,
        entities: list[str],
    ) -> QueryResult:
        """Handle general queries.
        
        Args:
            query: Query text.
            topic: Detected topic.
            entities: Extracted entities.
            
        Returns:
            QueryResult with general response.
        """
        return QueryResult(
            answer=(
                "I can help with regulatory questions about:\n"
                "- Capital requirements (CCAR, DFAST, Basel)\n"
                "- Liquidity requirements (LCR, NSFR)\n"
                "- AML/BSA compliance (CTR, SAR, FINTRAC reports)\n"
                "- Stress testing and capital planning\n"
                "- Resolution planning\n"
                "- Model risk management\n\n"
                "Please ask a specific question about any of these topics."
            ),
            citations=[],
            confidence=0.8,
            intent=QueryIntent.GENERAL,
            topic=topic,
        )

    def _generate_follow_ups(
        self,
        intent: QueryIntent,
        topic: RegulatoryTopic,
    ) -> list[str]:
        """Generate follow-up question suggestions.
        
        Args:
            intent: Query intent.
            topic: Query topic.
            
        Returns:
            List of suggested follow-up questions.
        """
        suggestions = []
        
        if topic == RegulatoryTopic.AML_BSA:
            suggestions.extend([
                "What are the SAR filing requirements?",
                "How do U.S. and Canadian AML requirements differ?",
                "What is the CTR threshold amount?",
            ])
        elif topic == RegulatoryTopic.CAPITAL:
            suggestions.extend([
                "What forms are required for CCAR?",
                "What is the difference between CCAR and DFAST?",
                "What are the Basel III capital requirements?",
            ])
        elif topic == RegulatoryTopic.LIQUIDITY:
            suggestions.extend([
                "What is the LCR reporting frequency?",
                "How is NSFR calculated?",
                "What are HQLA requirements?",
            ])
        
        return suggestions[:3]

    # ==================== Confidence Scoring ====================

    def calculate_confidence(
        self,
        citations: list[Citation],
        intent: QueryIntent,
        has_tool_results: bool,
    ) -> float:
        """Calculate confidence score for a response.
        
        Args:
            citations: Response citations.
            intent: Query intent.
            has_tool_results: Whether tool results were used.
            
        Returns:
            Confidence score between 0 and 1.
        """
        base_confidence = 0.5
        
        # Boost for citations
        if citations:
            base_confidence += min(0.3, len(citations) * 0.1)
        
        # Boost for tool results
        if has_tool_results:
            base_confidence += 0.15
        
        # Adjust by intent (some intents are more reliable)
        intent_adjustments = {
            QueryIntent.DEADLINE_INQUIRY: 0.1,
            QueryIntent.DEFINITION: 0.05,
            QueryIntent.DOCUMENT_SEARCH: 0.1,
            QueryIntent.GENERAL: -0.1,
        }
        base_confidence += intent_adjustments.get(intent, 0)
        
        return min(1.0, max(0.0, base_confidence))

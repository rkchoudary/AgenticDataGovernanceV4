"""AWS Bedrock Agent Core integration for regulatory knowledge base."""

from regulatory_kb.agent.bedrock_agent import (
    BedrockAgentService,
    AgentConfig,
    AgentSession,
    AgentResponse,
)
from regulatory_kb.agent.tools import (
    AgentTool,
    ToolRegistry,
    GraphQueryTool,
    DocumentRetrievalTool,
    RegulatorySearchTool,
)
from regulatory_kb.agent.query_processor import (
    QueryProcessor,
    QueryIntent,
    QueryResult,
    Citation,
)

__all__ = [
    "BedrockAgentService",
    "AgentConfig",
    "AgentSession",
    "AgentResponse",
    "AgentTool",
    "ToolRegistry",
    "GraphQueryTool",
    "DocumentRetrievalTool",
    "RegulatorySearchTool",
    "QueryProcessor",
    "QueryIntent",
    "QueryResult",
    "Citation",
]

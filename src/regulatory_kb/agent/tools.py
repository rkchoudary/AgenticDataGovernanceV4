"""Custom tools for Bedrock Agent Core integration.

Implements tools for graph queries, document retrieval, and regulatory search
that can be invoked by the Bedrock Agent during conversation.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional

from regulatory_kb.models.document import DocumentCategory
from regulatory_kb.storage.graph_store import FalkorDBStore
from regulatory_kb.storage.vector_search import VectorSearchService, SearchMode


class ToolType(str, Enum):
    """Types of agent tools."""

    GRAPH_QUERY = "graph_query"
    DOCUMENT_RETRIEVAL = "document_retrieval"
    REGULATORY_SEARCH = "regulatory_search"
    RELATIONSHIP_TRAVERSAL = "relationship_traversal"


@dataclass
class ToolParameter:
    """Definition of a tool parameter."""

    name: str
    description: str
    param_type: str  # string, integer, boolean, array
    required: bool = True
    default: Any = None
    enum_values: Optional[list[str]] = None


@dataclass
class ToolResult:
    """Result from tool execution."""

    success: bool
    data: Any = None
    error: Optional[str] = None
    metadata: dict[str, Any] = field(default_factory=dict)


class AgentTool(ABC):
    """Base class for agent tools."""

    def __init__(
        self,
        name: str,
        description: str,
        tool_type: ToolType,
        parameters: list[ToolParameter],
    ):
        self.name = name
        self.description = description
        self.tool_type = tool_type
        self.parameters = parameters

    @abstractmethod
    def execute(self, **kwargs: Any) -> ToolResult:
        """Execute the tool with given parameters.
        
        Args:
            **kwargs: Tool parameters.
            
        Returns:
            ToolResult with execution outcome.
        """
        pass

    def get_schema(self) -> dict[str, Any]:
        """Get the tool schema for Bedrock Agent.
        
        Returns:
            Tool schema dictionary.
        """
        properties = {}
        required = []
        
        for param in self.parameters:
            prop = {
                "type": param.param_type,
                "description": param.description,
            }
            if param.enum_values:
                prop["enum"] = param.enum_values
            if param.default is not None:
                prop["default"] = param.default
            
            properties[param.name] = prop
            if param.required:
                required.append(param.name)
        
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                }
            },
        }


class GraphQueryTool(AgentTool):
    """Tool for executing graph queries against FalkorDB.
    
    Enables the agent to query regulatory document relationships,
    find related documents, and traverse the knowledge graph.
    """

    def __init__(self, store: FalkorDBStore):
        """Initialize the graph query tool.
        
        Args:
            store: FalkorDB store instance.
        """
        self.store = store
        
        parameters = [
            ToolParameter(
                name="query_type",
                description="Type of graph query to execute",
                param_type="string",
                enum_values=[
                    "get_document",
                    "get_related_documents",
                    "get_documents_by_regulator",
                    "get_documents_by_category",
                    "search_documents",
                ],
            ),
            ToolParameter(
                name="document_id",
                description="Document ID for document-specific queries",
                param_type="string",
                required=False,
            ),
            ToolParameter(
                name="regulator_id",
                description="Regulator ID (us_frb, us_occ, us_fdic, us_fincen, ca_osfi, ca_fintrac)",
                param_type="string",
                required=False,
            ),
            ToolParameter(
                name="category",
                description="Document category for filtering",
                param_type="string",
                required=False,
                enum_values=[c.value for c in DocumentCategory],
            ),
            ToolParameter(
                name="search_term",
                description="Search term for document title search",
                param_type="string",
                required=False,
            ),
            ToolParameter(
                name="limit",
                description="Maximum number of results to return",
                param_type="integer",
                required=False,
                default=10,
            ),
        ]
        
        super().__init__(
            name="graph_query",
            description="Query the regulatory knowledge graph to find documents, relationships, and regulatory information",
            tool_type=ToolType.GRAPH_QUERY,
            parameters=parameters,
        )

    def execute(self, **kwargs: Any) -> ToolResult:
        """Execute a graph query.
        
        Args:
            **kwargs: Query parameters.
            
        Returns:
            ToolResult with query results.
        """
        query_type = kwargs.get("query_type")
        limit = kwargs.get("limit", 10)
        
        try:
            if query_type == "get_document":
                doc_id = kwargs.get("document_id")
                if not doc_id:
                    return ToolResult(
                        success=False,
                        error="document_id is required for get_document query",
                    )
                result = self.store.get_document_by_id(doc_id)
                return ToolResult(success=True, data=result)
            
            elif query_type == "get_related_documents":
                doc_id = kwargs.get("document_id")
                if not doc_id:
                    return ToolResult(
                        success=False,
                        error="document_id is required for get_related_documents query",
                    )
                result = self.store.get_related_documents(doc_id)
                return ToolResult(success=True, data=result)
            
            elif query_type == "get_documents_by_regulator":
                regulator_id = kwargs.get("regulator_id")
                if not regulator_id:
                    return ToolResult(
                        success=False,
                        error="regulator_id is required for get_documents_by_regulator query",
                    )
                result = self.store.get_documents_by_regulator(regulator_id, limit)
                return ToolResult(success=True, data=result)
            
            elif query_type == "get_documents_by_category":
                category_str = kwargs.get("category")
                if not category_str:
                    return ToolResult(
                        success=False,
                        error="category is required for get_documents_by_category query",
                    )
                category = DocumentCategory(category_str)
                result = self.store.get_documents_by_category(category, limit)
                return ToolResult(success=True, data=result)
            
            elif query_type == "search_documents":
                search_term = kwargs.get("search_term")
                if not search_term:
                    return ToolResult(
                        success=False,
                        error="search_term is required for search_documents query",
                    )
                regulator_id = kwargs.get("regulator_id")
                category_str = kwargs.get("category")
                category = DocumentCategory(category_str) if category_str else None
                result = self.store.search_documents(
                    search_term, regulator_id, category, limit
                )
                return ToolResult(success=True, data=result)
            
            else:
                return ToolResult(
                    success=False,
                    error=f"Unknown query_type: {query_type}",
                )
        
        except Exception as e:
            return ToolResult(success=False, error=str(e))


class DocumentRetrievalTool(AgentTool):
    """Tool for retrieving document content and metadata.
    
    Enables the agent to fetch full document content, metadata,
    and specific sections from the knowledge base.
    """

    def __init__(self, store: FalkorDBStore):
        """Initialize the document retrieval tool.
        
        Args:
            store: FalkorDB store instance.
        """
        self.store = store
        
        parameters = [
            ToolParameter(
                name="document_id",
                description="ID of the document to retrieve",
                param_type="string",
            ),
            ToolParameter(
                name="include_content",
                description="Whether to include full document content",
                param_type="boolean",
                required=False,
                default=False,
            ),
            ToolParameter(
                name="include_relationships",
                description="Whether to include document relationships",
                param_type="boolean",
                required=False,
                default=True,
            ),
        ]
        
        super().__init__(
            name="document_retrieval",
            description="Retrieve detailed information about a specific regulatory document including content and relationships",
            tool_type=ToolType.DOCUMENT_RETRIEVAL,
            parameters=parameters,
        )

    def execute(self, **kwargs: Any) -> ToolResult:
        """Retrieve document details.
        
        Args:
            **kwargs: Retrieval parameters.
            
        Returns:
            ToolResult with document data.
        """
        document_id = kwargs.get("document_id")
        include_relationships = kwargs.get("include_relationships", True)
        
        if not document_id:
            return ToolResult(
                success=False,
                error="document_id is required",
            )
        
        try:
            document = self.store.get_document_by_id(document_id)
            
            if not document:
                return ToolResult(
                    success=False,
                    error=f"Document not found: {document_id}",
                )
            
            result = {"document": document}
            
            if include_relationships:
                related = self.store.get_related_documents(document_id)
                result["related_documents"] = related
            
            return ToolResult(success=True, data=result)
        
        except Exception as e:
            return ToolResult(success=False, error=str(e))


class RegulatorySearchTool(AgentTool):
    """Tool for semantic search across regulatory documents.
    
    Enables the agent to perform vector similarity search and
    hybrid search to find relevant regulatory content.
    """

    def __init__(
        self,
        store: FalkorDBStore,
        vector_service: Optional[VectorSearchService] = None,
    ):
        """Initialize the regulatory search tool.
        
        Args:
            store: FalkorDB store instance.
            vector_service: Optional vector search service.
        """
        self.store = store
        self.vector_service = vector_service or VectorSearchService(store)
        
        parameters = [
            ToolParameter(
                name="query",
                description="Natural language search query about regulatory requirements",
                param_type="string",
            ),
            ToolParameter(
                name="search_mode",
                description="Search mode: vector_only, keyword_only, or hybrid",
                param_type="string",
                required=False,
                default="hybrid",
                enum_values=["vector_only", "keyword_only", "hybrid"],
            ),
            ToolParameter(
                name="regulator_id",
                description="Filter by regulator ID",
                param_type="string",
                required=False,
            ),
            ToolParameter(
                name="top_k",
                description="Number of results to return",
                param_type="integer",
                required=False,
                default=5,
            ),
        ]
        
        super().__init__(
            name="regulatory_search",
            description="Search for regulatory documents and requirements using natural language queries",
            tool_type=ToolType.REGULATORY_SEARCH,
            parameters=parameters,
        )

    def execute(self, **kwargs: Any) -> ToolResult:
        """Execute a regulatory search.
        
        Args:
            **kwargs: Search parameters.
            
        Returns:
            ToolResult with search results.
        """
        query = kwargs.get("query")
        search_mode_str = kwargs.get("search_mode", "hybrid")
        regulator_id = kwargs.get("regulator_id")
        top_k = kwargs.get("top_k", 5)
        
        if not query:
            return ToolResult(
                success=False,
                error="query is required",
            )
        
        try:
            search_mode = SearchMode(search_mode_str)
            
            results = self.vector_service.hybrid_search(
                query_text=query,
                mode=search_mode,
                top_k=top_k,
                regulator_id=regulator_id,
            )
            
            # Format results for agent consumption
            formatted_results = []
            for r in results:
                formatted_results.append({
                    "document_id": r.document_id,
                    "title": r.title,
                    "relevance_score": r.combined_score,
                    "matched_keywords": r.matched_keywords,
                    "excerpt": r.chunk_text[:500] if r.chunk_text else None,
                })
            
            return ToolResult(
                success=True,
                data=formatted_results,
                metadata={"total_results": len(formatted_results)},
            )
        
        except Exception as e:
            return ToolResult(success=False, error=str(e))


class ToolRegistry:
    """Registry for managing agent tools.
    
    Provides centralized tool registration and lookup for the Bedrock Agent.
    """

    def __init__(self):
        """Initialize the tool registry."""
        self._tools: dict[str, AgentTool] = {}

    def register(self, tool: AgentTool) -> None:
        """Register a tool.
        
        Args:
            tool: Tool to register.
        """
        self._tools[tool.name] = tool

    def unregister(self, tool_name: str) -> bool:
        """Unregister a tool.
        
        Args:
            tool_name: Name of tool to unregister.
            
        Returns:
            True if tool was unregistered.
        """
        if tool_name in self._tools:
            del self._tools[tool_name]
            return True
        return False

    def get(self, tool_name: str) -> Optional[AgentTool]:
        """Get a tool by name.
        
        Args:
            tool_name: Name of tool to retrieve.
            
        Returns:
            Tool instance or None.
        """
        return self._tools.get(tool_name)

    def list_tools(self) -> list[str]:
        """List all registered tool names.
        
        Returns:
            List of tool names.
        """
        return list(self._tools.keys())

    def get_all_schemas(self) -> list[dict[str, Any]]:
        """Get schemas for all registered tools.
        
        Returns:
            List of tool schemas.
        """
        return [tool.get_schema() for tool in self._tools.values()]

    def execute_tool(self, tool_name: str, **kwargs: Any) -> ToolResult:
        """Execute a tool by name.
        
        Args:
            tool_name: Name of tool to execute.
            **kwargs: Tool parameters.
            
        Returns:
            ToolResult from tool execution.
        """
        tool = self.get(tool_name)
        if not tool:
            return ToolResult(
                success=False,
                error=f"Tool not found: {tool_name}",
            )
        return tool.execute(**kwargs)

    @classmethod
    def create_default_registry(
        cls,
        store: FalkorDBStore,
        vector_service: Optional[VectorSearchService] = None,
    ) -> "ToolRegistry":
        """Create a registry with default tools.
        
        Args:
            store: FalkorDB store instance.
            vector_service: Optional vector search service.
            
        Returns:
            Configured tool registry.
        """
        registry = cls()
        
        # Register default tools
        registry.register(GraphQueryTool(store))
        registry.register(DocumentRetrievalTool(store))
        registry.register(RegulatorySearchTool(store, vector_service))
        
        return registry

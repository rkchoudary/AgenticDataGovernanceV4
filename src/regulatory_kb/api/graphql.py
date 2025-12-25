"""GraphQL endpoint for complex regulatory relationship queries.

Implements Requirements 13.5:
- GraphQL queries for traversing relationships between regulations and implementing guidance
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional, Callable

from regulatory_kb.models.document import DocumentCategory, DocumentType
from regulatory_kb.models.regulator import ALL_REGULATORS, Country
from regulatory_kb.models.relationship import RelationshipType
from regulatory_kb.storage.graph_store import FalkorDBStore
from regulatory_kb.core import get_logger

logger = get_logger(__name__)


# ==================== GraphQL Schema Types ====================

GRAPHQL_SCHEMA = '''
type Query {
    document(id: ID!): Document
    documents(
        filter: DocumentFilter
        first: Int
        after: String
        orderBy: DocumentOrderBy
    ): DocumentConnection!
    
    regulator(id: ID!): Regulator
    regulators(country: Country): [Regulator!]!
    
    searchDocuments(
        query: String!
        filters: SearchFilters
        first: Int
    ): SearchResult!
    
    regulatoryPath(
        fromId: ID!
        toId: ID!
        maxDepth: Int
    ): [PathSegment!]!
    
    relatedDocuments(
        documentId: ID!
        relationshipTypes: [RelationshipType!]
        depth: Int
    ): [RelatedDocument!]!
}

type Document {
    id: ID!
    title: String!
    documentType: DocumentType!
    regulator: Regulator!
    sourceUrl: String
    categories: [DocumentCategory!]!
    effectiveDate: String
    version: String
    formNumber: String
    cfrSection: String
    
    # Relationships
    references: [Document!]!
    referencedBy: [Document!]!
    implements: [Requirement!]!
    sections: [Section!]!
    relatedDocuments(types: [RelationshipType!]): [RelatedDocument!]!
}

type Regulator {
    id: ID!
    name: String!
    abbreviation: String!
    country: Country!
    regulatorType: RegulatorType!
    website: String!
    documents(first: Int, category: DocumentCategory): [Document!]!
}

type Requirement {
    id: ID!
    description: String!
    regulatorId: String!
    deadlineFrequency: String
    deadlineDueDate: String
    effectiveDate: String
    implementingDocuments: [Document!]!
}

type Section {
    cfrSection: String!
    title: String!
    documentId: String!
    contentHash: String
}

type RelatedDocument {
    document: Document!
    relationshipType: RelationshipType!
    strength: Float
    properties: JSON
}

type PathSegment {
    fromDocument: Document!
    toDocument: Document!
    relationshipType: RelationshipType!
    depth: Int!
}

type DocumentConnection {
    edges: [DocumentEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
}

type DocumentEdge {
    node: Document!
    cursor: String!
}

type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
}

type SearchResult {
    documents: [Document!]!
    totalCount: Int!
    facets: SearchFacets
}

type SearchFacets {
    regulators: [FacetCount!]!
    categories: [FacetCount!]!
    documentTypes: [FacetCount!]!
}

type FacetCount {
    value: String!
    count: Int!
}

input DocumentFilter {
    regulatorId: ID
    category: DocumentCategory
    documentType: DocumentType
    formNumber: String
    cfrSection: String
    effectiveDateFrom: String
    effectiveDateTo: String
}

input SearchFilters {
    regulatorIds: [ID!]
    categories: [DocumentCategory!]
    documentTypes: [DocumentType!]
    country: Country
}

input DocumentOrderBy {
    field: DocumentOrderField!
    direction: OrderDirection!
}

enum DocumentOrderField {
    TITLE
    EFFECTIVE_DATE
    UPDATED_AT
    CREATED_AT
}

enum OrderDirection {
    ASC
    DESC
}

enum DocumentType {
    INSTRUCTION_MANUAL
    REGULATION
    GUIDANCE
    FORM
    NOTICE
    EXAMINATION_MANUAL
    GUIDELINE
}

enum DocumentCategory {
    CAPITAL_REQUIREMENTS
    LIQUIDITY_REPORTING
    AML_COMPLIANCE
    STRESS_TESTING
    RESOLUTION_PLANNING
    MODEL_RISK_MANAGEMENT
    DEPOSIT_INSURANCE
    CALL_REPORTS
}

enum Country {
    US
    CA
}

enum RegulatorType {
    PRUDENTIAL
    AML
    SECURITIES
    CONSUMER
}

enum RelationshipType {
    ISSUED_BY
    IMPLEMENTS
    REFERENCES
    DESCRIBED_IN
    PART_OF
    SUPERSEDES
    AMENDS
    RELATED_TO
}

scalar JSON
'''


@dataclass
class GraphQLContext:
    """Context for GraphQL resolvers."""
    
    graph_store: FalkorDBStore
    client_id: Optional[str] = None
    request_id: Optional[str] = None


@dataclass
class GraphQLResult:
    """Result from a GraphQL query."""
    
    data: Optional[dict[str, Any]] = None
    errors: list[dict[str, Any]] = field(default_factory=list)
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON response."""
        result = {}
        if self.data is not None:
            result["data"] = self.data
        if self.errors:
            result["errors"] = self.errors
        return result


class GraphQLService:
    """GraphQL service for complex regulatory relationship queries.
    
    Provides:
    - Document queries with relationship traversal
    - Regulator queries with document filtering
    - Path finding between documents
    - Complex filtering and aggregation
    - Cursor-based pagination
    """
    
    def __init__(self, graph_store: FalkorDBStore):
        """Initialize the GraphQL service.
        
        Args:
            graph_store: FalkorDB store for queries.
        """
        self.graph_store = graph_store
        self._resolvers: dict[str, Callable] = {}
        self._setup_resolvers()
    
    def _setup_resolvers(self) -> None:
        """Set up query resolvers."""
        self._resolvers = {
            "document": self._resolve_document,
            "documents": self._resolve_documents,
            "regulator": self._resolve_regulator,
            "regulators": self._resolve_regulators,
            "searchDocuments": self._resolve_search_documents,
            "regulatoryPath": self._resolve_regulatory_path,
            "relatedDocuments": self._resolve_related_documents,
        }
    
    def execute(
        self,
        query: str,
        variables: Optional[dict[str, Any]] = None,
        operation_name: Optional[str] = None,
        context: Optional[GraphQLContext] = None,
    ) -> GraphQLResult:
        """Execute a GraphQL query.
        
        Args:
            query: GraphQL query string.
            variables: Query variables.
            operation_name: Name of operation to execute.
            context: Execution context.
            
        Returns:
            GraphQLResult with data or errors.
        """
        variables = variables or {}
        context = context or GraphQLContext(graph_store=self.graph_store)
        
        try:
            # Parse the query to extract operation
            parsed = self._parse_query(query)
            
            if not parsed:
                return GraphQLResult(errors=[{
                    "message": "Failed to parse query",
                    "locations": [{"line": 1, "column": 1}],
                }])
            
            # Execute the query
            data = self._execute_operation(parsed, variables, context)
            
            return GraphQLResult(data=data)
        
        except Exception as e:
            logger.error("graphql_execution_error", error=str(e))
            return GraphQLResult(errors=[{
                "message": str(e),
                "extensions": {"code": "INTERNAL_ERROR"},
            }])
    
    def _parse_query(self, query: str) -> Optional[dict[str, Any]]:
        """Parse a GraphQL query string.
        
        This is a simplified parser for common query patterns.
        For production, use a proper GraphQL library like graphql-core.
        """
        query = query.strip()
        
        # Extract query type and fields
        if query.startswith("query"):
            # Remove 'query' keyword and optional name
            query = query[5:].strip()
            if query.startswith("{"):
                pass
            else:
                # Skip operation name and variables
                brace_idx = query.find("{")
                if brace_idx > 0:
                    query = query[brace_idx:]
        
        if not query.startswith("{"):
            query = "{" + query + "}"
        
        # Parse the query body
        return self._parse_selection_set(query)
    
    def _parse_selection_set(self, query: str) -> dict[str, Any]:
        """Parse a selection set from query string."""
        result = {"selections": []}
        
        # Remove outer braces
        query = query.strip()
        if query.startswith("{"):
            query = query[1:]
        if query.endswith("}"):
            query = query[:-1]
        
        # Split by top-level fields (simplified)
        current_field = ""
        brace_depth = 0
        paren_depth = 0
        
        for char in query:
            if char == "{":
                brace_depth += 1
                current_field += char
            elif char == "}":
                brace_depth -= 1
                current_field += char
            elif char == "(":
                paren_depth += 1
                current_field += char
            elif char == ")":
                paren_depth -= 1
                current_field += char
            elif char == "\n" and brace_depth == 0 and paren_depth == 0:
                if current_field.strip():
                    result["selections"].append(self._parse_field(current_field.strip()))
                current_field = ""
            else:
                current_field += char
        
        if current_field.strip():
            result["selections"].append(self._parse_field(current_field.strip()))
        
        return result
    
    def _parse_field(self, field_str: str) -> dict[str, Any]:
        """Parse a single field from query string."""
        field = {"name": "", "arguments": {}, "selections": None}
        
        # Extract field name
        paren_idx = field_str.find("(")
        brace_idx = field_str.find("{")
        
        if paren_idx > 0 and (brace_idx < 0 or paren_idx < brace_idx):
            field["name"] = field_str[:paren_idx].strip()
            # Parse arguments
            close_paren = field_str.find(")")
            if close_paren > paren_idx:
                args_str = field_str[paren_idx + 1:close_paren]
                field["arguments"] = self._parse_arguments(args_str)
            
            # Check for nested selection
            if brace_idx > 0:
                field["selections"] = self._parse_selection_set(field_str[brace_idx:])
        elif brace_idx > 0:
            field["name"] = field_str[:brace_idx].strip()
            field["selections"] = self._parse_selection_set(field_str[brace_idx:])
        else:
            field["name"] = field_str.strip()
        
        return field
    
    def _parse_arguments(self, args_str: str) -> dict[str, Any]:
        """Parse arguments from string."""
        args = {}
        
        # Simple key: value parsing
        parts = args_str.split(",")
        for part in parts:
            if ":" in part:
                key, value = part.split(":", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                
                # Handle special values
                if value.lower() == "true":
                    value = True
                elif value.lower() == "false":
                    value = False
                elif value.isdigit():
                    value = int(value)
                elif value.startswith("$"):
                    # Variable reference - will be resolved later
                    value = {"$var": value[1:]}
                
                args[key] = value
        
        return args
    
    def _execute_operation(
        self,
        parsed: dict[str, Any],
        variables: dict[str, Any],
        context: GraphQLContext,
    ) -> dict[str, Any]:
        """Execute a parsed operation."""
        result = {}
        
        for selection in parsed.get("selections", []):
            field_name = selection.get("name", "")
            arguments = selection.get("arguments", {})
            
            # Resolve variables in arguments
            resolved_args = self._resolve_variables(arguments, variables)
            
            # Get resolver
            resolver = self._resolvers.get(field_name)
            if resolver:
                result[field_name] = resolver(resolved_args, selection, context)
            else:
                result[field_name] = None
        
        return result
    
    def _resolve_variables(
        self,
        arguments: dict[str, Any],
        variables: dict[str, Any],
    ) -> dict[str, Any]:
        """Resolve variable references in arguments."""
        resolved = {}
        for key, value in arguments.items():
            if isinstance(value, dict) and "$var" in value:
                var_name = value["$var"]
                resolved[key] = variables.get(var_name)
            else:
                resolved[key] = value
        return resolved
    
    # ==================== Resolvers ====================
    
    def _resolve_document(
        self,
        args: dict[str, Any],
        selection: dict[str, Any],
        context: GraphQLContext,
    ) -> Optional[dict[str, Any]]:
        """Resolve a single document by ID."""
        doc_id = args.get("id")
        if not doc_id:
            return None
        
        doc_data = context.graph_store.get_document_by_id(doc_id)
        if not doc_data:
            return None
        
        return self._format_document(doc_data, selection, context)
    
    def _resolve_documents(
        self,
        args: dict[str, Any],
        selection: dict[str, Any],
        context: GraphQLContext,
    ) -> dict[str, Any]:
        """Resolve documents with filtering and pagination."""
        filter_args = args.get("filter", {})
        first = args.get("first", 20)
        after = args.get("after")
        order_by = args.get("orderBy", {})
        
        # Build query
        conditions = []
        params: dict[str, Any] = {"limit": first + 1}  # +1 to check hasNextPage
        
        if filter_args.get("regulatorId"):
            conditions.append("d.regulator_id = $regulator_id")
            params["regulator_id"] = filter_args["regulatorId"]
        
        if filter_args.get("category"):
            conditions.append("d.categories CONTAINS $category")
            params["category"] = filter_args["category"]
        
        if filter_args.get("documentType"):
            conditions.append("d.document_type = $document_type")
            params["document_type"] = filter_args["documentType"]
        
        where_clause = " AND ".join(conditions) if conditions else "true"
        
        # Order by
        order_field = order_by.get("field", "title")
        order_dir = order_by.get("direction", "ASC")
        
        query = f"""
        MATCH (d:Document)
        WHERE {where_clause}
        RETURN d
        ORDER BY d.{order_field.lower()} {order_dir}
        LIMIT $limit
        """
        
        result = context.graph_store.query(query, params)
        
        # Format results
        edges = []
        for i, node in enumerate(result.nodes[:first]):
            edges.append({
                "node": self._format_document(node, selection, context),
                "cursor": self._encode_cursor(node.get("id", str(i))),
            })
        
        has_next = len(result.nodes) > first
        
        return {
            "edges": edges,
            "pageInfo": {
                "hasNextPage": has_next,
                "hasPreviousPage": after is not None,
                "startCursor": edges[0]["cursor"] if edges else None,
                "endCursor": edges[-1]["cursor"] if edges else None,
            },
            "totalCount": len(edges),
        }
    
    def _resolve_regulator(
        self,
        args: dict[str, Any],
        selection: dict[str, Any],
        context: GraphQLContext,
    ) -> Optional[dict[str, Any]]:
        """Resolve a single regulator by ID."""
        reg_id = args.get("id")
        if not reg_id:
            return None
        
        for regulator in ALL_REGULATORS.values():
            if regulator.id == reg_id:
                return self._format_regulator(regulator, selection, context)
        
        return None
    
    def _resolve_regulators(
        self,
        args: dict[str, Any],
        selection: dict[str, Any],
        context: GraphQLContext,
    ) -> list[dict[str, Any]]:
        """Resolve all regulators with optional country filter."""
        country = args.get("country")
        
        regulators = []
        for regulator in ALL_REGULATORS.values():
            if country and regulator.country.value != country:
                continue
            regulators.append(self._format_regulator(regulator, selection, context))
        
        return regulators
    
    def _resolve_search_documents(
        self,
        args: dict[str, Any],
        selection: dict[str, Any],
        context: GraphQLContext,
    ) -> dict[str, Any]:
        """Resolve document search with facets."""
        query_text = args.get("query", "")
        filters = args.get("filters", {})
        first = args.get("first", 20)
        
        # Search documents
        conditions = ["d.title CONTAINS $query"]
        params: dict[str, Any] = {"query": query_text, "limit": first}
        
        if filters.get("regulatorIds"):
            conditions.append("d.regulator_id IN $regulator_ids")
            params["regulator_ids"] = filters["regulatorIds"]
        
        if filters.get("categories"):
            # Match any category
            cat_conditions = [f"d.categories CONTAINS '{cat}'" for cat in filters["categories"]]
            conditions.append(f"({' OR '.join(cat_conditions)})")
        
        where_clause = " AND ".join(conditions)
        
        query = f"""
        MATCH (d:Document)
        WHERE {where_clause}
        RETURN d
        LIMIT $limit
        """
        
        result = context.graph_store.query(query, params)
        
        # Format documents
        documents = [
            self._format_document(node, selection, context)
            for node in result.nodes
        ]
        
        # Calculate facets
        facets = self._calculate_facets(result.nodes)
        
        return {
            "documents": documents,
            "totalCount": len(documents),
            "facets": facets,
        }
    
    def _resolve_regulatory_path(
        self,
        args: dict[str, Any],
        selection: dict[str, Any],
        context: GraphQLContext,
    ) -> list[dict[str, Any]]:
        """Find path between two documents."""
        from_id = args.get("fromId")
        to_id = args.get("toId")
        max_depth = args.get("maxDepth", 5)
        
        if not from_id or not to_id:
            return []
        
        # Use shortest path query
        query = """
        MATCH path = shortestPath(
            (start:Document {id: $from_id})-[*1..%d]-(end:Document {id: $to_id})
        )
        RETURN path
        """ % max_depth
        
        result = context.graph_store.query(query, {"from_id": from_id, "to_id": to_id})
        
        # Extract path segments
        segments = []
        if result.raw_result and result.raw_result.result_set:
            for row in result.raw_result.result_set:
                if row and hasattr(row[0], "nodes"):
                    path = row[0]
                    nodes = list(path.nodes())
                    rels = list(path.relationships()) if hasattr(path, "relationships") else []
                    
                    for i, rel in enumerate(rels):
                        if i + 1 < len(nodes):
                            segments.append({
                                "fromDocument": self._format_document(
                                    dict(nodes[i].properties), selection, context
                                ),
                                "toDocument": self._format_document(
                                    dict(nodes[i + 1].properties), selection, context
                                ),
                                "relationshipType": rel.relation if hasattr(rel, "relation") else "RELATED_TO",
                                "depth": i + 1,
                            })
        
        return segments
    
    def _resolve_related_documents(
        self,
        args: dict[str, Any],
        selection: dict[str, Any],
        context: GraphQLContext,
    ) -> list[dict[str, Any]]:
        """Get documents related to a given document."""
        doc_id = args.get("documentId")
        rel_types = args.get("relationshipTypes", [])
        depth = args.get("depth", 1)
        
        if not doc_id:
            return []
        
        # Build relationship pattern
        if rel_types:
            rel_pattern = "|".join(rel_types)
            rel_clause = f"[r:{rel_pattern}*1..{depth}]"
        else:
            rel_clause = f"[r*1..{depth}]"
        
        query = f"""
        MATCH (d:Document {{id: $doc_id}})-{rel_clause}->(related:Document)
        RETURN DISTINCT related, type(r) as rel_type
        """
        
        result = context.graph_store.query(query, {"doc_id": doc_id})
        
        related = []
        for node in result.nodes:
            related.append({
                "document": self._format_document(node, selection, context),
                "relationshipType": "RELATED_TO",  # Simplified
                "strength": 1.0,
                "properties": {},
            })
        
        return related
    
    # ==================== Formatters ====================
    
    def _format_document(
        self,
        node: dict[str, Any],
        selection: dict[str, Any],
        context: GraphQLContext,
    ) -> dict[str, Any]:
        """Format a document node for GraphQL response."""
        categories = node.get("categories", "").split(",") if node.get("categories") else []
        
        doc = {
            "id": node.get("id", ""),
            "title": node.get("title", ""),
            "documentType": node.get("document_type", ""),
            "sourceUrl": node.get("source_url"),
            "categories": [c.strip() for c in categories if c.strip()],
            "effectiveDate": node.get("effective_date"),
            "version": node.get("version"),
            "formNumber": node.get("form_number"),
            "cfrSection": node.get("cfr_section"),
        }
        
        # Resolve regulator if requested
        regulator_id = node.get("regulator_id")
        if regulator_id:
            for regulator in ALL_REGULATORS.values():
                if regulator.id == regulator_id:
                    doc["regulator"] = self._format_regulator(regulator, {}, context)
                    break
        
        return doc
    
    def _format_regulator(
        self,
        regulator: Any,
        selection: dict[str, Any],
        context: GraphQLContext,
    ) -> dict[str, Any]:
        """Format a regulator for GraphQL response."""
        return {
            "id": regulator.id,
            "name": regulator.name,
            "abbreviation": regulator.abbreviation,
            "country": regulator.country.value,
            "regulatorType": regulator.regulator_type.value,
            "website": regulator.website,
        }
    
    def _calculate_facets(self, nodes: list[dict[str, Any]]) -> dict[str, Any]:
        """Calculate search facets from results."""
        regulator_counts: dict[str, int] = {}
        category_counts: dict[str, int] = {}
        type_counts: dict[str, int] = {}
        
        for node in nodes:
            # Count regulators
            reg_id = node.get("regulator_id", "")
            regulator_counts[reg_id] = regulator_counts.get(reg_id, 0) + 1
            
            # Count categories
            categories = node.get("categories", "").split(",")
            for cat in categories:
                cat = cat.strip()
                if cat:
                    category_counts[cat] = category_counts.get(cat, 0) + 1
            
            # Count document types
            doc_type = node.get("document_type", "")
            type_counts[doc_type] = type_counts.get(doc_type, 0) + 1
        
        return {
            "regulators": [
                {"value": k, "count": v}
                for k, v in sorted(regulator_counts.items(), key=lambda x: -x[1])
            ],
            "categories": [
                {"value": k, "count": v}
                for k, v in sorted(category_counts.items(), key=lambda x: -x[1])
            ],
            "documentTypes": [
                {"value": k, "count": v}
                for k, v in sorted(type_counts.items(), key=lambda x: -x[1])
            ],
        }
    
    def _encode_cursor(self, value: str) -> str:
        """Encode a cursor value."""
        import base64
        return base64.b64encode(value.encode()).decode()
    
    def _decode_cursor(self, cursor: str) -> str:
        """Decode a cursor value."""
        import base64
        return base64.b64decode(cursor.encode()).decode()

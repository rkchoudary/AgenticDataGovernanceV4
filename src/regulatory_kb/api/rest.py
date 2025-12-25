"""REST API service for document search and retrieval.

Implements Requirements 13.1-13.4:
- REST API endpoints for searching by regulator
- Endpoints for searching by regulatory category
- Endpoints for searching by form type
- Structured responses with document content, metadata, and relationships
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from regulatory_kb.models.document import DocumentCategory, DocumentType
from regulatory_kb.models.regulator import ALL_REGULATORS, Country
from regulatory_kb.storage.graph_store import FalkorDBStore


class SortOrder(str, Enum):
    """Sort order for search results."""
    ASC = "asc"
    DESC = "desc"


class SortField(str, Enum):
    """Fields available for sorting."""
    TITLE = "title"
    DATE = "effective_date"
    UPDATED = "updated_at"
    RELEVANCE = "relevance"


@dataclass
class SearchFilters:
    """Filters for document search."""
    
    query: Optional[str] = None
    regulator_id: Optional[str] = None
    regulator_abbreviation: Optional[str] = None
    country: Optional[Country] = None
    category: Optional[DocumentCategory] = None
    document_type: Optional[DocumentType] = None
    form_number: Optional[str] = None
    cfr_section: Optional[str] = None
    effective_date_from: Optional[datetime] = None
    effective_date_to: Optional[datetime] = None
    sort_by: SortField = SortField.RELEVANCE
    sort_order: SortOrder = SortOrder.DESC
    page: int = 1
    page_size: int = 20
    
    def to_dict(self) -> dict[str, Any]:
        """Convert filters to dictionary for logging."""
        return {
            "query": self.query,
            "regulator_id": self.regulator_id,
            "regulator_abbreviation": self.regulator_abbreviation,
            "country": self.country.value if self.country else None,
            "category": self.category.value if self.category else None,
            "document_type": self.document_type.value if self.document_type else None,
            "form_number": self.form_number,
            "cfr_section": self.cfr_section,
            "page": self.page,
            "page_size": self.page_size,
        }


@dataclass
class DocumentResult:
    """A single document in search results."""
    
    id: str
    title: str
    document_type: str
    regulator_id: str
    regulator_name: Optional[str] = None
    source_url: Optional[str] = None
    categories: list[str] = field(default_factory=list)
    effective_date: Optional[str] = None
    version: Optional[str] = None
    form_number: Optional[str] = None
    cfr_section: Optional[str] = None
    excerpt: Optional[str] = None
    relevance_score: float = 1.0
    relationships: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class SearchResult:
    """Result from a document search."""
    
    documents: list[DocumentResult] = field(default_factory=list)
    total_count: int = 0
    page: int = 1
    page_size: int = 20
    has_more: bool = False
    filters_applied: dict[str, Any] = field(default_factory=dict)


@dataclass
class PaginatedResponse:
    """Paginated API response wrapper."""
    
    data: list[dict[str, Any]]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_previous: bool
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON response."""
        return {
            "data": self.data,
            "pagination": {
                "total": self.total,
                "page": self.page,
                "page_size": self.page_size,
                "total_pages": self.total_pages,
                "has_next": self.has_next,
                "has_previous": self.has_previous,
            }
        }


class DocumentSearchService:
    """Service for searching and retrieving regulatory documents.
    
    Implements REST API functionality for:
    - Searching by regulator (Fed, OCC, FDIC, FinCEN, OSFI, FINTRAC)
    - Searching by regulatory category (capital, liquidity, AML, stress-testing, resolution)
    - Searching by form type (FR Y-14, Call Reports, BCAR, LCTR, etc.)
    - Returning structured responses with document content, metadata, and relationships
    """
    
    def __init__(self, graph_store: FalkorDBStore):
        """Initialize the search service.
        
        Args:
            graph_store: FalkorDB store for document queries.
        """
        self.graph_store = graph_store
    
    def search(self, filters: SearchFilters) -> SearchResult:
        """Search documents with filters.
        
        Args:
            filters: Search filters to apply.
            
        Returns:
            SearchResult with matching documents.
        """
        # Resolve regulator ID from abbreviation if provided
        regulator_id = filters.regulator_id
        if filters.regulator_abbreviation and not regulator_id:
            regulator_id = self._resolve_regulator_id(filters.regulator_abbreviation)
        
        # Build and execute query
        documents = self._execute_search(filters, regulator_id)
        
        # Calculate pagination
        total_count = len(documents)
        start_idx = (filters.page - 1) * filters.page_size
        end_idx = start_idx + filters.page_size
        paginated_docs = documents[start_idx:end_idx]
        
        return SearchResult(
            documents=paginated_docs,
            total_count=total_count,
            page=filters.page,
            page_size=filters.page_size,
            has_more=end_idx < total_count,
            filters_applied=filters.to_dict(),
        )
    
    def get_document_by_id(self, document_id: str) -> Optional[DocumentResult]:
        """Get a single document by ID.
        
        Args:
            document_id: Document ID to retrieve.
            
        Returns:
            DocumentResult or None if not found.
        """
        doc_data = self.graph_store.get_document_by_id(document_id)
        if not doc_data:
            return None
        
        # Get relationships
        relationships = self._get_document_relationships(document_id)
        
        return self._to_document_result(doc_data, relationships)
    
    def get_documents_by_regulator(
        self,
        regulator: str,
        page: int = 1,
        page_size: int = 20,
    ) -> SearchResult:
        """Get documents by regulator.
        
        Args:
            regulator: Regulator ID or abbreviation.
            page: Page number.
            page_size: Results per page.
            
        Returns:
            SearchResult with documents from the regulator.
        """
        filters = SearchFilters(
            regulator_abbreviation=regulator.upper(),
            page=page,
            page_size=page_size,
        )
        return self.search(filters)
    
    def get_documents_by_category(
        self,
        category: DocumentCategory,
        page: int = 1,
        page_size: int = 20,
    ) -> SearchResult:
        """Get documents by regulatory category.
        
        Args:
            category: Document category.
            page: Page number.
            page_size: Results per page.
            
        Returns:
            SearchResult with documents in the category.
        """
        filters = SearchFilters(
            category=category,
            page=page,
            page_size=page_size,
        )
        return self.search(filters)
    
    def get_documents_by_form_type(
        self,
        form_number: str,
        page: int = 1,
        page_size: int = 20,
    ) -> SearchResult:
        """Get documents by form type.
        
        Args:
            form_number: Form number (e.g., FR Y-14A, BCAR).
            page: Page number.
            page_size: Results per page.
            
        Returns:
            SearchResult with documents for the form.
        """
        filters = SearchFilters(
            form_number=form_number,
            page=page,
            page_size=page_size,
        )
        return self.search(filters)
    
    def get_document_relationships(
        self,
        document_id: str,
    ) -> list[dict[str, Any]]:
        """Get relationships for a document.
        
        Args:
            document_id: Document ID.
            
        Returns:
            List of relationship data.
        """
        return self._get_document_relationships(document_id)
    
    def _resolve_regulator_id(self, abbreviation: str) -> Optional[str]:
        """Resolve regulator ID from abbreviation."""
        abbrev_lower = abbreviation.lower()
        for key, regulator in ALL_REGULATORS.items():
            if regulator.abbreviation.lower() == abbrev_lower or key == abbrev_lower:
                return regulator.id
        return None
    
    def _execute_search(
        self,
        filters: SearchFilters,
        regulator_id: Optional[str],
    ) -> list[DocumentResult]:
        """Execute search query against graph store."""
        conditions = []
        params: dict[str, Any] = {"limit": 1000}  # Get all for filtering
        
        # Build WHERE conditions
        if filters.query:
            conditions.append("d.title CONTAINS $query")
            params["query"] = filters.query
        
        if regulator_id:
            conditions.append("d.regulator_id = $regulator_id")
            params["regulator_id"] = regulator_id
        
        if filters.category:
            conditions.append("d.categories CONTAINS $category")
            params["category"] = filters.category.value
        
        if filters.document_type:
            conditions.append("d.document_type = $document_type")
            params["document_type"] = filters.document_type.value
        
        # Build query
        where_clause = " AND ".join(conditions) if conditions else "true"
        
        # Add sorting
        sort_field = self._get_sort_field(filters.sort_by)
        sort_dir = "DESC" if filters.sort_order == SortOrder.DESC else "ASC"
        
        query = f"""
        MATCH (d:Document)
        WHERE {where_clause}
        RETURN d
        ORDER BY d.{sort_field} {sort_dir}
        LIMIT $limit
        """
        
        result = self.graph_store.query(query, params)
        
        # Convert to DocumentResult objects
        documents = []
        for node in result.nodes:
            doc_result = self._to_document_result(node)
            
            # Apply additional filters that can't be done in Cypher
            if self._matches_additional_filters(doc_result, filters):
                documents.append(doc_result)
        
        return documents
    
    def _get_sort_field(self, sort_by: SortField) -> str:
        """Map sort field enum to graph property."""
        mapping = {
            SortField.TITLE: "title",
            SortField.DATE: "effective_date",
            SortField.UPDATED: "updated_at",
            SortField.RELEVANCE: "title",  # Default to title for relevance
        }
        return mapping.get(sort_by, "title")
    
    def _matches_additional_filters(
        self,
        doc: DocumentResult,
        filters: SearchFilters,
    ) -> bool:
        """Check if document matches filters not handled by Cypher."""
        if filters.form_number:
            if not doc.form_number or filters.form_number.lower() not in doc.form_number.lower():
                return False
        
        if filters.cfr_section:
            if not doc.cfr_section or filters.cfr_section not in doc.cfr_section:
                return False
        
        if filters.country:
            # Check regulator country
            regulator = self._get_regulator_by_id(doc.regulator_id)
            if regulator and regulator.country != filters.country:
                return False
        
        return True
    
    def _get_regulator_by_id(self, regulator_id: str) -> Optional[Any]:
        """Get regulator by ID."""
        for regulator in ALL_REGULATORS.values():
            if regulator.id == regulator_id:
                return regulator
        return None
    
    def _to_document_result(
        self,
        node: dict[str, Any],
        relationships: Optional[list[dict[str, Any]]] = None,
    ) -> DocumentResult:
        """Convert graph node to DocumentResult."""
        regulator = self._get_regulator_by_id(node.get("regulator_id", ""))
        categories = node.get("categories", "").split(",") if node.get("categories") else []
        
        return DocumentResult(
            id=node.get("id", ""),
            title=node.get("title", ""),
            document_type=node.get("document_type", ""),
            regulator_id=node.get("regulator_id", ""),
            regulator_name=regulator.name if regulator else None,
            source_url=node.get("source_url"),
            categories=[c.strip() for c in categories if c.strip()],
            effective_date=node.get("effective_date"),
            version=node.get("version"),
            form_number=node.get("form_number"),
            cfr_section=node.get("cfr_section"),
            relationships=relationships or [],
        )
    
    def _get_document_relationships(self, document_id: str) -> list[dict[str, Any]]:
        """Get all relationships for a document."""
        query = """
        MATCH (d:Document {id: $id})-[r]->(target)
        RETURN type(r) as rel_type, target, r
        """
        
        result = self.graph_store.query(query, {"id": document_id})
        
        relationships = []
        if result.raw_result and result.raw_result.result_set:
            for row in result.raw_result.result_set:
                if len(row) >= 2:
                    rel_type = row[0] if isinstance(row[0], str) else str(row[0])
                    target = row[1]
                    target_props = dict(target.properties) if hasattr(target, "properties") else {}
                    
                    relationships.append({
                        "type": rel_type,
                        "target_id": target_props.get("id", ""),
                        "target_title": target_props.get("title", target_props.get("name", "")),
                        "properties": target_props,
                    })
        
        return relationships

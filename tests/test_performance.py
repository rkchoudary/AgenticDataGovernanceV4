"""Performance and load testing for the Regulatory Knowledge Base system.

Implements Task 10.3: Implement performance and load testing
- Test document processing throughput under load
- Validate graph query performance with large datasets
- Test concurrent user handling for API endpoints
- Measure memory usage during large document processing
- Requirements: Performance requirements
"""

import asyncio
import gc
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any, Callable, Optional
from unittest.mock import MagicMock, patch

import pytest

from regulatory_kb.processing.parser import DocumentParser, DocumentFormat
from regulatory_kb.processing.metadata import MetadataExtractor
from regulatory_kb.processing.validation import ContentValidator
from regulatory_kb.storage.graph_store import FalkorDBStore, GraphStoreConfig
from regulatory_kb.api.rest import DocumentSearchService, SearchFilters
from regulatory_kb.api.auth import AuthService, AuthConfig, Permission
from regulatory_kb.api.webhooks import WebhookService, WebhookEventType
from regulatory_kb.agent.query_processor import QueryProcessor


@dataclass
class PerformanceMetrics:
    """Metrics collected during performance tests."""
    
    operation_name: str
    total_operations: int
    total_time_seconds: float
    min_time_ms: float
    max_time_ms: float
    avg_time_ms: float
    operations_per_second: float
    memory_before_mb: float
    memory_after_mb: float
    memory_delta_mb: float
    
    def __str__(self) -> str:
        return (
            f"{self.operation_name}:\n"
            f"  Total operations: {self.total_operations}\n"
            f"  Total time: {self.total_time_seconds:.2f}s\n"
            f"  Min/Avg/Max: {self.min_time_ms:.2f}/{self.avg_time_ms:.2f}/{self.max_time_ms:.2f} ms\n"
            f"  Throughput: {self.operations_per_second:.2f} ops/sec\n"
            f"  Memory delta: {self.memory_delta_mb:.2f} MB"
        )


def get_memory_usage_mb() -> float:
    """Get current memory usage in MB."""
    gc.collect()
    return sys.getsizeof(gc.get_objects()) / (1024 * 1024)


def measure_performance(
    operation: Callable[[], Any],
    operation_name: str,
    iterations: int = 100,
) -> PerformanceMetrics:
    """Measure performance of an operation.
    
    Args:
        operation: Function to measure
        operation_name: Name for reporting
        iterations: Number of iterations to run
        
    Returns:
        PerformanceMetrics with collected data
    """
    gc.collect()
    memory_before = get_memory_usage_mb()
    
    times = []
    start_total = time.perf_counter()
    
    for _ in range(iterations):
        start = time.perf_counter()
        operation()
        end = time.perf_counter()
        times.append((end - start) * 1000)  # Convert to ms
    
    end_total = time.perf_counter()
    total_time = end_total - start_total
    
    gc.collect()
    memory_after = get_memory_usage_mb()
    
    return PerformanceMetrics(
        operation_name=operation_name,
        total_operations=iterations,
        total_time_seconds=total_time,
        min_time_ms=min(times),
        max_time_ms=max(times),
        avg_time_ms=sum(times) / len(times),
        operations_per_second=iterations / total_time,
        memory_before_mb=memory_before,
        memory_after_mb=memory_after,
        memory_delta_mb=memory_after - memory_before,
    )


class TestDocumentProcessingThroughput:
    """Performance tests for document processing throughput."""

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
    def sample_html_document(self):
        """Generate a sample HTML document for testing."""
        return """
        <html>
        <head><title>Test Regulatory Document</title></head>
        <body>
            <main>
                <h1>Regulatory Guidance Document</h1>
                <p>OMB Control Number: 7100-0341</p>
                <p>Effective Date: January 1, 2024</p>
                <h2>Section 1: General Requirements</h2>
                <p>This regulation establishes compliance requirements for all
                covered institutions. The filing deadline is quarterly. All
                reporting entities must submit required documentation within
                the specified threshold period.</p>
                <h2>Section 2: Specific Requirements</h2>
                <p>The following requirements apply to capital adequacy reporting.
                Institutions must maintain adequate liquidity reserves as specified
                in 12 CFR Part 249. Compliance with these regulations is mandatory.</p>
                <h2>Section 3: Reporting Schedules</h2>
                <p>Reports must be filed according to the following schedule:</p>
                <ul>
                    <li>Quarterly reports due within 30 days</li>
                    <li>Annual reports due by April 5</li>
                    <li>Ad-hoc reports as required</li>
                </ul>
            </main>
        </body>
        </html>
        """

    @pytest.fixture
    def sample_cfr_document(self):
        """Generate a sample CFR document for testing."""
        return """
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
        (b) Level 2 liquid assets include certain corporate debt securities
        and covered bonds meeting specific criteria.
        """

    def test_html_parsing_throughput(self, parser, sample_html_document):
        """Test HTML document parsing throughput."""
        def parse_operation():
            parser.parse(sample_html_document, DocumentFormat.HTML)
        
        metrics = measure_performance(
            parse_operation,
            "HTML Parsing",
            iterations=100,
        )
        
        # Assert reasonable performance (at least 10 docs/sec)
        assert metrics.operations_per_second >= 10, f"HTML parsing too slow: {metrics}"
        # Assert reasonable memory usage (less than 50MB delta)
        assert metrics.memory_delta_mb < 50, f"HTML parsing uses too much memory: {metrics}"

    def test_cfr_parsing_throughput(self, parser, sample_cfr_document):
        """Test CFR document parsing throughput."""
        def parse_operation():
            parser.parse(sample_cfr_document, DocumentFormat.CFR)
        
        metrics = measure_performance(
            parse_operation,
            "CFR Parsing",
            iterations=100,
        )
        
        # Assert reasonable performance
        assert metrics.operations_per_second >= 10, f"CFR parsing too slow: {metrics}"
        assert metrics.memory_delta_mb < 50, f"CFR parsing uses too much memory: {metrics}"

    def test_metadata_extraction_throughput(self, metadata_extractor, sample_html_document, parser):
        """Test metadata extraction throughput."""
        parsed = parser.parse(sample_html_document, DocumentFormat.HTML)
        
        def extract_operation():
            metadata_extractor.extract(parsed.text, "us_frb")
        
        metrics = measure_performance(
            extract_operation,
            "Metadata Extraction",
            iterations=100,
        )
        
        # Assert reasonable performance
        assert metrics.operations_per_second >= 5, f"Metadata extraction too slow: {metrics}"

    def test_validation_throughput(self, validator, parser, sample_html_document):
        """Test content validation throughput."""
        parsed = parser.parse(sample_html_document, DocumentFormat.HTML)
        
        def validate_operation():
            validator.validate(parsed)
        
        metrics = measure_performance(
            validate_operation,
            "Content Validation",
            iterations=100,
        )
        
        # Assert reasonable performance
        assert metrics.operations_per_second >= 50, f"Validation too slow: {metrics}"

    def test_full_pipeline_throughput(self, parser, metadata_extractor, validator, sample_html_document):
        """Test full document processing pipeline throughput."""
        def pipeline_operation():
            parsed = parser.parse(sample_html_document, DocumentFormat.HTML)
            metadata_extractor.extract(parsed.text, "us_frb")
            validator.validate(parsed)
        
        metrics = measure_performance(
            pipeline_operation,
            "Full Pipeline",
            iterations=50,
        )
        
        # Assert reasonable performance for full pipeline
        assert metrics.operations_per_second >= 3, f"Full pipeline too slow: {metrics}"


class TestGraphQueryPerformance:
    """Performance tests for graph query operations."""

    @pytest.fixture
    def mock_graph_store(self):
        """Create a mocked graph store for performance testing."""
        with patch("regulatory_kb.storage.graph_store.FalkorDB") as mock_falkordb:
            mock_client = MagicMock()
            mock_graph = MagicMock()
            mock_falkordb.return_value = mock_client
            mock_client.select_graph.return_value = mock_graph
            
            # Configure mock to return realistic data
            mock_node = MagicMock()
            mock_node.properties = {
                "id": "doc_1",
                "title": "Test Document",
                "document_type": "regulation",
                "regulator_id": "us_frb",
                "categories": "capital_requirements",
            }
            mock_result = MagicMock()
            mock_result.result_set = [[mock_node]]
            mock_result.nodes = [mock_node.properties]
            mock_graph.query.return_value = mock_result
            
            store = FalkorDBStore()
            store.connect()
            yield store, mock_graph

    def test_document_search_performance(self, mock_graph_store):
        """Test document search query performance."""
        store, mock_graph = mock_graph_store
        search_service = DocumentSearchService(store)
        
        def search_operation():
            filters = SearchFilters(query="capital requirements")
            search_service.search(filters)
        
        metrics = measure_performance(
            search_operation,
            "Document Search",
            iterations=100,
        )
        
        # Assert reasonable search performance
        assert metrics.operations_per_second >= 50, f"Search too slow: {metrics}"

    def test_filtered_search_performance(self, mock_graph_store):
        """Test filtered document search performance."""
        store, mock_graph = mock_graph_store
        search_service = DocumentSearchService(store)
        
        def filtered_search_operation():
            filters = SearchFilters(
                query="liquidity",
                regulator_abbreviation="FRB",
            )
            search_service.search(filters)
        
        metrics = measure_performance(
            filtered_search_operation,
            "Filtered Search",
            iterations=100,
        )
        
        # Assert reasonable filtered search performance
        assert metrics.operations_per_second >= 50, f"Filtered search too slow: {metrics}"

    def test_document_retrieval_by_id_performance(self, mock_graph_store):
        """Test document retrieval by ID performance."""
        store, mock_graph = mock_graph_store
        search_service = DocumentSearchService(store)
        
        def retrieval_operation():
            search_service.get_document_by_id("doc_1")
        
        metrics = measure_performance(
            retrieval_operation,
            "Document Retrieval by ID",
            iterations=100,
        )
        
        # Assert fast retrieval by ID
        assert metrics.operations_per_second >= 100, f"Retrieval too slow: {metrics}"


class TestConcurrentUserHandling:
    """Performance tests for concurrent user handling."""

    @pytest.fixture
    def auth_service(self):
        """Create auth service."""
        return AuthService(AuthConfig(secret_key="test-secret"))

    @pytest.fixture
    def query_processor(self):
        """Create query processor."""
        return QueryProcessor()

    def test_concurrent_authentication(self, auth_service):
        """Test concurrent authentication requests."""
        # Generate API keys
        keys = []
        for i in range(10):
            raw_key, _ = auth_service.generate_api_key(
                name=f"Test Key {i}",
                permissions=[Permission.SEARCH_DOCUMENTS],
            )
            keys.append(raw_key)
        
        results = []
        errors = []
        
        def authenticate(key):
            try:
                headers = {"Authorization": f"Bearer {key}"}
                result = auth_service.authenticate_request(headers)
                return result.success
            except Exception as e:
                errors.append(str(e))
                return False
        
        start_time = time.perf_counter()
        
        # Run concurrent authentications
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = []
            for _ in range(100):
                key = keys[_ % len(keys)]
                futures.append(executor.submit(authenticate, key))
            
            for future in as_completed(futures):
                results.append(future.result())
        
        end_time = time.perf_counter()
        total_time = end_time - start_time
        
        # Assert all authentications succeeded
        success_count = sum(1 for r in results if r)
        assert success_count == 100, f"Some authentications failed: {100 - success_count}"
        
        # Assert reasonable throughput (at least 50 auth/sec)
        throughput = 100 / total_time
        assert throughput >= 50, f"Authentication throughput too low: {throughput:.2f} ops/sec"

    def test_concurrent_query_processing(self, query_processor):
        """Test concurrent query processing."""
        queries = [
            "What are CCAR requirements?",
            "What is the LCR reporting frequency?",
            "What are CTR filing deadlines?",
            "Compare US and Canadian AML requirements",
            "What is Basel III capital?",
        ]
        
        results = []
        errors = []
        
        def process_query(query):
            try:
                result = query_processor.process_query(query)
                return result is not None
            except Exception as e:
                errors.append(str(e))
                return False
        
        start_time = time.perf_counter()
        
        # Run concurrent queries
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = []
            for i in range(50):
                query = queries[i % len(queries)]
                futures.append(executor.submit(process_query, query))
            
            for future in as_completed(futures):
                results.append(future.result())
        
        end_time = time.perf_counter()
        total_time = end_time - start_time
        
        # Assert all queries succeeded
        success_count = sum(1 for r in results if r)
        assert success_count == 50, f"Some queries failed: {50 - success_count}"
        
        # Assert reasonable throughput
        throughput = 50 / total_time
        assert throughput >= 10, f"Query throughput too low: {throughput:.2f} ops/sec"

    def test_concurrent_webhook_dispatch(self):
        """Test concurrent webhook event dispatch."""
        webhook_service = WebhookService()
        
        # Create subscriptions
        for i in range(5):
            webhook_service.create_subscription(
                url=f"https://example{i}.com/webhook",
                events=[WebhookEventType.DOCUMENT_UPDATED],
            )
        
        results = []
        
        def dispatch_event(doc_id):
            try:
                deliveries = webhook_service.dispatch_event(
                    WebhookEventType.DOCUMENT_UPDATED,
                    {"document_id": doc_id, "categories": []},
                )
                return len(deliveries) > 0
            except Exception:
                return False
        
        start_time = time.perf_counter()
        
        # Run concurrent dispatches
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = []
            for i in range(100):
                futures.append(executor.submit(dispatch_event, f"doc_{i}"))
            
            for future in as_completed(futures):
                results.append(future.result())
        
        end_time = time.perf_counter()
        total_time = end_time - start_time
        
        # Assert all dispatches succeeded
        success_count = sum(1 for r in results if r)
        assert success_count == 100, f"Some dispatches failed: {100 - success_count}"
        
        # Assert reasonable throughput
        throughput = 100 / total_time
        assert throughput >= 100, f"Dispatch throughput too low: {throughput:.2f} ops/sec"


class TestMemoryUsage:
    """Tests for memory usage during large document processing."""

    @pytest.fixture
    def parser(self):
        """Create document parser."""
        return DocumentParser()

    def generate_large_html_document(self, size_kb: int) -> str:
        """Generate a large HTML document of approximately the specified size."""
        base_content = """
        <h2>Section {section_num}: Regulatory Requirements</h2>
        <p>This section establishes compliance requirements for covered institutions.
        The filing deadline is quarterly. All reporting entities must submit required
        documentation within the specified threshold period. Regulations require
        adherence to capital adequacy standards as defined in 12 CFR Part 249.</p>
        """
        
        sections = []
        current_size = 0
        section_num = 1
        
        while current_size < size_kb * 1024:
            section = base_content.format(section_num=section_num)
            sections.append(section)
            current_size += len(section)
            section_num += 1
        
        return f"""
        <html>
        <head><title>Large Regulatory Document</title></head>
        <body>
            <main>
                <h1>Comprehensive Regulatory Guidance</h1>
                {"".join(sections)}
            </main>
        </body>
        </html>
        """

    def test_memory_usage_small_document(self, parser):
        """Test memory usage for small documents (10KB)."""
        doc = self.generate_large_html_document(10)
        
        gc.collect()
        memory_before = get_memory_usage_mb()
        
        for _ in range(10):
            parser.parse(doc, DocumentFormat.HTML)
        
        gc.collect()
        memory_after = get_memory_usage_mb()
        
        memory_delta = memory_after - memory_before
        
        # Assert reasonable memory usage for small docs
        assert memory_delta < 10, f"Memory usage too high for small docs: {memory_delta:.2f} MB"

    def test_memory_usage_medium_document(self, parser):
        """Test memory usage for medium documents (100KB)."""
        doc = self.generate_large_html_document(100)
        
        gc.collect()
        memory_before = get_memory_usage_mb()
        
        for _ in range(5):
            parser.parse(doc, DocumentFormat.HTML)
        
        gc.collect()
        memory_after = get_memory_usage_mb()
        
        memory_delta = memory_after - memory_before
        
        # Assert reasonable memory usage for medium docs
        assert memory_delta < 50, f"Memory usage too high for medium docs: {memory_delta:.2f} MB"

    def test_memory_usage_large_document(self, parser):
        """Test memory usage for large documents (500KB)."""
        doc = self.generate_large_html_document(500)
        
        gc.collect()
        memory_before = get_memory_usage_mb()
        
        parsed = parser.parse(doc, DocumentFormat.HTML)
        
        gc.collect()
        memory_after = get_memory_usage_mb()
        
        memory_delta = memory_after - memory_before
        
        # Assert reasonable memory usage for large docs
        assert memory_delta < 100, f"Memory usage too high for large docs: {memory_delta:.2f} MB"
        
        # Verify parsing succeeded
        assert parsed.text is not None
        assert len(parsed.text) > 0

    def test_memory_cleanup_after_processing(self, parser):
        """Test that memory is properly cleaned up after processing."""
        doc = self.generate_large_html_document(200)
        
        gc.collect()
        baseline_memory = get_memory_usage_mb()
        
        # Process multiple documents
        for _ in range(10):
            parsed = parser.parse(doc, DocumentFormat.HTML)
            del parsed
        
        gc.collect()
        final_memory = get_memory_usage_mb()
        
        memory_delta = final_memory - baseline_memory
        
        # Assert memory is cleaned up (delta should be small)
        assert memory_delta < 20, f"Memory not properly cleaned up: {memory_delta:.2f} MB retained"


class TestAPIEndpointPerformance:
    """Performance tests for API endpoint response times."""

    @pytest.fixture
    def mock_search_service(self):
        """Create mocked search service."""
        with patch("regulatory_kb.storage.graph_store.FalkorDB") as mock_falkordb:
            mock_client = MagicMock()
            mock_graph = MagicMock()
            mock_falkordb.return_value = mock_client
            mock_client.select_graph.return_value = mock_graph
            
            mock_node = MagicMock()
            mock_node.properties = {
                "id": "doc_1",
                "title": "Test Document",
                "document_type": "regulation",
                "regulator_id": "us_frb",
                "categories": "capital_requirements",
            }
            mock_result = MagicMock()
            mock_result.result_set = [[mock_node]]
            mock_result.nodes = [mock_node.properties]
            mock_graph.query.return_value = mock_result
            
            store = FalkorDBStore()
            store.connect()
            
            service = DocumentSearchService(store)
            yield service

    def test_search_endpoint_response_time(self, mock_search_service):
        """Test search endpoint response time."""
        def search_operation():
            filters = SearchFilters(query="capital")
            mock_search_service.search(filters)
        
        metrics = measure_performance(
            search_operation,
            "Search Endpoint",
            iterations=100,
        )
        
        # Assert response time under 100ms average
        assert metrics.avg_time_ms < 100, f"Search response too slow: {metrics.avg_time_ms:.2f}ms avg"

    def test_document_retrieval_response_time(self, mock_search_service):
        """Test document retrieval response time."""
        def retrieval_operation():
            mock_search_service.get_document_by_id("doc_1")
        
        metrics = measure_performance(
            retrieval_operation,
            "Document Retrieval",
            iterations=100,
        )
        
        # Assert response time under 50ms average
        assert metrics.avg_time_ms < 50, f"Retrieval response too slow: {metrics.avg_time_ms:.2f}ms avg"

    def test_regulator_filter_response_time(self, mock_search_service):
        """Test regulator-filtered search response time."""
        def filter_operation():
            mock_search_service.get_documents_by_regulator("FRB")
        
        metrics = measure_performance(
            filter_operation,
            "Regulator Filter",
            iterations=100,
        )
        
        # Assert response time under 100ms average
        assert metrics.avg_time_ms < 100, f"Filter response too slow: {metrics.avg_time_ms:.2f}ms avg"


class TestLoadScenarios:
    """Load testing scenarios simulating real-world usage patterns."""

    @pytest.fixture
    def full_setup(self):
        """Set up all components for load testing."""
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

    def test_mixed_workload_scenario(self, full_setup):
        """Test mixed workload with various operation types."""
        components = full_setup
        
        sample_doc = """
        <html><body><main>
            <h1>Test Regulatory Document</h1>
            <p>This regulation establishes compliance requirements. Filing deadline
            is quarterly. Threshold requirements apply to all institutions.</p>
        </main></body></html>
        """
        
        queries = [
            "What are CCAR requirements?",
            "What is LCR?",
            "CTR deadlines",
        ]
        
        operations_completed = {"parse": 0, "query": 0, "auth": 0}
        errors = []
        
        # Generate API key
        raw_key, _ = components["auth_service"].generate_api_key(
            name="Load Test Key",
            permissions=[Permission.SEARCH_DOCUMENTS],
        )
        
        def run_parse():
            try:
                components["parser"].parse(sample_doc, DocumentFormat.HTML)
                operations_completed["parse"] += 1
            except Exception as e:
                errors.append(f"Parse error: {e}")
        
        def run_query():
            try:
                query = queries[operations_completed["query"] % len(queries)]
                components["query_processor"].process_query(query)
                operations_completed["query"] += 1
            except Exception as e:
                errors.append(f"Query error: {e}")
        
        def run_auth():
            try:
                headers = {"Authorization": f"Bearer {raw_key}"}
                components["auth_service"].authenticate_request(headers)
                operations_completed["auth"] += 1
            except Exception as e:
                errors.append(f"Auth error: {e}")
        
        start_time = time.perf_counter()
        
        # Run mixed workload
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = []
            for i in range(100):
                if i % 3 == 0:
                    futures.append(executor.submit(run_parse))
                elif i % 3 == 1:
                    futures.append(executor.submit(run_query))
                else:
                    futures.append(executor.submit(run_auth))
            
            for future in as_completed(futures):
                future.result()
        
        end_time = time.perf_counter()
        total_time = end_time - start_time
        
        total_ops = sum(operations_completed.values())
        throughput = total_ops / total_time
        
        # Assert no errors
        assert len(errors) == 0, f"Errors during load test: {errors}"
        
        # Assert all operations completed
        assert total_ops == 100, f"Not all operations completed: {total_ops}/100"
        
        # Assert reasonable throughput
        assert throughput >= 20, f"Mixed workload throughput too low: {throughput:.2f} ops/sec"

    def test_burst_traffic_scenario(self, full_setup):
        """Test handling of burst traffic."""
        auth_service = full_setup["auth_service"]
        
        # Generate API key
        raw_key, _ = auth_service.generate_api_key(
            name="Burst Test Key",
            permissions=[Permission.SEARCH_DOCUMENTS],
        )
        
        results = []
        
        def authenticate():
            headers = {"Authorization": f"Bearer {raw_key}"}
            result = auth_service.authenticate_request(headers)
            return result.success
        
        # Simulate burst of 50 concurrent requests
        start_time = time.perf_counter()
        
        with ThreadPoolExecutor(max_workers=50) as executor:
            futures = [executor.submit(authenticate) for _ in range(50)]
            for future in as_completed(futures):
                results.append(future.result())
        
        end_time = time.perf_counter()
        burst_time = end_time - start_time
        
        # Assert all requests succeeded
        success_count = sum(1 for r in results if r)
        assert success_count == 50, f"Burst traffic failures: {50 - success_count}"
        
        # Assert burst handled quickly (under 2 seconds)
        assert burst_time < 2.0, f"Burst traffic took too long: {burst_time:.2f}s"

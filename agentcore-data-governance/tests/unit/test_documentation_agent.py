"""
Unit tests for the Documentation Agent.

Tests document generation and compliance package compilation.
Requirements: 10.1, 10.2
"""
import pytest
from datetime import datetime, timedelta

from repository.in_memory import InMemoryGovernanceRepository
from tools.documentation_tools import create_documentation_tools
from models.documentation import DocumentationConfig
from models.regulatory import ReportCatalog, RegulatoryReport, DueDateRule
from models.cde import CDE, CDEInventory
from models.data_elements import (
    DataElement, DataMapping, RequirementsDocument
)
from models.lineage import LineageGraph, LineageNode, LineageEdge
from models.data_quality import DQRule
from models.issues import Issue
from models.controls import Control, ControlMatrix, ControlEvidence
from models.workflow import CycleInstance


@pytest.fixture
def repository():
    """Provide a fresh in-memory repository for each test."""
    return InMemoryGovernanceRepository()


@pytest.fixture
def documentation_tools(repository):
    """Create documentation tools with the test repository."""
    config = DocumentationConfig(
        organization_name="Test Financial Institution",
        include_timestamps=True,
        default_format="markdown"
    )
    return create_documentation_tools(repository, config)


@pytest.fixture
def sample_report():
    """Create a sample regulatory report."""
    return RegulatoryReport(
        id='report-001',
        name='Call Report',
        jurisdiction='US',
        regulator='Federal Reserve',
        frequency='quarterly',
        due_date=DueDateRule(days_after_period_end=30),
        submission_format='XML',
        submission_platform='FRB Portal',
        description='Quarterly call report',
        last_updated=datetime.now(),
        responsible_unit='Regulatory Reporting'
    )


@pytest.fixture
def sample_catalog(sample_report):
    """Create a sample report catalog."""
    return ReportCatalog(
        reports=[sample_report],
        version=1,
        last_scanned=datetime.now(),
        status='approved'
    )


@pytest.fixture
def sample_data_elements():
    """Create sample data elements."""
    return [
        DataElement(
            id='elem-001',
            name='Total Assets',
            regulatory_definition='Sum of all assets',
            data_type='decimal',
            format='###,###.##',
            calculation_logic='SUM(assets)',
            unit='USD',
            mandatory=True
        ),
        DataElement(
            id='elem-002',
            name='Total Liabilities',
            regulatory_definition='Sum of all liabilities',
            data_type='decimal',
            format='###,###.##',
            mandatory=True
        )
    ]


@pytest.fixture
def sample_data_mappings():
    """Create sample data mappings."""
    return [
        DataMapping(
            element_id='elem-001',
            source_system='Core Banking',
            source_table='GL_ACCOUNTS',
            source_field='BALANCE',
            transformation_logic='SUM WHERE account_type = ASSET',
            confidence=0.95
        )
    ]


@pytest.fixture
def sample_requirements_doc(sample_data_elements, sample_data_mappings):
    """Create a sample requirements document."""
    return RequirementsDocument(
        report_id='report-001',
        elements=sample_data_elements,
        mappings=sample_data_mappings,
        gaps=[],
        version=1,
        status='approved',
        created_at=datetime.now(),
        updated_at=datetime.now()
    )


# Alias for compatibility with documentation tools
@pytest.fixture
def sample_requirements_document(sample_requirements_doc):
    """Alias for sample_requirements_doc."""
    return sample_requirements_doc


@pytest.fixture
def sample_cdes():
    """Create sample CDEs."""
    return [
        CDE(
            id='cde-001',
            element_id='elem-001',
            name='Total Assets',
            business_definition='Total value of all assets',
            criticality_rationale='Key regulatory metric',
            data_owner='John Smith',
            status='approved',
            approved_by='Jane Doe',
            approved_at=datetime.now()
        ),
        CDE(
            id='cde-002',
            element_id='elem-002',
            name='Total Liabilities',
            business_definition='Total value of all liabilities',
            criticality_rationale='Key regulatory metric',
            status='pending_approval'
        )
    ]


@pytest.fixture
def sample_cde_inventory(sample_cdes):
    """Create a sample CDE inventory."""
    return CDEInventory(
        report_id='report-001',
        cdes=sample_cdes,
        version=1,
        status='approved',
        created_at=datetime.now(),
        updated_at=datetime.now()
    )


@pytest.fixture
def sample_lineage_nodes():
    """Create sample lineage nodes."""
    return [
        LineageNode(
            id='node-001',
            type='source_table',
            name='GL_ACCOUNTS',
            system='Core Banking',
            business_term='General Ledger',
            policies=['Data Retention Policy'],
            controls=['Access Control']
        ),
        LineageNode(
            id='node-002',
            type='transformation',
            name='Asset Aggregation',
            system='ETL Pipeline'
        ),
        LineageNode(
            id='node-003',
            type='report_field',
            name='Total Assets',
            system='Regulatory Reporting',
            business_term='Total Assets'
        )
    ]


@pytest.fixture
def sample_lineage_edges():
    """Create sample lineage edges."""
    return [
        LineageEdge(
            source_node_id='node-001',
            target_node_id='node-002',
            transformation_type='aggregation',
            transformation_logic='SUM(balance)'
        ),
        LineageEdge(
            source_node_id='node-002',
            target_node_id='node-003',
            transformation_type='direct',
            transformation_logic=None
        )
    ]


@pytest.fixture
def sample_lineage_graph(sample_lineage_nodes, sample_lineage_edges):
    """Create a sample lineage graph."""
    return LineageGraph(
        report_id='report-001',
        nodes=sample_lineage_nodes,
        edges=sample_lineage_edges,
        version=1,
        captured_at=datetime.now()
    )


@pytest.fixture
def sample_dq_rules():
    """Create sample DQ rules."""
    from models.data_quality import RuleLogic, Threshold
    return [
        DQRule(
            id='rule-001',
            cde_id='cde-001',
            dimension='completeness',
            name='Total Assets Completeness',
            description='Check completeness of total assets',
            logic=RuleLogic(type='null_check', expression='value IS NOT NULL'),
            threshold=Threshold(type='percentage', value=0.99),
            severity='critical',
            owner='Data Quality Team',
            enabled=True
        ),
        DQRule(
            id='rule-002',
            cde_id='cde-001',
            dimension='accuracy',
            name='Total Assets Accuracy',
            description='Check accuracy of total assets',
            logic=RuleLogic(type='range_check', expression='value BETWEEN 0 AND 1000000000'),
            threshold=Threshold(type='percentage', value=0.95),
            severity='high',
            owner='Data Quality Team',
            enabled=True
        ),
        DQRule(
            id='rule-003',
            cde_id='cde-002',
            dimension='timeliness',
            name='Liabilities Timeliness',
            description='Check timeliness of liabilities',
            logic=RuleLogic(type='custom', expression='DATEDIFF(NOW(), updated_at) < 1'),
            threshold=Threshold(type='percentage', value=0.90),
            severity='medium',
            owner='Data Quality Team',
            enabled=False
        )
    ]


@pytest.fixture
def sample_issues():
    """Create sample issues."""
    return [
        Issue(
            id='issue-001',
            title='Missing asset data',
            description='Some asset records are missing',
            source='DQ Rule',
            impacted_reports=['report-001'],
            impacted_cdes=['cde-001'],
            severity='critical',
            status='open',
            assignee='Data Quality Team',
            created_at=datetime.now()
        ),
        Issue(
            id='issue-002',
            title='Stale liability data',
            description='Liability data is outdated',
            source='Manual Review',
            impacted_reports=['report-001'],
            impacted_cdes=['cde-002'],
            severity='high',
            status='in_progress',
            assignee='John Smith',
            created_at=datetime.now()
        )
    ]


@pytest.fixture
def sample_controls():
    """Create sample controls."""
    return [
        Control(
            id='ctrl-001',
            name='Data Validation Control',
            description='Validates data before submission',
            type='process',
            category='preventive',
            owner='Data Quality Team',
            frequency='daily',
            linked_cdes=['cde-001'],
            automation_status='fully_automated',
            status='active',
            evidence=[
                ControlEvidence(
                    control_id='ctrl-001',
                    execution_date=datetime.now() - timedelta(days=1),
                    outcome='pass',
                    details='All validations passed',
                    executed_by='System'
                ),
                ControlEvidence(
                    control_id='ctrl-001',
                    execution_date=datetime.now() - timedelta(days=2),
                    outcome='pass',
                    details='All validations passed',
                    executed_by='System'
                )
            ]
        ),
        Control(
            id='ctrl-002',
            name='Access Control',
            description='Controls access to sensitive data',
            type='access',
            category='preventive',
            owner='Security Team',
            frequency='continuous',
            automation_status='manual',
            status='compensating',
            expiration_date=datetime.now() + timedelta(days=15),
            evidence=[]
        )
    ]


@pytest.fixture
def sample_control_matrix(sample_controls):
    """Create a sample control matrix."""
    return ControlMatrix(
        report_id='report-001',
        controls=sample_controls,
        version=1,
        last_reviewed=datetime.now(),
        reviewed_by='Risk Manager'
    )


@pytest.fixture
def sample_cycle():
    """Create a sample cycle instance."""
    return CycleInstance(
        id='cycle-001',
        report_id='report-001',
        period_end=datetime.now(),
        status='active',
        current_phase='validation',
        started_at=datetime.now() - timedelta(days=5)
    )


class TestGenerateDataDictionary:
    """Tests for generate_data_dictionary tool."""
    
    def test_generate_data_dictionary_success(
        self, documentation_tools, repository, sample_catalog,
        sample_cde_inventory, sample_requirements_document
    ):
        """Test successful data dictionary generation."""
        repository.set_report_catalog(sample_catalog)
        repository.set_cde_inventory('report-001', sample_cde_inventory)
        repository.set_requirements_document('report-001', sample_requirements_document)
        
        generate_tool = documentation_tools[0]  # generate_data_dictionary
        result = generate_tool('report-001')
        
        assert result['type'] == 'data_dictionary'
        assert 'Call Report' in result['title']
        assert 'Total Assets' in result['content']
        assert result['format'] == 'markdown'
    
    def test_generate_data_dictionary_includes_cde_details(
        self, documentation_tools, repository, sample_catalog,
        sample_cde_inventory, sample_requirements_document
    ):
        """Test that data dictionary includes CDE details."""
        repository.set_report_catalog(sample_catalog)
        repository.set_cde_inventory('report-001', sample_cde_inventory)
        repository.set_requirements_document('report-001', sample_requirements_document)
        
        generate_tool = documentation_tools[0]
        result = generate_tool('report-001')
        
        content = result['content']
        assert 'Business Definition' in content
        assert 'Criticality Rationale' in content
        assert 'Data Owner' in content
    
    def test_generate_data_dictionary_creates_audit_entry(
        self, documentation_tools, repository, sample_catalog,
        sample_cde_inventory, sample_requirements_document
    ):
        """Test that data dictionary generation creates audit entry."""
        repository.set_report_catalog(sample_catalog)
        repository.set_cde_inventory('report-001', sample_cde_inventory)
        repository.set_requirements_document('report-001', sample_requirements_document)
        
        generate_tool = documentation_tools[0]
        generate_tool('report-001')
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == 'generate_data_dictionary'
        assert audit_entries[0].actor == 'DocumentationAgent'
    
    def test_generate_data_dictionary_fails_without_inventory(
        self, documentation_tools, repository, sample_catalog
    ):
        """Test that generation fails without CDE inventory."""
        repository.set_report_catalog(sample_catalog)
        
        generate_tool = documentation_tools[0]
        
        with pytest.raises(ValueError, match="Missing required data"):
            generate_tool('report-001')


class TestGenerateLineageDocumentation:
    """Tests for generate_lineage_documentation tool."""
    
    def test_generate_lineage_documentation_success(
        self, documentation_tools, repository, sample_catalog,
        sample_lineage_graph, sample_cde_inventory
    ):
        """Test successful lineage documentation generation."""
        repository.set_report_catalog(sample_catalog)
        repository.set_lineage_graph('report-001', sample_lineage_graph)
        repository.set_cde_inventory('report-001', sample_cde_inventory)
        
        generate_tool = documentation_tools[1]  # generate_lineage_documentation
        result = generate_tool('report-001')
        
        assert result['type'] == 'lineage_documentation'
        assert 'Call Report' in result['title']
        assert 'GL_ACCOUNTS' in result['content']
    
    def test_generate_lineage_documentation_includes_nodes_by_type(
        self, documentation_tools, repository, sample_catalog,
        sample_lineage_graph, sample_cde_inventory
    ):
        """Test that lineage documentation groups nodes by type."""
        repository.set_report_catalog(sample_catalog)
        repository.set_lineage_graph('report-001', sample_lineage_graph)
        repository.set_cde_inventory('report-001', sample_cde_inventory)
        
        generate_tool = documentation_tools[1]
        result = generate_tool('report-001')
        
        content = result['content']
        assert 'Source Systems' in content
        assert 'Transformations' in content
        assert 'Report Fields' in content
    
    def test_generate_lineage_documentation_creates_audit_entry(
        self, documentation_tools, repository, sample_catalog,
        sample_lineage_graph, sample_cde_inventory
    ):
        """Test that lineage documentation generation creates audit entry."""
        repository.set_report_catalog(sample_catalog)
        repository.set_lineage_graph('report-001', sample_lineage_graph)
        repository.set_cde_inventory('report-001', sample_cde_inventory)
        
        generate_tool = documentation_tools[1]
        generate_tool('report-001')
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == 'generate_lineage_documentation'
    
    def test_generate_lineage_documentation_fails_without_graph(
        self, documentation_tools, repository
    ):
        """Test that generation fails without lineage graph."""
        generate_tool = documentation_tools[1]
        
        with pytest.raises(ValueError, match="No lineage graph found"):
            generate_tool('report-001')


class TestGenerateQualityAssuranceReport:
    """Tests for generate_quality_assurance_report tool."""
    
    def test_generate_qa_report_success(
        self, documentation_tools, repository, sample_catalog,
        sample_cycle, sample_cde_inventory, sample_dq_rules, sample_issues
    ):
        """Test successful QA report generation."""
        repository.set_report_catalog(sample_catalog)
        repository.create_cycle_instance(sample_cycle)
        repository.set_cde_inventory('report-001', sample_cde_inventory)
        for rule in sample_dq_rules:
            repository.add_dq_rule(rule)
        for issue in sample_issues:
            repository.create_issue(issue)
        
        generate_tool = documentation_tools[2]  # generate_quality_assurance_report
        result = generate_tool('cycle-001')
        
        assert result['type'] == 'quality_assurance_report'
        assert 'Quality Assurance Report' in result['title']
    
    def test_generate_qa_report_includes_metrics(
        self, documentation_tools, repository, sample_catalog,
        sample_cycle, sample_cde_inventory, sample_dq_rules, sample_issues
    ):
        """Test that QA report includes quality metrics."""
        repository.set_report_catalog(sample_catalog)
        repository.create_cycle_instance(sample_cycle)
        repository.set_cde_inventory('report-001', sample_cde_inventory)
        for rule in sample_dq_rules:
            repository.add_dq_rule(rule)
        for issue in sample_issues:
            repository.create_issue(issue)
        
        generate_tool = documentation_tools[2]
        result = generate_tool('cycle-001')
        
        content = result['content']
        assert 'Quality Metrics Summary' in content
        assert 'Total Data Quality Rules' in content
        assert 'Critical Data Elements' in content
    
    def test_generate_qa_report_creates_audit_entry(
        self, documentation_tools, repository, sample_catalog,
        sample_cycle, sample_cde_inventory
    ):
        """Test that QA report generation creates audit entry."""
        repository.set_report_catalog(sample_catalog)
        repository.create_cycle_instance(sample_cycle)
        repository.set_cde_inventory('report-001', sample_cde_inventory)
        
        generate_tool = documentation_tools[2]
        generate_tool('cycle-001')
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == 'generate_quality_assurance_report'
    
    def test_generate_qa_report_fails_without_cycle(
        self, documentation_tools, repository
    ):
        """Test that generation fails without cycle."""
        generate_tool = documentation_tools[2]
        
        with pytest.raises(ValueError, match="Cycle .* not found"):
            generate_tool('nonexistent-cycle')


class TestGenerateControlEffectivenessReport:
    """Tests for generate_control_effectiveness_report tool."""
    
    def test_generate_control_report_success(
        self, documentation_tools, repository, sample_catalog,
        sample_cycle, sample_control_matrix
    ):
        """Test successful control effectiveness report generation."""
        repository.set_report_catalog(sample_catalog)
        repository.create_cycle_instance(sample_cycle)
        repository.set_control_matrix('report-001', sample_control_matrix)
        
        generate_tool = documentation_tools[3]  # generate_control_effectiveness_report
        result = generate_tool('cycle-001')
        
        assert result['type'] == 'control_effectiveness_report'
        assert 'Control Effectiveness Report' in result['title']
    
    def test_generate_control_report_includes_summary(
        self, documentation_tools, repository, sample_catalog,
        sample_cycle, sample_control_matrix
    ):
        """Test that control report includes summary statistics."""
        repository.set_report_catalog(sample_catalog)
        repository.create_cycle_instance(sample_cycle)
        repository.set_control_matrix('report-001', sample_control_matrix)
        
        generate_tool = documentation_tools[3]
        result = generate_tool('cycle-001')
        
        content = result['content']
        assert 'Control Summary' in content
        assert 'Total Controls' in content
        assert 'Active Controls' in content
    
    def test_generate_control_report_creates_audit_entry(
        self, documentation_tools, repository, sample_catalog,
        sample_cycle, sample_control_matrix
    ):
        """Test that control report generation creates audit entry."""
        repository.set_report_catalog(sample_catalog)
        repository.create_cycle_instance(sample_cycle)
        repository.set_control_matrix('report-001', sample_control_matrix)
        
        generate_tool = documentation_tools[3]
        generate_tool('cycle-001')
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == 'generate_control_effectiveness_report'
    
    def test_generate_control_report_fails_without_matrix(
        self, documentation_tools, repository, sample_catalog, sample_cycle
    ):
        """Test that generation fails without control matrix."""
        repository.set_report_catalog(sample_catalog)
        repository.create_cycle_instance(sample_cycle)
        
        generate_tool = documentation_tools[3]
        
        with pytest.raises(ValueError, match="No control matrix found"):
            generate_tool('cycle-001')


class TestGenerateBCBS239ComplianceMapping:
    """Tests for generate_bcbs239_compliance_mapping tool."""
    
    def test_generate_bcbs239_mapping_success(
        self, documentation_tools, repository, sample_catalog,
        sample_cde_inventory, sample_lineage_graph, sample_control_matrix
    ):
        """Test successful BCBS 239 mapping generation."""
        repository.set_report_catalog(sample_catalog)
        repository.set_cde_inventory('report-001', sample_cde_inventory)
        repository.set_lineage_graph('report-001', sample_lineage_graph)
        repository.set_control_matrix('report-001', sample_control_matrix)
        
        generate_tool = documentation_tools[4]  # generate_bcbs239_compliance_mapping
        result = generate_tool('report-001')
        
        assert result['type'] == 'bcbs239_compliance_mapping'
        assert 'BCBS 239' in result['title']
    
    def test_generate_bcbs239_mapping_includes_all_14_principles(
        self, documentation_tools, repository, sample_catalog,
        sample_cde_inventory, sample_lineage_graph, sample_control_matrix
    ):
        """Test that BCBS 239 mapping includes all 14 principles."""
        repository.set_report_catalog(sample_catalog)
        repository.set_cde_inventory('report-001', sample_cde_inventory)
        repository.set_lineage_graph('report-001', sample_lineage_graph)
        repository.set_control_matrix('report-001', sample_control_matrix)
        
        generate_tool = documentation_tools[4]
        result = generate_tool('report-001')
        
        content = result['content']
        # Check for all 14 principles
        assert 'Principle 1: Governance' in content
        assert 'Principle 2: Data Architecture' in content
        assert 'Principle 3: Accuracy and Integrity' in content
        assert 'Principle 4: Completeness' in content
        assert 'Principle 5: Timeliness' in content
        assert 'Principle 6: Adaptability' in content
        assert 'Principle 7: Accuracy (Reporting)' in content
        assert 'Principle 8: Comprehensiveness' in content
        assert 'Principle 9: Clarity and Usefulness' in content
        assert 'Principle 10: Frequency' in content
        assert 'Principle 11: Distribution' in content
        assert 'Principle 12: Review' in content
        assert 'Principle 13: Remedial Actions' in content
        assert 'Principle 14: Home/Host Cooperation' in content
    
    def test_generate_bcbs239_mapping_creates_audit_entry(
        self, documentation_tools, repository, sample_catalog
    ):
        """Test that BCBS 239 mapping generation creates audit entry."""
        repository.set_report_catalog(sample_catalog)
        
        generate_tool = documentation_tools[4]
        generate_tool('report-001')
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == 'generate_bcbs239_compliance_mapping'
    
    def test_generate_bcbs239_mapping_calculates_compliance_score(
        self, documentation_tools, repository, sample_catalog,
        sample_cde_inventory, sample_lineage_graph, sample_control_matrix
    ):
        """Test that BCBS 239 mapping calculates compliance score."""
        repository.set_report_catalog(sample_catalog)
        repository.set_cde_inventory('report-001', sample_cde_inventory)
        repository.set_lineage_graph('report-001', sample_lineage_graph)
        repository.set_control_matrix('report-001', sample_control_matrix)
        
        generate_tool = documentation_tools[4]
        result = generate_tool('report-001')
        
        content = result['content']
        assert 'Overall Compliance Score' in content
        assert 'Compliance Summary' in content


class TestCompileCompliancePackage:
    """Tests for compile_compliance_package tool."""
    
    def test_compile_package_success(
        self, documentation_tools, repository, sample_catalog,
        sample_cycle, sample_cde_inventory, sample_requirements_document,
        sample_lineage_graph, sample_control_matrix
    ):
        """Test successful compliance package compilation."""
        repository.set_report_catalog(sample_catalog)
        repository.create_cycle_instance(sample_cycle)
        repository.set_cde_inventory('report-001', sample_cde_inventory)
        repository.set_requirements_document('report-001', sample_requirements_document)
        repository.set_lineage_graph('report-001', sample_lineage_graph)
        repository.set_control_matrix('report-001', sample_control_matrix)
        
        compile_tool = documentation_tools[5]  # compile_compliance_package
        result = compile_tool('cycle-001')
        
        assert result['cycle_id'] == 'cycle-001'
        assert result['report_id'] == 'report-001'
        assert result['status'] == 'draft'
        assert len(result['documents']) > 0
    
    def test_compile_package_includes_multiple_documents(
        self, documentation_tools, repository, sample_catalog,
        sample_cycle, sample_cde_inventory, sample_requirements_document,
        sample_lineage_graph, sample_control_matrix
    ):
        """Test that package includes multiple document types."""
        repository.set_report_catalog(sample_catalog)
        repository.create_cycle_instance(sample_cycle)
        repository.set_cde_inventory('report-001', sample_cde_inventory)
        repository.set_requirements_document('report-001', sample_requirements_document)
        repository.set_lineage_graph('report-001', sample_lineage_graph)
        repository.set_control_matrix('report-001', sample_control_matrix)
        
        compile_tool = documentation_tools[5]
        result = compile_tool('cycle-001')
        
        doc_types = [d['type'] for d in result['documents']]
        assert 'data_dictionary' in doc_types
        assert 'lineage_documentation' in doc_types
        assert 'bcbs239_compliance_mapping' in doc_types
    
    def test_compile_package_creates_audit_entry(
        self, documentation_tools, repository, sample_catalog, sample_cycle
    ):
        """Test that package compilation creates audit entry."""
        repository.set_report_catalog(sample_catalog)
        repository.create_cycle_instance(sample_cycle)
        
        compile_tool = documentation_tools[5]
        compile_tool('cycle-001')
        
        audit_entries = repository.get_audit_entries()
        # Should have at least one audit entry for compile_compliance_package
        compile_entries = [e for e in audit_entries if e.action == 'compile_compliance_package']
        assert len(compile_entries) == 1
    
    def test_compile_package_handles_missing_data_gracefully(
        self, documentation_tools, repository, sample_catalog, sample_cycle
    ):
        """Test that package compilation handles missing data gracefully."""
        repository.set_report_catalog(sample_catalog)
        repository.create_cycle_instance(sample_cycle)
        # Don't set any other data
        
        compile_tool = documentation_tools[5]
        result = compile_tool('cycle-001')
        
        # Should still return a package, possibly with fewer documents
        assert result['cycle_id'] == 'cycle-001'
        assert result['status'] == 'draft'
    
    def test_compile_package_fails_without_cycle(
        self, documentation_tools, repository
    ):
        """Test that compilation fails without cycle."""
        compile_tool = documentation_tools[5]
        
        with pytest.raises(ValueError, match="Cycle .* not found"):
            compile_tool('nonexistent-cycle')

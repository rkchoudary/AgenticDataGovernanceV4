"""
Data Requirements Agent tools for the Agentic Data Governance System.

This module defines Strands tools for parsing regulatory templates, mapping data
elements to internal sources, identifying data gaps, and generating requirements
documents.

Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
"""

from datetime import datetime
from typing import Optional
from strands import tool

from models.data_elements import (
    DataElement,
    DataMapping,
    DataGap,
    RequirementsDocument,
    ReconciliationItem,
    ReconciliationResult,
    DataGapReason,
    ReconciliationItemStatus,
)
from models.audit import AuditEntry
from repository.base import GovernanceRepository


def create_data_requirements_tools(repository: GovernanceRepository):
    """
    Factory function to create data requirements tools with repository injection.
    
    Args:
        repository: The governance repository for data persistence.
        
    Returns:
        List of tool functions for the Data Requirements Agent.
    """
    
    @tool
    def parse_regulatory_template(
        report_id: str,
        template_content: str,
        template_format: str = "text"
    ) -> list[dict]:
        """
        Parse a regulatory template to extract data element definitions.
        
        Extracts DataElement objects with name, regulatory_definition, data_type,
        format, calculation_logic, and mandatory flag.
        
        Args:
            report_id: The ID of the regulatory report this template belongs to.
            template_content: The content of the regulatory template to parse.
            template_format: Format of the template ('text', 'xml', 'json').
            
        Returns:
            List of extracted data elements as dictionaries.
        """
        elements: list[DataElement] = []
        
        # Parse template based on format
        # In a real implementation, this would use NLP/AI to extract elements
        # For now, we create a basic parsing structure
        
        def normalize_data_type(raw_type: str) -> str:
            """
            Normalize raw data type to valid DataType enum value.
            
            Maps various database/programming type names to the standard types:
            string, number, date, boolean, decimal, integer
            """
            if not raw_type:
                return 'string'
            
            normalized = raw_type.lower().strip()
            
            type_map = {
                # String types
                'string': 'string',
                'text': 'string',
                'varchar': 'string',
                'char': 'string',
                'nvarchar': 'string',
                'nchar': 'string',
                # Number types
                'number': 'number',
                'numeric': 'number',
                'float': 'number',
                'double': 'number',
                'real': 'number',
                # Decimal types
                'decimal': 'decimal',
                'money': 'decimal',
                'currency': 'decimal',
                # Integer types
                'integer': 'integer',
                'int': 'integer',
                'bigint': 'integer',
                'smallint': 'integer',
                'tinyint': 'integer',
                # Date types
                'date': 'date',
                'datetime': 'date',
                'timestamp': 'date',
                'time': 'date',
                # Boolean types
                'boolean': 'boolean',
                'bool': 'boolean',
                'bit': 'boolean',
            }
            
            return type_map.get(normalized, 'string')
        
        def infer_format(data_type: str) -> str:
            """Infer format based on data type when not provided."""
            normalized = data_type.lower() if data_type else ""
            if 'date' in normalized or 'time' in normalized:
                return 'YYYY-MM-DD'
            if 'decimal' in normalized or 'money' in normalized or 'currency' in normalized:
                return '#,##0.00'
            if 'int' in normalized or 'integer' in normalized:
                return '#,##0'
            if 'bool' in normalized:
                return 'true/false'
            return 'text'
        
        if template_format == "json":
            import json
            try:
                data = json.loads(template_content)
                if isinstance(data, list):
                    for item in data:
                        raw_data_type = item.get("data_type") or "string"
                        # Normalize data type to valid enum value
                        data_type = normalize_data_type(raw_data_type)
                        # Handle None format by inferring from data type
                        format_value = item.get("format")
                        if not format_value:
                            format_value = infer_format(raw_data_type)
                        
                        element = DataElement(
                            name=item.get("name") or "Unknown",
                            regulatory_definition=item.get("definition") or "",
                            data_type=data_type,
                            format=format_value,
                            calculation_logic=item.get("calculation_logic"),
                            unit=item.get("unit"),
                            mandatory=item.get("mandatory", False)
                        )
                        elements.append(element)
            except json.JSONDecodeError:
                pass
        else:
            # For text format, create placeholder elements
            # In production, this would use AI to extract elements
            lines = template_content.strip().split("\n")
            for i, line in enumerate(lines):
                if line.strip():
                    element = DataElement(
                        name=f"Element_{i+1}",
                        regulatory_definition=line.strip(),
                        data_type="string",
                        format="text",  # Default format for text templates
                        mandatory=True
                    )
                    elements.append(element)
        
        # Get or create requirements document
        existing_doc = repository.get_requirements_document(report_id)
        if existing_doc:
            # Add new elements to existing document
            existing_doc.elements.extend(elements)
            existing_doc.version += 1
            existing_doc.updated_at = datetime.now()
            existing_doc.status = 'draft'
        else:
            existing_doc = RequirementsDocument(
                report_id=report_id,
                elements=elements,
                mappings=[],
                gaps=[],
                version=1,
                status='draft',
                created_at=datetime.now(),
                updated_at=datetime.now()
            )
        
        repository.set_requirements_document(report_id, existing_doc)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="DataRequirementsAgent",
            actor_type="agent",
            action="parse_regulatory_template",
            entity_type="RequirementsDocument",
            entity_id=existing_doc.id,
            new_state={
                "report_id": report_id,
                "elements_count": len(elements),
                "template_format": template_format
            }
        ))
        
        return [e.model_dump() for e in elements]
    
    @tool
    def map_to_internal_sources(
        report_id: str,
        element_ids: Optional[list[str]] = None,
        source_systems: Optional[list[str]] = None
    ) -> list[dict]:
        """
        Map data elements to internal data sources.
        
        Returns DataMapping objects with confidence scores indicating how well
        the internal source matches the regulatory requirement.
        
        Args:
            report_id: The ID of the regulatory report.
            element_ids: Optional list of specific element IDs to map.
                        If not provided, maps all unmapped elements.
            source_systems: Optional list of source systems to search.
            
        Returns:
            List of data mappings with confidence scores.
        """
        doc = repository.get_requirements_document(report_id)
        if not doc:
            raise ValueError(f"No requirements document found for report {report_id}")
        
        mappings: list[DataMapping] = []
        elements_to_map = doc.elements
        
        if element_ids:
            elements_to_map = [e for e in doc.elements if e.id in element_ids]
        
        # Get already mapped element IDs
        mapped_ids = {m.element_id for m in doc.mappings}
        
        for element in elements_to_map:
            if element.id in mapped_ids:
                continue
            
            # In a real implementation, this would search internal data catalogs
            # and use AI to match elements to sources
            # For now, we create placeholder mappings with varying confidence
            
            # Simulate finding a source based on element name
            confidence = 0.85 if element.mandatory else 0.70
            
            mapping = DataMapping(
                element_id=element.id,
                source_system="enterprise_data_warehouse",
                source_table=f"regulatory_{report_id.lower()}",
                source_field=element.name.lower().replace(" ", "_"),
                transformation_logic=element.calculation_logic,
                confidence=confidence
            )
            mappings.append(mapping)
        
        # Update document with new mappings
        doc.mappings.extend(mappings)
        doc.updated_at = datetime.now()
        repository.set_requirements_document(report_id, doc)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="DataRequirementsAgent",
            actor_type="agent",
            action="map_to_internal_sources",
            entity_type="RequirementsDocument",
            entity_id=doc.id,
            new_state={
                "report_id": report_id,
                "mappings_created": len(mappings),
                "source_systems": source_systems
            }
        ))
        
        return [m.model_dump() for m in mappings]
    
    @tool
    def identify_data_gaps(report_id: str) -> list[dict]:
        """
        Identify data gaps where no internal source is found for required elements.
        
        Flags elements with reasons: no_source, partial_source, or calculation_needed.
        
        Args:
            report_id: The ID of the regulatory report.
            
        Returns:
            List of identified data gaps with reasons and suggested resolutions.
        """
        doc = repository.get_requirements_document(report_id)
        if not doc:
            raise ValueError(f"No requirements document found for report {report_id}")
        
        gaps: list[DataGap] = []
        mapped_element_ids = {m.element_id for m in doc.mappings}
        
        for element in doc.elements:
            gap_reason: Optional[DataGapReason] = None
            suggested_resolution: Optional[str] = None
            
            if element.id not in mapped_element_ids:
                # No mapping found
                gap_reason = 'no_source'
                suggested_resolution = f"Identify source system for '{element.name}' or create new data collection process"
            else:
                # Check mapping confidence
                mapping = next((m for m in doc.mappings if m.element_id == element.id), None)
                if mapping:
                    if mapping.confidence < 0.5:
                        gap_reason = 'partial_source'
                        suggested_resolution = f"Review and validate mapping for '{element.name}' - low confidence ({mapping.confidence:.0%})"
                    elif element.calculation_logic and not mapping.transformation_logic:
                        gap_reason = 'calculation_needed'
                        suggested_resolution = f"Implement calculation logic for '{element.name}': {element.calculation_logic}"
            
            if gap_reason:
                gap = DataGap(
                    element_id=element.id,
                    element_name=element.name,
                    reason=gap_reason,
                    suggested_resolution=suggested_resolution
                )
                gaps.append(gap)
        
        # Update document with identified gaps
        doc.gaps = gaps
        doc.updated_at = datetime.now()
        repository.set_requirements_document(report_id, doc)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="DataRequirementsAgent",
            actor_type="agent",
            action="identify_data_gaps",
            entity_type="RequirementsDocument",
            entity_id=doc.id,
            new_state={
                "report_id": report_id,
                "gaps_identified": len(gaps),
                "gap_reasons": {
                    "no_source": len([g for g in gaps if g.reason == 'no_source']),
                    "partial_source": len([g for g in gaps if g.reason == 'partial_source']),
                    "calculation_needed": len([g for g in gaps if g.reason == 'calculation_needed'])
                }
            }
        ))
        
        return [g.model_dump() for g in gaps]
    
    @tool
    def generate_requirements_document(
        report_id: str,
        include_mappings: bool = True,
        include_gaps: bool = True
    ) -> dict:
        """
        Generate a complete requirements document for a regulatory report.
        
        Compiles all data elements, mappings, and gaps into a structured document.
        
        Args:
            report_id: The ID of the regulatory report.
            include_mappings: Whether to include data mappings in the document.
            include_gaps: Whether to include identified gaps in the document.
            
        Returns:
            The complete requirements document.
        """
        doc = repository.get_requirements_document(report_id)
        if not doc:
            raise ValueError(f"No requirements document found for report {report_id}")
        
        # Create a copy for output
        output_doc = doc.model_copy()
        
        if not include_mappings:
            output_doc.mappings = []
        
        if not include_gaps:
            output_doc.gaps = []
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="DataRequirementsAgent",
            actor_type="agent",
            action="generate_requirements_document",
            entity_type="RequirementsDocument",
            entity_id=doc.id,
            new_state={
                "report_id": report_id,
                "elements_count": len(output_doc.elements),
                "mappings_count": len(output_doc.mappings),
                "gaps_count": len(output_doc.gaps)
            }
        ))
        
        return output_doc.model_dump()
    
    @tool
    def ingest_existing_document(
        report_id: str,
        existing_elements: list[dict],
        reconcile: bool = True
    ) -> dict:
        """
        Ingest an existing requirements document and reconcile with current state.
        
        Categorizes items as matched, added, removed, or modified.
        
        Args:
            report_id: The ID of the regulatory report.
            existing_elements: List of existing data elements to ingest.
            reconcile: Whether to perform reconciliation with current document.
            
        Returns:
            Reconciliation result showing matched, added, removed, and modified items.
        """
        current_doc = repository.get_requirements_document(report_id)
        
        # Parse existing elements
        ingested_elements: list[DataElement] = []
        for elem_dict in existing_elements:
            # Build element kwargs, only including id if provided
            element_kwargs = {
                "name": elem_dict.get("name", "Unknown"),
                "regulatory_definition": elem_dict.get("regulatory_definition", ""),
                "data_type": elem_dict.get("data_type", "string"),
                "format": elem_dict.get("format", ""),
                "calculation_logic": elem_dict.get("calculation_logic"),
                "unit": elem_dict.get("unit"),
                "mandatory": elem_dict.get("mandatory", False)
            }
            # Only include id if explicitly provided
            if "id" in elem_dict and elem_dict["id"] is not None:
                element_kwargs["id"] = elem_dict["id"]
            
            element = DataElement(**element_kwargs)
            ingested_elements.append(element)
        
        reconciliation_items: list[ReconciliationItem] = []
        
        if reconcile and current_doc:
            # Build lookup maps
            current_by_name = {e.name: e for e in current_doc.elements}
            ingested_by_name = {e.name: e for e in ingested_elements}
            
            # Find matched and modified
            for name, ingested_elem in ingested_by_name.items():
                if name in current_by_name:
                    current_elem = current_by_name[name]
                    differences = []
                    
                    # Check for differences
                    if current_elem.regulatory_definition != ingested_elem.regulatory_definition:
                        differences.append("regulatory_definition")
                    if current_elem.data_type != ingested_elem.data_type:
                        differences.append("data_type")
                    if current_elem.format != ingested_elem.format:
                        differences.append("format")
                    if current_elem.calculation_logic != ingested_elem.calculation_logic:
                        differences.append("calculation_logic")
                    if current_elem.mandatory != ingested_elem.mandatory:
                        differences.append("mandatory")
                    
                    status: ReconciliationItemStatus = 'matched' if not differences else 'modified'
                    
                    reconciliation_items.append(ReconciliationItem(
                        item_id=ingested_elem.id,
                        item_type="DataElement",
                        status=status,
                        existing_value=current_elem.model_dump(),
                        new_value=ingested_elem.model_dump(),
                        differences=differences
                    ))
                else:
                    # Added in ingested document
                    reconciliation_items.append(ReconciliationItem(
                        item_id=ingested_elem.id,
                        item_type="DataElement",
                        status='added',
                        new_value=ingested_elem.model_dump()
                    ))
            
            # Find removed (in current but not in ingested)
            for name, current_elem in current_by_name.items():
                if name not in ingested_by_name:
                    reconciliation_items.append(ReconciliationItem(
                        item_id=current_elem.id,
                        item_type="DataElement",
                        status='removed',
                        existing_value=current_elem.model_dump()
                    ))
        else:
            # No current document, all items are added
            for elem in ingested_elements:
                reconciliation_items.append(ReconciliationItem(
                    item_id=elem.id,
                    item_type="DataElement",
                    status='added',
                    new_value=elem.model_dump()
                ))
        
        # Calculate counts
        matched_count = len([i for i in reconciliation_items if i.status == 'matched'])
        added_count = len([i for i in reconciliation_items if i.status == 'added'])
        removed_count = len([i for i in reconciliation_items if i.status == 'removed'])
        modified_count = len([i for i in reconciliation_items if i.status == 'modified'])
        
        result = ReconciliationResult(
            items=reconciliation_items,
            matched_count=matched_count,
            added_count=added_count,
            removed_count=removed_count,
            modified_count=modified_count
        )
        
        # Update or create document with ingested elements
        if current_doc:
            # Merge elements: keep matched/modified, add new, remove deleted
            merged_elements = []
            ingested_by_name = {e.name: e for e in ingested_elements}
            
            for item in reconciliation_items:
                if item.status in ('matched', 'modified', 'added'):
                    if item.new_value:
                        merged_elements.append(DataElement(**item.new_value))
            
            current_doc.elements = merged_elements
            current_doc.version += 1
            current_doc.updated_at = datetime.now()
            current_doc.status = 'draft'
        else:
            current_doc = RequirementsDocument(
                report_id=report_id,
                elements=ingested_elements,
                mappings=[],
                gaps=[],
                version=1,
                status='draft',
                created_at=datetime.now(),
                updated_at=datetime.now()
            )
        
        repository.set_requirements_document(report_id, current_doc)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="DataRequirementsAgent",
            actor_type="agent",
            action="ingest_existing_document",
            entity_type="RequirementsDocument",
            entity_id=current_doc.id,
            new_state={
                "report_id": report_id,
                "matched": matched_count,
                "added": added_count,
                "removed": removed_count,
                "modified": modified_count
            }
        ))
        
        return result.model_dump()
    
    return [
        parse_regulatory_template,
        map_to_internal_sources,
        identify_data_gaps,
        generate_requirements_document,
        ingest_existing_document
    ]

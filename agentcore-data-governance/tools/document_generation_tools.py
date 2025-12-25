"""
Document Generation Tools for the Regulatory Intelligence Agent.

This module provides tools for generating sample regulatory documents, templates,
and reports that can be downloaded by users for training and testing purposes.

Requirements: 7.6, 7.7, 7.8 (Advanced Chat Features - File Generation)
"""

import json
import csv
import io
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from pathlib import Path
from strands import tool

from repository.base import GovernanceRepository
from models.audit import AuditEntry


def create_document_generation_tools(repository: GovernanceRepository, upload_dir: Path):
    """
    Factory function to create document generation tools.
    
    Args:
        repository: The governance repository for audit trails
        upload_dir: Directory where generated files will be stored
        
    Returns:
        List of document generation tool functions
    """
    
    @tool
    def generate_fr_2052a_template(
        bank_name: str = "Sample Bank",
        reporting_date: Optional[str] = None,
        include_sample_data: bool = True
    ) -> dict:
        """
        Generate a sample FR 2052A (Liquidity Coverage Ratio) report template.
        
        Args:
            bank_name: Name of the bank for the report
            reporting_date: Reporting date (YYYY-MM-DD), defaults to last quarter end
            include_sample_data: Whether to include realistic sample data
            
        Returns:
            Information about the generated file including download path
        """
        if not reporting_date:
            # Default to last quarter end
            now = datetime.now()
            quarter_end = datetime(now.year, ((now.month - 1) // 3) * 3 + 3, 1) - timedelta(days=1)
            reporting_date = quarter_end.strftime('%Y-%m-%d')
        
        # Generate FR 2052A structure
        fr_2052a_data = {
            "report_info": {
                "report_type": "FR 2052A",
                "report_name": "Liquidity Coverage Ratio",
                "bank_name": bank_name,
                "reporting_date": reporting_date,
                "generated_at": datetime.now().isoformat(),
                "currency": "USD",
                "units": "Thousands"
            },
            "schedule_a_hqla": {
                "description": "High-Quality Liquid Assets (HQLA)",
                "level_1_assets": {
                    "cash": 50000 if include_sample_data else 0,
                    "central_bank_reserves": 75000 if include_sample_data else 0,
                    "government_securities": 125000 if include_sample_data else 0,
                    "total_level_1": 250000 if include_sample_data else 0
                },
                "level_2a_assets": {
                    "government_sponsored_securities": 30000 if include_sample_data else 0,
                    "corporate_debt_securities": 25000 if include_sample_data else 0,
                    "total_level_2a": 55000 if include_sample_data else 0
                },
                "level_2b_assets": {
                    "corporate_equity_securities": 15000 if include_sample_data else 0,
                    "reit_securities": 10000 if include_sample_data else 0,
                    "total_level_2b": 25000 if include_sample_data else 0
                },
                "total_hqla": 330000 if include_sample_data else 0
            },
            "schedule_b_cash_outflows": {
                "description": "Cash Outflow Amounts",
                "retail_deposits": {
                    "stable_deposits": 800000 if include_sample_data else 0,
                    "less_stable_deposits": 400000 if include_sample_data else 0,
                    "outflow_rate_stable": 0.03,
                    "outflow_rate_less_stable": 0.10,
                    "total_retail_outflows": 64000 if include_sample_data else 0
                },
                "wholesale_funding": {
                    "operational_deposits": 200000 if include_sample_data else 0,
                    "non_operational_deposits": 150000 if include_sample_data else 0,
                    "unsecured_wholesale_funding": 100000 if include_sample_data else 0,
                    "total_wholesale_outflows": 350000 if include_sample_data else 0
                },
                "secured_funding": {
                    "asset_backed_securities": 50000 if include_sample_data else 0,
                    "other_secured_funding": 25000 if include_sample_data else 0,
                    "total_secured_outflows": 75000 if include_sample_data else 0
                },
                "additional_requirements": {
                    "derivatives_outflows": 30000 if include_sample_data else 0,
                    "credit_facilities": 40000 if include_sample_data else 0,
                    "other_contingent_funding": 20000 if include_sample_data else 0,
                    "total_additional": 90000 if include_sample_data else 0
                },
                "total_cash_outflows": 579000 if include_sample_data else 0
            },
            "schedule_c_cash_inflows": {
                "description": "Cash Inflow Amounts",
                "secured_lending": {
                    "reverse_repos": 40000 if include_sample_data else 0,
                    "securities_lending": 15000 if include_sample_data else 0,
                    "total_secured_lending": 55000 if include_sample_data else 0
                },
                "unsecured_lending": {
                    "committed_facilities": 25000 if include_sample_data else 0,
                    "other_lending": 20000 if include_sample_data else 0,
                    "total_unsecured_lending": 45000 if include_sample_data else 0
                },
                "other_inflows": {
                    "derivatives_inflows": 10000 if include_sample_data else 0,
                    "other_contractual_inflows": 15000 if include_sample_data else 0,
                    "total_other": 25000 if include_sample_data else 0
                },
                "total_cash_inflows": 125000 if include_sample_data else 0,
                "net_cash_inflows_cap": 144750 if include_sample_data else 0  # 25% of outflows
            },
            "schedule_d_supplemental": {
                "description": "Supplemental Information",
                "average_hqla": 335000 if include_sample_data else 0,
                "average_net_outflows": 454250 if include_sample_data else 0,
                "peak_funding_requirements": 600000 if include_sample_data else 0,
                "concentration_limits": {
                    "single_counterparty_limit": 50000,
                    "sector_concentration_limit": 100000
                }
            },
            "lcr_calculation": {
                "description": "Liquidity Coverage Ratio Calculation",
                "total_hqla": 330000 if include_sample_data else 0,
                "total_net_cash_outflows": 454250 if include_sample_data else 0,  # outflows - min(inflows, 25% outflows)
                "lcr_ratio": 0.7267 if include_sample_data else 0,  # 72.67%
                "lcr_percentage": 72.67 if include_sample_data else 0,
                "minimum_required": 100.0,
                "surplus_deficit": -27.33 if include_sample_data else 0,
                "compliance_status": "Below Minimum" if include_sample_data else "N/A"
            },
            "validation_rules": [
                "Total HQLA must equal sum of Level 1, 2A, and 2B assets",
                "Level 2A assets cannot exceed 40% of total HQLA",
                "Level 2B assets cannot exceed 15% of total HQLA",
                "Cash inflows are capped at 25% of total cash outflows",
                "LCR must be at least 100% for compliance"
            ],
            "notes": [
                "This is a sample template for training and testing purposes",
                "Actual FR 2052A submissions require real bank data and regulatory approval",
                "Consult with your liquidity risk management team for actual reporting",
                "All amounts are in thousands of USD unless otherwise specified"
            ]
        }
        
        # Generate filename and save
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"FR_2052A_Sample_{bank_name.replace(' ', '_')}_{timestamp}.json"
        file_path = upload_dir / filename
        
        with open(file_path, 'w') as f:
            json.dump(fr_2052a_data, f, indent=2)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="RegulatoryIntelligenceAgent",
            actor_type="agent",
            action="generate_fr_2052a_template",
            entity_type="Document",
            entity_id=filename,
            new_state={
                "bank_name": bank_name,
                "reporting_date": reporting_date,
                "include_sample_data": include_sample_data,
                "file_size": file_path.stat().st_size
            }
        ))
        
        return {
            "filename": filename,
            "file_path": str(file_path),
            "download_url": f"/api/download/generated/{filename}",
            "content_type": "application/json",
            "size": file_path.stat().st_size,
            "generated_at": datetime.now().isoformat(),
            "description": f"FR 2052A Liquidity Coverage Ratio template for {bank_name}",
            "includes_sample_data": include_sample_data
        }
    
    @tool
    def generate_data_governance_template(
        template_type: str = "data_quality_rules",
        organization: str = "Sample Organization",
        include_examples: bool = True
    ) -> dict:
        """
        Generate data governance templates and frameworks.
        
        Args:
            template_type: Type of template ('data_quality_rules', 'data_lineage', 'data_catalog', 'compliance_checklist')
            organization: Organization name for the template
            include_examples: Whether to include example data
            
        Returns:
            Information about the generated template file
        """
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        if template_type == "data_quality_rules":
            template_data = {
                "template_info": {
                    "template_type": "Data Quality Rules Framework",
                    "organization": organization,
                    "version": "1.0",
                    "generated_at": datetime.now().isoformat(),
                    "description": "Comprehensive data quality rules template for governance"
                },
                "data_quality_dimensions": {
                    "completeness": {
                        "description": "Measures the degree to which data is complete",
                        "rules": [
                            {
                                "rule_id": "DQ001",
                                "rule_name": "Mandatory Field Completeness",
                                "description": "All mandatory fields must be populated",
                                "sql_expression": "COUNT(*) WHERE mandatory_field IS NULL = 0",
                                "threshold": "100%",
                                "severity": "Critical"
                            } if include_examples else {}
                        ]
                    },
                    "accuracy": {
                        "description": "Measures how closely data values match the true values",
                        "rules": [
                            {
                                "rule_id": "DQ002",
                                "rule_name": "Email Format Validation",
                                "description": "Email addresses must follow valid format",
                                "sql_expression": "email_field REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'",
                                "threshold": "95%",
                                "severity": "High"
                            } if include_examples else {}
                        ]
                    },
                    "consistency": {
                        "description": "Measures uniformity of data across systems",
                        "rules": [
                            {
                                "rule_id": "DQ003",
                                "rule_name": "Cross-System Consistency",
                                "description": "Customer data must be consistent across systems",
                                "sql_expression": "system1.customer_id = system2.customer_id",
                                "threshold": "98%",
                                "severity": "High"
                            } if include_examples else {}
                        ]
                    },
                    "timeliness": {
                        "description": "Measures how up-to-date data is",
                        "rules": [
                            {
                                "rule_id": "DQ004",
                                "rule_name": "Data Freshness",
                                "description": "Data must be updated within specified timeframe",
                                "sql_expression": "DATEDIFF(NOW(), last_updated) <= 1",
                                "threshold": "90%",
                                "severity": "Medium"
                            } if include_examples else {}
                        ]
                    }
                },
                "implementation_guide": {
                    "setup_steps": [
                        "1. Define data quality dimensions relevant to your organization",
                        "2. Identify critical data elements and their quality requirements",
                        "3. Implement automated data quality monitoring",
                        "4. Establish data quality scorecards and reporting",
                        "5. Create data quality incident response procedures"
                    ],
                    "monitoring_frequency": {
                        "critical_rules": "Real-time",
                        "high_priority_rules": "Daily",
                        "medium_priority_rules": "Weekly",
                        "low_priority_rules": "Monthly"
                    }
                }
            }
            filename = f"Data_Quality_Rules_Template_{organization.replace(' ', '_')}_{timestamp}.json"
            
        elif template_type == "compliance_checklist":
            template_data = {
                "template_info": {
                    "template_type": "Regulatory Compliance Checklist",
                    "organization": organization,
                    "version": "1.0",
                    "generated_at": datetime.now().isoformat()
                },
                "compliance_areas": {
                    "data_privacy": {
                        "regulations": ["GDPR", "CCPA", "PIPEDA"],
                        "checklist_items": [
                            {
                                "item_id": "DP001",
                                "requirement": "Data Processing Legal Basis",
                                "description": "Ensure legal basis exists for all personal data processing",
                                "status": "Pending" if include_examples else "",
                                "evidence_required": "Privacy policy, consent records, legitimate interest assessments"
                            } if include_examples else {}
                        ]
                    },
                    "financial_reporting": {
                        "regulations": ["SOX", "Basel III", "CCAR"],
                        "checklist_items": [
                            {
                                "item_id": "FR001",
                                "requirement": "Data Lineage Documentation",
                                "description": "Document data lineage for all financial reports",
                                "status": "Pending" if include_examples else "",
                                "evidence_required": "Lineage diagrams, data flow documentation"
                            } if include_examples else {}
                        ]
                    }
                }
            }
            filename = f"Compliance_Checklist_{organization.replace(' ', '_')}_{timestamp}.json"
            
        else:
            # Default to data catalog template
            template_data = {
                "template_info": {
                    "template_type": "Data Catalog Template",
                    "organization": organization,
                    "version": "1.0",
                    "generated_at": datetime.now().isoformat()
                },
                "data_assets": [
                    {
                        "asset_id": "DA001",
                        "asset_name": "Customer Master Data",
                        "description": "Central repository of customer information",
                        "data_owner": "Customer Operations",
                        "data_steward": "Data Management Team",
                        "classification": "Confidential",
                        "retention_period": "7 years",
                        "quality_score": 85 if include_examples else None
                    } if include_examples else {}
                ]
            }
            filename = f"Data_Catalog_Template_{organization.replace(' ', '_')}_{timestamp}.json"
        
        # Save file
        file_path = upload_dir / filename
        with open(file_path, 'w') as f:
            json.dump(template_data, f, indent=2)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="RegulatoryIntelligenceAgent",
            actor_type="agent",
            action="generate_data_governance_template",
            entity_type="Document",
            entity_id=filename,
            new_state={
                "template_type": template_type,
                "organization": organization,
                "include_examples": include_examples,
                "file_size": file_path.stat().st_size
            }
        ))
        
        return {
            "filename": filename,
            "file_path": str(file_path),
            "download_url": f"/api/download/generated/{filename}",
            "content_type": "application/json",
            "size": file_path.stat().st_size,
            "generated_at": datetime.now().isoformat(),
            "description": f"{template_type.replace('_', ' ').title()} template for {organization}",
            "includes_examples": include_examples
        }
    
    @tool
    def generate_sample_dataset(
        dataset_type: str = "customer_data",
        record_count: int = 100,
        format: str = "csv",
        include_quality_issues: bool = False
    ) -> dict:
        """
        Generate sample datasets for testing data governance processes.
        
        Args:
            dataset_type: Type of dataset ('customer_data', 'transaction_data', 'product_data')
            record_count: Number of records to generate
            format: Output format ('csv', 'json')
            include_quality_issues: Whether to include intentional data quality issues
            
        Returns:
            Information about the generated dataset file
        """
        import random
        from faker import Faker
        fake = Faker()
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        if dataset_type == "customer_data":
            data = []
            for i in range(record_count):
                # Introduce quality issues if requested
                email = fake.email() if not (include_quality_issues and random.random() < 0.1) else "invalid-email"
                phone = fake.phone_number() if not (include_quality_issues and random.random() < 0.05) else None
                
                record = {
                    "customer_id": f"CUST{i+1:06d}",
                    "first_name": fake.first_name(),
                    "last_name": fake.last_name(),
                    "email": email,
                    "phone": phone,
                    "address": fake.address().replace('\n', ', '),
                    "city": fake.city(),
                    "state": fake.state_abbr(),
                    "zip_code": fake.zipcode(),
                    "date_of_birth": fake.date_of_birth(minimum_age=18, maximum_age=80).isoformat(),
                    "account_balance": round(random.uniform(100, 50000), 2),
                    "account_status": random.choice(["Active", "Inactive", "Suspended"]),
                    "created_date": fake.date_between(start_date='-2y', end_date='today').isoformat(),
                    "last_updated": fake.date_between(start_date='-30d', end_date='today').isoformat()
                }
                data.append(record)
            
            filename = f"Sample_Customer_Data_{record_count}records_{timestamp}.{format}"
            
        elif dataset_type == "transaction_data":
            data = []
            for i in range(record_count):
                amount = round(random.uniform(10, 5000), 2)
                # Introduce negative amounts as quality issues
                if include_quality_issues and random.random() < 0.02:
                    amount = -amount
                
                record = {
                    "transaction_id": f"TXN{i+1:08d}",
                    "customer_id": f"CUST{random.randint(1, min(1000, record_count)):06d}",
                    "transaction_date": fake.date_time_between(start_date='-1y', end_date='now').isoformat(),
                    "amount": amount,
                    "currency": "USD",
                    "transaction_type": random.choice(["Purchase", "Refund", "Transfer", "Deposit", "Withdrawal"]),
                    "merchant": fake.company(),
                    "category": random.choice(["Groceries", "Gas", "Restaurants", "Shopping", "Entertainment"]),
                    "status": random.choice(["Completed", "Pending", "Failed"]),
                    "payment_method": random.choice(["Credit Card", "Debit Card", "Bank Transfer", "Cash"])
                }
                data.append(record)
            
            filename = f"Sample_Transaction_Data_{record_count}records_{timestamp}.{format}"
            
        else:  # product_data
            data = []
            for i in range(record_count):
                price = round(random.uniform(5, 1000), 2)
                # Introduce zero prices as quality issues
                if include_quality_issues and random.random() < 0.03:
                    price = 0
                
                record = {
                    "product_id": f"PROD{i+1:06d}",
                    "product_name": fake.catch_phrase(),
                    "category": random.choice(["Electronics", "Clothing", "Home", "Sports", "Books"]),
                    "price": price,
                    "currency": "USD",
                    "description": fake.text(max_nb_chars=200),
                    "manufacturer": fake.company(),
                    "weight": round(random.uniform(0.1, 50), 2),
                    "dimensions": f"{random.randint(1,50)}x{random.randint(1,50)}x{random.randint(1,50)} cm",
                    "in_stock": random.choice([True, False]),
                    "stock_quantity": random.randint(0, 1000),
                    "created_date": fake.date_between(start_date='-1y', end_date='today').isoformat(),
                    "last_updated": fake.date_between(start_date='-30d', end_date='today').isoformat()
                }
                data.append(record)
            
            filename = f"Sample_Product_Data_{record_count}records_{timestamp}.{format}"
        
        # Save file in requested format
        file_path = upload_dir / filename
        
        if format.lower() == "csv":
            with open(file_path, 'w', newline='') as f:
                if data:
                    writer = csv.DictWriter(f, fieldnames=data[0].keys())
                    writer.writeheader()
                    writer.writerows(data)
            content_type = "text/csv"
        else:  # JSON
            with open(file_path, 'w') as f:
                json.dump(data, f, indent=2)
            content_type = "application/json"
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="RegulatoryIntelligenceAgent",
            actor_type="agent",
            action="generate_sample_dataset",
            entity_type="Document",
            entity_id=filename,
            new_state={
                "dataset_type": dataset_type,
                "record_count": record_count,
                "format": format,
                "include_quality_issues": include_quality_issues,
                "file_size": file_path.stat().st_size
            }
        ))
        
        return {
            "filename": filename,
            "file_path": str(file_path),
            "download_url": f"/api/download/generated/{filename}",
            "content_type": content_type,
            "size": file_path.stat().st_size,
            "generated_at": datetime.now().isoformat(),
            "description": f"Sample {dataset_type.replace('_', ' ')} dataset with {record_count} records",
            "record_count": record_count,
            "includes_quality_issues": include_quality_issues
        }
    
    @tool
    def list_available_templates() -> dict:
        """
        List all available document templates and their descriptions.
        
        Returns:
            Dictionary of available templates organized by category
        """
        templates = {
            "regulatory_reports": {
                "fr_2052a": {
                    "name": "FR 2052A - Liquidity Coverage Ratio",
                    "description": "Federal Reserve liquidity coverage ratio reporting template",
                    "regulator": "Federal Reserve",
                    "frequency": "Quarterly",
                    "complexity": "High"
                },
                "ccar": {
                    "name": "CCAR Stress Testing",
                    "description": "Comprehensive Capital Analysis and Review templates",
                    "regulator": "Federal Reserve",
                    "frequency": "Annual",
                    "complexity": "Very High"
                }
            },
            "data_governance": {
                "data_quality_rules": {
                    "name": "Data Quality Rules Framework",
                    "description": "Comprehensive data quality monitoring and rules template",
                    "use_case": "Data quality management",
                    "complexity": "Medium"
                },
                "data_catalog": {
                    "name": "Data Catalog Template",
                    "description": "Template for cataloging and documenting data assets",
                    "use_case": "Data discovery and documentation",
                    "complexity": "Low"
                },
                "compliance_checklist": {
                    "name": "Regulatory Compliance Checklist",
                    "description": "Checklist template for regulatory compliance tracking",
                    "use_case": "Compliance management",
                    "complexity": "Medium"
                }
            },
            "sample_datasets": {
                "customer_data": {
                    "name": "Customer Master Data",
                    "description": "Sample customer records with demographic and account information",
                    "use_case": "Testing data governance processes",
                    "complexity": "Low"
                },
                "transaction_data": {
                    "name": "Transaction Data",
                    "description": "Sample financial transaction records",
                    "use_case": "Testing data quality rules and lineage",
                    "complexity": "Low"
                },
                "product_data": {
                    "name": "Product Catalog Data",
                    "description": "Sample product information and inventory data",
                    "use_case": "Testing data catalog and quality processes",
                    "complexity": "Low"
                }
            }
        }
        
        return {
            "available_templates": templates,
            "total_categories": len(templates),
            "total_templates": sum(len(category) for category in templates.values()),
            "usage_instructions": {
                "regulatory_reports": "Use generate_fr_2052a_template() for FR 2052A reports",
                "data_governance": "Use generate_data_governance_template() with appropriate template_type",
                "sample_datasets": "Use generate_sample_dataset() with desired dataset_type"
            }
        }
    
    return [
        generate_fr_2052a_template,
        generate_data_governance_template,
        generate_sample_dataset,
        list_available_templates
    ]
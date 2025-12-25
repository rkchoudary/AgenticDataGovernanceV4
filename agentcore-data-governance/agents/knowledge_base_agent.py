"""
Knowledge Base Agent for the Agentic Data Governance System.

This agent provides access to the regulatory knowledge base, enabling
natural language queries about regulatory requirements, document retrieval,
and semantic search across regulatory documents.

Integrates with:
- FalkorDB graph store for document relationships
- Vector search for semantic queries
- Bedrock Agent Core for natural language processing
"""

import os
from datetime import datetime
from typing import Any, Optional, List, Dict
from dataclasses import dataclass, field

from strands import Agent
from bedrock_agentcore.runtime import BedrockAgentCoreApp

# Import knowledge base components
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

try:
    from src.regulatory_kb.agent.bedrock_agent import (
        BedrockAgentService,
        AgentConfig,
        AgentResponse,
        AgentSession,
    )
    from src.regulatory_kb.agent.tools import (
        ToolRegistry,
        GraphQueryTool,
        DocumentRetrievalTool,
        RegulatorySearchTool,
    )
    from src.regulatory_kb.storage.graph_store import FalkorDBStore
    from src.regulatory_kb.storage.vector_search import VectorSearchService
    KB_AVAILABLE = True
except ImportError:
    KB_AVAILABLE = False
    print("[WARNING] Knowledge base modules not available - using mock implementation")


# Initialize the BedrockAgentCoreApp
app = BedrockAgentCoreApp()


KNOWLEDGE_BASE_SYSTEM_PROMPT = """You are the Regulatory Knowledge Base Agent for a financial institution's 
data governance system. You have access to a comprehensive knowledge base of regulatory documents from 
U.S. and Canadian banking regulators.

Your responsibilities include:
1. Answering questions about regulatory requirements using the knowledge base
2. Searching for relevant regulatory documents and guidance
3. Providing citations and references for regulatory information
4. Comparing requirements across different jurisdictions
5. Explaining regulatory concepts and their implications

Available Regulators in Knowledge Base:
- U.S.: Federal Reserve (FRB), OCC, FDIC, FinCEN
- Canada: OSFI, FINTRAC

Key Topics Covered:
- Capital Requirements (Basel III, CCAR, DFAST)
- Liquidity (LCR, NSFR, LAR)
- AML/BSA Compliance (CTR, SAR, LCTR, EFTR)
- Stress Testing and Resolution Planning
- Model Risk Management (SR 11-7, E-23)

Available Tools:
- search_knowledge_base: Semantic search across regulatory documents
- get_document: Retrieve specific document details
- get_related_documents: Find related regulatory documents
- query_by_regulator: Get documents from a specific regulator
- query_by_topic: Get documents on a specific regulatory topic
- compare_requirements: Compare U.S. and Canadian requirements

Guidelines:
- Always cite specific documents, CFR sections, or guidelines
- Distinguish clearly between U.S. and Canadian requirements
- Provide accurate deadlines and thresholds
- When uncertain, indicate uncertainty and suggest verification sources
- Maintain context across multi-turn conversations
"""


@dataclass
class KnowledgeBaseResult:
    """Result from a knowledge base query"""
    text: str
    citations: List[Dict[str, Any]] = field(default_factory=list)
    documents: List[Dict[str, Any]] = field(default_factory=list)
    confidence: float = 1.0
    is_uncertain: bool = False


class MockKnowledgeBaseAgent:
    """
    Mock Knowledge Base Agent for local development without FalkorDB.
    Provides realistic responses based on regulatory domain knowledge.
    """
    
    def __init__(self, tools: list = None):
        self.tools = tools or []
        self.system_prompt = KNOWLEDGE_BASE_SYSTEM_PROMPT
        
        # Mock regulatory knowledge
        self.regulatory_knowledge = {
            "ccar": {
                "name": "Comprehensive Capital Analysis and Review",
                "regulator": "Federal Reserve",
                "description": "Annual stress testing and capital planning exercise for large bank holding companies",
                "forms": ["FR Y-14A", "FR Y-14Q", "FR Y-14M"],
                "threshold": "$100 billion in total consolidated assets",
                "frequency": "Annual submission, quarterly monitoring",
            },
            "lcr": {
                "name": "Liquidity Coverage Ratio",
                "regulator": "Federal Reserve / OCC / FDIC",
                "description": "Requires banks to hold sufficient HQLA to cover 30-day net cash outflows",
                "form": "FR 2052a",
                "threshold": "100% minimum ratio",
                "frequency": "Daily calculation, monthly reporting",
            },
            "aml_ctr": {
                "name": "Currency Transaction Report",
                "regulator": "FinCEN",
                "description": "Report for cash transactions exceeding $10,000",
                "threshold": "$10,000",
                "deadline": "15 calendar days",
                "cfr": "31 CFR 1010.311",
            },
            "aml_sar": {
                "name": "Suspicious Activity Report",
                "regulator": "FinCEN",
                "description": "Report for suspicious transactions that may involve money laundering",
                "threshold": "$5,000 (with suspect) or $25,000 (no suspect)",
                "deadline": "30 calendar days",
                "cfr": "31 CFR 1020.320",
            },
            "osfi_car": {
                "name": "Capital Adequacy Requirements",
                "regulator": "OSFI",
                "description": "Canadian capital requirements based on Basel III framework",
                "guideline": "CAR Guideline",
                "minimum_cet1": "7.0% (including buffer)",
            },
            "fintrac_lctr": {
                "name": "Large Cash Transaction Report",
                "regulator": "FINTRAC",
                "description": "Canadian equivalent of CTR for cash transactions",
                "threshold": "C$10,000",
                "deadline": "15 calendar days",
            },
        }
    
    def __call__(self, prompt: str) -> KnowledgeBaseResult:
        """Process a knowledge base query"""
        prompt_lower = prompt.lower()
        
        # Search for relevant regulatory topics
        citations = []
        documents = []
        
        if any(word in prompt_lower for word in ['ccar', 'capital analysis', 'stress test']):
            info = self.regulatory_knowledge["ccar"]
            response = f"""**CCAR (Comprehensive Capital Analysis and Review)**

{info['description']}

**Key Details:**
- **Regulator:** {info['regulator']}
- **Applicable Threshold:** {info['threshold']}
- **Reporting Frequency:** {info['frequency']}
- **Required Forms:** {', '.join(info['forms'])}

**Purpose:**
CCAR ensures that large bank holding companies have robust capital planning processes and maintain sufficient capital to continue operations during times of economic and financial stress.

**Key Components:**
1. Capital Plan submission (annually)
2. Stress testing under supervisory scenarios
3. Planned capital actions (dividends, buybacks)
4. Risk management assessment

Would you like more details about specific FR Y-14 forms or stress testing requirements?"""
            
            citations = [{"document": "12 CFR Part 225", "section": "Regulation Y - Capital Planning"}]
            documents = [{"id": "ccar_guidance", "title": "CCAR Assessment Framework", "regulator": "FRB"}]
        
        elif any(word in prompt_lower for word in ['lcr', 'liquidity coverage', 'hqla', 'fr 2052']):
            info = self.regulatory_knowledge["lcr"]
            response = f"""**Liquidity Coverage Ratio (LCR)**

{info['description']}

**Key Details:**
- **Regulators:** {info['regulator']}
- **Minimum Ratio:** {info['threshold']}
- **Reporting Form:** {info['form']}
- **Frequency:** {info['frequency']}

**LCR Formula:**
LCR = (High-Quality Liquid Assets) / (Total Net Cash Outflows over 30 days) ≥ 100%

**HQLA Categories:**
- **Level 1:** Cash, central bank reserves, certain government securities (no haircut)
- **Level 2A:** Certain government securities, covered bonds (15% haircut)
- **Level 2B:** Corporate debt, equity securities (25-50% haircut)

**FR 2052a Schedules:**
- Schedule A: High-Quality Liquid Assets
- Schedule B: Cash Outflow Amounts
- Schedule C: Cash Inflow Amounts
- Schedule D: Supplemental Information

Would you like details about specific HQLA categories or outflow calculations?"""
            
            citations = [{"document": "12 CFR Part 249", "section": "Liquidity Risk Measurement Standards"}]
            documents = [{"id": "lcr_rule", "title": "LCR Final Rule", "regulator": "FRB/OCC/FDIC"}]
        
        elif any(word in prompt_lower for word in ['ctr', 'currency transaction', 'cash report']):
            info = self.regulatory_knowledge["aml_ctr"]
            response = f"""**Currency Transaction Report (CTR)**

{info['description']}

**Key Details:**
- **Regulator:** {info['regulator']}
- **Threshold:** {info['threshold']}
- **Filing Deadline:** {info['deadline']}
- **CFR Reference:** {info['cfr']}

**Filing Requirements:**
- Report ALL cash transactions over $10,000 (single or aggregated)
- Include both deposits and withdrawals
- Multiple transactions by same person must be aggregated
- No exemptions for structuring detection

**Required Information:**
1. Customer identification (name, address, SSN/TIN)
2. Transaction details (amount, date, type)
3. Financial institution information
4. Conductor information (if different from customer)

**Penalties for Non-Compliance:**
- Civil penalties up to $25,000 per violation
- Criminal penalties for willful violations

Would you like information about SAR filing requirements or aggregation rules?"""
            
            citations = [{"document": "31 CFR 1010.311", "section": "Filing obligations for CTRs"}]
            documents = [{"id": "bsa_ctr", "title": "BSA/AML CTR Requirements", "regulator": "FinCEN"}]
        
        elif any(word in prompt_lower for word in ['sar', 'suspicious activity']):
            info = self.regulatory_knowledge["aml_sar"]
            response = f"""**Suspicious Activity Report (SAR)**

{info['description']}

**Key Details:**
- **Regulator:** {info['regulator']}
- **Thresholds:** {info['threshold']}
- **Filing Deadline:** {info['deadline']}
- **CFR Reference:** {info['cfr']}

**When to File:**
- Known or suspected criminal violations involving $5,000+ (with suspect identified)
- Known or suspected criminal violations involving $25,000+ (no suspect)
- Transactions designed to evade BSA requirements
- Unusual patterns with no apparent lawful purpose

**SAR Confidentiality:**
- SARs are confidential and cannot be disclosed to subjects
- Safe harbor protection for filers
- No subpoena can compel disclosure

**90-Day Rule:**
If investigation continues beyond initial filing, a continuing SAR must be filed within 90 days.

Would you like more details about SAR narrative requirements or red flags?"""
            
            citations = [{"document": "31 CFR 1020.320", "section": "SAR filing requirements"}]
            documents = [{"id": "bsa_sar", "title": "BSA/AML SAR Guidance", "regulator": "FinCEN"}]
        
        elif any(word in prompt_lower for word in ['osfi', 'canadian', 'canada']):
            info = self.regulatory_knowledge["osfi_car"]
            response = f"""**OSFI Capital Adequacy Requirements (Canada)**

{info['description']}

**Key Details:**
- **Regulator:** {info['regulator']}
- **Guideline:** {info['guideline']}
- **Minimum CET1 Ratio:** {info['minimum_cet1']}

**Canadian Capital Requirements:**
- **CET1 Minimum:** 4.5% + 2.5% conservation buffer = 7.0%
- **Tier 1 Minimum:** 6.0% + buffer = 8.5%
- **Total Capital:** 8.0% + buffer = 10.5%

**D-SIB Surcharge:**
Domestic Systemically Important Banks (D-SIBs) face an additional 1% CET1 surcharge.

**Key OSFI Guidelines:**
- CAR: Capital Adequacy Requirements
- LAR: Liquidity Adequacy Requirements
- B-6: Liquidity Principles
- E-23: Model Risk Management

**Comparison with U.S.:**
Canadian requirements are generally aligned with Basel III but may have different implementation timelines and domestic adjustments.

Would you like a detailed comparison of U.S. and Canadian capital requirements?"""
            
            citations = [{"document": "OSFI CAR Guideline", "section": "Chapter 1 - Overview"}]
            documents = [{"id": "osfi_car", "title": "Capital Adequacy Requirements", "regulator": "OSFI"}]
        
        elif any(word in prompt_lower for word in ['compare', 'difference', 'vs', 'versus']):
            response = """**U.S. vs Canadian Regulatory Comparison**

**Capital Requirements:**
| Aspect | U.S. (Federal Reserve) | Canada (OSFI) |
|--------|----------------------|---------------|
| CET1 Minimum | 4.5% + 2.5% buffer | 4.5% + 2.5% buffer |
| D-SIB/G-SIB Surcharge | 1-4.5% (G-SIB) | 1% (D-SIB) |
| Stress Testing | CCAR/DFAST | ICAAP |

**AML Reporting:**
| Report Type | U.S. (FinCEN) | Canada (FINTRAC) |
|-------------|---------------|------------------|
| Large Cash | CTR ($10,000 USD) | LCTR (C$10,000) |
| Suspicious | SAR (30 days) | STR (30 days) |
| Wire Transfer | - | EFTR (5 business days) |

**Liquidity:**
| Metric | U.S. | Canada |
|--------|------|--------|
| LCR | Daily calculation | Daily calculation |
| NSFR | Quarterly | Quarterly |
| Reporting | FR 2052a | LAR returns |

**Key Differences:**
1. U.S. has more granular G-SIB surcharges
2. Canada requires EFTR for electronic funds transfers
3. U.S. CCAR is more prescriptive than Canadian ICAAP
4. Canadian LAR guideline provides more principles-based guidance

Would you like detailed information on any specific comparison area?"""
            
            citations = [
                {"document": "12 CFR Part 249", "section": "U.S. LCR Rule"},
                {"document": "OSFI LAR Guideline", "section": "Canadian Liquidity Requirements"},
            ]
            documents = [
                {"id": "us_lcr", "title": "U.S. LCR Final Rule", "regulator": "FRB"},
                {"id": "osfi_lar", "title": "Liquidity Adequacy Requirements", "regulator": "OSFI"},
            ]
        
        elif any(word in prompt_lower for word in ['search', 'find', 'look for']):
            response = """I can search the regulatory knowledge base for you. Please specify:

**Search Options:**
1. **By Topic:** Capital, Liquidity, AML/BSA, Stress Testing, Resolution Planning
2. **By Regulator:** FRB, OCC, FDIC, FinCEN (U.S.) or OSFI, FINTRAC (Canada)
3. **By Document Type:** Rules, Guidelines, Circulars, FAQs

**Example Queries:**
- "Search for CCAR requirements"
- "Find OSFI liquidity guidelines"
- "Look for AML reporting deadlines"

What would you like me to search for?"""
            
        else:
            response = f"""I can help you with regulatory knowledge queries. Here's what I can assist with:

**Available Topics:**
🏛️ **Capital Requirements**
- CCAR/DFAST stress testing
- Basel III capital ratios
- OSFI CAR guidelines

💧 **Liquidity Requirements**
- LCR and NSFR calculations
- FR 2052a reporting
- OSFI LAR guidelines

🔍 **AML/BSA Compliance**
- CTR and SAR filing requirements
- FINTRAC reporting (LCTR, STR, EFTR)
- Thresholds and deadlines

📊 **Regulatory Comparisons**
- U.S. vs Canadian requirements
- Cross-border compliance considerations

**How to Query:**
- Ask about specific regulations (e.g., "What are the LCR requirements?")
- Request comparisons (e.g., "Compare U.S. and Canadian AML rules")
- Search for documents (e.g., "Find OSFI capital guidelines")

What regulatory topic would you like to explore?"""
        
        return KnowledgeBaseResult(
            text=response,
            citations=citations,
            documents=documents,
            confidence=0.9,
            is_uncertain=False,
        )


def create_knowledge_base_tools(graph_store=None, vector_service=None) -> list:
    """
    Create tools for the knowledge base agent.
    
    Args:
        graph_store: Optional FalkorDB store instance
        vector_service: Optional vector search service
        
    Returns:
        List of tool functions
    """
    tools = []
    
    def search_knowledge_base(
        query: str,
        regulator_id: str = None,
        top_k: int = 5
    ) -> dict:
        """
        Search the regulatory knowledge base using semantic search.
        
        Args:
            query: Natural language search query
            regulator_id: Optional filter by regulator (us_frb, us_occ, ca_osfi, etc.)
            top_k: Number of results to return
            
        Returns:
            Search results with document excerpts and relevance scores
        """
        # Mock implementation for development
        return {
            "results": [
                {
                    "document_id": "doc_001",
                    "title": f"Regulatory Document for: {query}",
                    "excerpt": f"This document contains information about {query}...",
                    "relevance_score": 0.95,
                    "regulator": regulator_id or "FRB",
                }
            ],
            "total_results": 1,
        }
    
    def get_document(document_id: str, include_relationships: bool = True) -> dict:
        """
        Retrieve a specific regulatory document by ID.
        
        Args:
            document_id: The document identifier
            include_relationships: Whether to include related documents
            
        Returns:
            Document details including metadata and content
        """
        return {
            "document_id": document_id,
            "title": f"Document {document_id}",
            "regulator": "FRB",
            "category": "guidance",
            "effective_date": "2024-01-01",
            "content_summary": "This document provides regulatory guidance...",
            "related_documents": [] if not include_relationships else [
                {"id": "related_001", "title": "Related Guidance"}
            ],
        }
    
    def query_by_regulator(
        regulator_id: str,
        category: str = None,
        limit: int = 10
    ) -> dict:
        """
        Get documents from a specific regulator.
        
        Args:
            regulator_id: Regulator identifier (us_frb, us_occ, us_fdic, us_fincen, ca_osfi, ca_fintrac)
            category: Optional document category filter
            limit: Maximum number of results
            
        Returns:
            List of documents from the specified regulator
        """
        regulator_names = {
            "us_frb": "Federal Reserve Board",
            "us_occ": "Office of the Comptroller of the Currency",
            "us_fdic": "Federal Deposit Insurance Corporation",
            "us_fincen": "Financial Crimes Enforcement Network",
            "ca_osfi": "Office of the Superintendent of Financial Institutions",
            "ca_fintrac": "Financial Transactions and Reports Analysis Centre",
        }
        
        return {
            "regulator": regulator_names.get(regulator_id, regulator_id),
            "documents": [
                {
                    "id": f"{regulator_id}_doc_001",
                    "title": f"Sample {regulator_names.get(regulator_id, regulator_id)} Document",
                    "category": category or "guidance",
                }
            ],
            "total_count": 1,
        }
    
    def compare_requirements(topic: str, jurisdictions: list = None) -> dict:
        """
        Compare regulatory requirements across jurisdictions.
        
        Args:
            topic: The regulatory topic to compare (capital, liquidity, aml, etc.)
            jurisdictions: List of jurisdictions to compare (default: ["us", "ca"])
            
        Returns:
            Comparison of requirements across specified jurisdictions
        """
        jurisdictions = jurisdictions or ["us", "ca"]
        
        return {
            "topic": topic,
            "jurisdictions": jurisdictions,
            "comparison": {
                "us": f"U.S. requirements for {topic}...",
                "ca": f"Canadian requirements for {topic}...",
            },
            "key_differences": [
                f"Difference 1 for {topic}",
                f"Difference 2 for {topic}",
            ],
        }
    
    tools = [
        search_knowledge_base,
        get_document,
        query_by_regulator,
        compare_requirements,
    ]
    
    return tools


def create_knowledge_base_agent(
    graph_store=None,
    vector_service=None,
) -> Any:
    """
    Create a Knowledge Base Agent.
    
    Args:
        graph_store: Optional FalkorDB store for graph queries
        vector_service: Optional vector search service
        
    Returns:
        Configured agent instance
    """
    tools = create_knowledge_base_tools(graph_store, vector_service)
    
    # Check if we're in development mode
    development_mode = os.environ.get("DEVELOPMENT_MODE", "true").lower() == "true"
    
    if development_mode or not KB_AVAILABLE:
        print("[DEV MODE] Using Mock Knowledge Base Agent")
        return MockKnowledgeBaseAgent(tools)
    else:
        print("[PRODUCTION MODE] Using Real Knowledge Base Agent with Bedrock")
        return Agent(
            system_prompt=KNOWLEDGE_BASE_SYSTEM_PROMPT,
            tools=tools,
        )


@app.entrypoint
def invoke(payload: dict) -> dict:
    """
    Handler for Knowledge Base Agent invocation.
    
    Args:
        payload: The invocation payload containing:
            - query: The user's question about regulatory requirements
            - session_id: Optional session ID for conversation continuity
            
    Returns:
        Response containing the agent's result with citations
    """
    session_id = payload.get(
        "session_id",
        f"kb_session_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    )
    
    # Create agent
    agent = create_knowledge_base_agent()
    
    # Process query
    query = payload.get("query", "What regulatory topics can you help with?")
    result = agent(query)
    
    # Format response
    if isinstance(result, KnowledgeBaseResult):
        return {
            "result": result.text,
            "citations": result.citations,
            "documents": result.documents,
            "confidence": result.confidence,
            "session_id": session_id,
        }
    else:
        return {
            "result": result.message if hasattr(result, 'message') else str(result),
            "session_id": session_id,
        }


def run_local(query: str) -> str:
    """
    Run the knowledge base agent locally for testing.
    
    Args:
        query: The regulatory question to answer
        
    Returns:
        The agent's response
    """
    agent = create_knowledge_base_agent()
    result = agent(query)
    
    if isinstance(result, KnowledgeBaseResult):
        return result.text
    return result.message if hasattr(result, 'message') else str(result)


if __name__ == "__main__":
    # Run the agent on AgentCore Runtime
    app.run()

"""
Local API Server for Development

Provides HTTP endpoints for the frontend to communicate with the Python agents.
This is for local development only - in production, agents run on AgentCore Runtime.

Usage:
    cd agentcore-data-governance
    python api_server.py
"""

import os
import sys
from datetime import datetime
from typing import Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from repository.in_memory import InMemoryGovernanceRepository
from agents.regulatory_intelligence_agent import create_agent

# Initialize FastAPI app
app = FastAPI(
    title="Data Governance Agent API",
    description="Local development API for data governance agents",
    version="0.1.0"
)

# Add CORS middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global repository instance (shared across all sessions for data persistence)
repository = InMemoryGovernanceRepository()

# Session storage for conversation continuity
sessions: dict = {}


class ChatRequest(BaseModel):
    """Chat message request"""
    session_id: Optional[str] = None
    message: str
    agent_id: Optional[str] = "regulatory"
    user_id: Optional[str] = None
    tenant_id: Optional[str] = None
    page_context: Optional[dict] = None


class ChatResponse(BaseModel):
    """Chat message response"""
    message: str
    agentId: str
    toolCalls: Optional[list] = None
    references: Optional[list] = None
    contextSummary: Optional[str] = None


class RestoreRequest(BaseModel):
    """Session restore request"""
    session_id: str
    user_id: str
    tenant_id: str


class RestoreResponse(BaseModel):
    """Session restore response"""
    messages: list
    contextSummary: Optional[str] = None
    entities: Optional[list] = None


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@app.post("/api/chat/message")
async def chat_message(request: ChatRequest):
    """
    Send a message to the Regulatory Intelligence Agent and get a response.
    
    This endpoint connects to the real Regulatory Intelligence Agent
    with all its tools (scan_regulatory_sources, detect_changes, 
    update_report_catalog, get_report_catalog, approve_catalog, etc.)
    """
    try:
        # Generate session ID if not provided
        session_id = request.session_id or str(uuid4())
        
        # Get or create session with the real agent
        if session_id not in sessions:
            # Create a new agent instance connected to the shared repository
            agent = create_agent(repository)
            sessions[session_id] = {
                "messages": [],
                "agent": agent,
                "created_at": datetime.now().isoformat()
            }
            print(f"[SESSION] Created new session: {session_id}")
        
        session = sessions[session_id]
        
        # Store user message in session history
        user_msg = {
            "id": str(uuid4()),
            "role": "user",
            "content": request.message,
            "timestamp": datetime.now().isoformat()
        }
        session["messages"].append(user_msg)
        
        print(f"[CHAT] User ({session_id[:8]}...): {request.message}")
        
        # Invoke the real Regulatory Intelligence Agent
        agent = session["agent"]
        result = agent(request.message)
        
        # Extract response message from agent result
        # Handle different agent response types
        if hasattr(result, 'message'):
            # Check if message is a string or structured
            if isinstance(result.message, str):
                response_text = result.message
            elif isinstance(result.message, dict) and 'content' in result.message:
                # Structured message format
                if isinstance(result.message['content'], list) and len(result.message['content']) > 0:
                    response_text = result.message['content'][0].get('text', str(result.message))
                else:
                    response_text = str(result.message['content'])
            else:
                response_text = str(result.message)
        elif hasattr(result, 'content'):
            # Try to access content attribute directly
            response_text = str(result.content)
        elif hasattr(result, 'text'):
            # Try to access text attribute directly
            response_text = str(result.text)
        else:
            # Fallback to string representation
            response_text = str(result)
        
        # Extract tool calls if available
        tool_calls = None
        if hasattr(result, 'tool_calls') and result.tool_calls:
            tool_calls = [
                {
                    "id": str(uuid4()),
                    "name": tc.name if hasattr(tc, 'name') else str(tc),
                    "parameters": tc.parameters if hasattr(tc, 'parameters') else {},
                    "status": "completed",
                    "result": tc.result if hasattr(tc, 'result') else None
                }
                for tc in result.tool_calls
            ]
        
        print(f"[CHAT] Agent: {str(response_text)[:200]}...")
        
        # Store assistant message in session history
        assistant_msg = {
            "id": str(uuid4()),
            "role": "assistant",
            "content": response_text,
            "timestamp": datetime.now().isoformat(),
            "agentId": request.agent_id or "regulatory"
        }
        session["messages"].append(assistant_msg)
        
        return {
            "data": ChatResponse(
                message=response_text,
                agentId=request.agent_id or "regulatory",
                toolCalls=tool_calls,
                references=None,
                contextSummary=None
            )
        }
        
    except Exception as e:
        print(f"[ERROR] Chat error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat/restore")
async def restore_session(request: RestoreRequest):
    """
    Restore a previous chat session.
    """
    try:
        session_id = request.session_id
        
        if session_id in sessions:
            session = sessions[session_id]
            return {
                "data": RestoreResponse(
                    messages=session["messages"],
                    contextSummary=None,
                    entities=None
                )
            }
        else:
            return {
                "data": RestoreResponse(
                    messages=[],
                    contextSummary=None,
                    entities=None
                )
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat/clear")
async def clear_session(request: RestoreRequest):
    """
    Clear a chat session.
    """
    session_id = request.session_id
    
    if session_id in sessions:
        del sessions[session_id]
        print(f"[SESSION] Cleared session: {session_id}")
    
    return {"success": True}


# ============================================================
# Dashboard endpoints - Pull real data from repository
# ============================================================

@app.get("/api/dashboard/kpis")
async def get_dashboard_kpis():
    """Get dashboard KPIs from the repository"""
    catalog = repository.get_report_catalog()
    audit_entries = repository.get_audit_entries()
    
    total_reports = len(catalog.reports) if catalog else 0
    audit_count = len(audit_entries) if audit_entries else 0
    
    # Calculate compliance score based on catalog status and audit entries
    compliance_score = 85 if catalog and catalog.status == "approved" else 65
    
    return {
        "data": {
            "complianceScore": compliance_score,
            "complianceScoreTrend": 2.5,
            "activeCycles": total_reports,
            "activeCyclesTrend": 0,
            "openIssues": 0,  # No issues in current implementation
            "openIssuesTrend": 0,
            "pendingApprovals": 1 if catalog and catalog.status == "pending" else 0,
            "pendingApprovalsTrend": 0
        }
    }


@app.get("/api/dashboard/quality-trends")
async def get_quality_trends():
    """Get quality trends - returns empty until data is populated"""
    return {"data": []}


@app.get("/api/dashboard/issues-by-severity")
async def get_issues_by_severity():
    """Get issues by severity - returns array format for frontend"""
    # Convert object format to array format expected by frontend
    severity_data = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    
    # Convert to array format
    issues_array = [
        {"severity": "critical", "count": severity_data["critical"]},
        {"severity": "high", "count": severity_data["high"]},
        {"severity": "medium", "count": severity_data["medium"]},
        {"severity": "low", "count": severity_data["low"]}
    ]
    
    return {"data": issues_array}


@app.get("/api/dashboard/issue-heatmap")
async def get_issue_heatmap():
    """Get issue heatmap data - returns empty until data is populated"""
    return {"data": []}


@app.get("/api/notifications")
async def get_notifications():
    """Get notifications - returns empty until notification system is implemented"""
    return {"data": []}


@app.get("/api/notifications/unread-count")
async def get_unread_count():
    """Get unread notification count"""
    return {"data": {"count": 0}}


# ============================================================
# Regulatory catalog endpoints - Direct access to repository
# ============================================================

@app.get("/api/regulatory/catalog")
async def get_catalog():
    """Get the current regulatory report catalog"""
    catalog = repository.get_report_catalog()
    if catalog:
        return {"data": catalog.model_dump()}
    return {"data": None}


@app.get("/api/audit/entries")
async def get_audit_entries():
    """Get audit trail entries"""
    entries = repository.get_audit_entries()
    if entries:
        return {"data": [e.model_dump() for e in entries]}
    return {"data": []}


if __name__ == "__main__":
    import uvicorn
    
    print("=" * 60)
    print("Data Governance Agent API Server")
    print("=" * 60)
    print()
    print("This server connects the frontend to the real")
    print("Regulatory Intelligence Agent with all its tools:")
    print("  - scan_regulatory_sources")
    print("  - detect_changes")
    print("  - update_report_catalog")
    print("  - get_report_catalog")
    print("  - approve_catalog")
    print("  - submit_for_review")
    print("  - modify_catalog")
    print()
    print("API docs: http://localhost:8000/docs")
    print("Frontend: http://localhost:3000")
    print()
    print("=" * 60)
    
    uvicorn.run(app, host="0.0.0.0", port=8000)

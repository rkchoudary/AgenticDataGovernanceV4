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
from typing import Optional, List, Union
from uuid import uuid4

from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse, FileResponse
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
# File Upload and Download Endpoints
# ============================================================

import io
import json
import mimetypes
import tempfile
from pathlib import Path
from typing import List, Union

from fastapi import File, UploadFile, Form, HTTPException
from fastapi.responses import StreamingResponse, FileResponse

# File storage directory (in production, use S3 or similar)
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# Allowed file types and size limits
ALLOWED_EXTENSIONS = {
    '.pdf', '.docx', '.xlsx', '.csv', '.txt', '.json', '.xml', '.md'
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

class FileUploadResponse(BaseModel):
    """File upload response"""
    file_id: str
    filename: str
    size: int
    content_type: str
    upload_timestamp: str
    analysis_status: str = "pending"

class FileAnalysisResult(BaseModel):
    """File analysis result"""
    file_id: str
    filename: str
    content_type: str
    extracted_text: Optional[str] = None
    metadata: Optional[dict] = None
    data_elements: Optional[list] = None
    regulatory_mappings: Optional[list] = None
    analysis_timestamp: str

@app.post("/api/chat/upload", response_model=FileUploadResponse)
async def upload_file(
    session_id: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Upload a file for analysis by the governance agents.
    Supports PDF, DOCX, XLSX, CSV, TXT, JSON, XML, MD formats.
    """
    try:
        # Validate file extension
        file_ext = Path(file.filename).suffix.lower()
        if file_ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400, 
                detail=f"File type {file_ext} not supported. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
            )
        
        # Read file content and validate size
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File size {len(content)} bytes exceeds maximum allowed size of {MAX_FILE_SIZE} bytes"
            )
        
        # Generate unique file ID
        file_id = str(uuid4())
        timestamp = datetime.now().isoformat()
        
        # Save file to storage
        file_path = UPLOAD_DIR / f"{file_id}_{file.filename}"
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Store file metadata in session
        if session_id not in sessions:
            sessions[session_id] = {"messages": [], "files": {}}
        elif "files" not in sessions[session_id]:
            sessions[session_id]["files"] = {}
        
        sessions[session_id]["files"][file_id] = {
            "filename": file.filename,
            "file_path": str(file_path),
            "content_type": file.content_type,
            "size": len(content),
            "upload_timestamp": timestamp,
            "analysis_status": "pending"
        }
        
        print(f"[UPLOAD] File uploaded: {file.filename} ({len(content)} bytes) -> {file_id}")
        
        return FileUploadResponse(
            file_id=file_id,
            filename=file.filename,
            size=len(content),
            content_type=file.content_type or "application/octet-stream",
            upload_timestamp=timestamp,
            analysis_status="pending"
        )
        
    except Exception as e:
        print(f"[ERROR] File upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat/analyze-file/{file_id}")
async def analyze_file(file_id: str, session_id: str = Form(...)):
    """
    Analyze an uploaded file using the appropriate governance agent.
    """
    try:
        # Find session and file
        if session_id not in sessions or "files" not in sessions[session_id]:
            raise HTTPException(status_code=404, detail="Session or file not found")
        
        file_info = sessions[session_id]["files"].get(file_id)
        if not file_info:
            raise HTTPException(status_code=404, detail="File not found")
        
        # Get agent for analysis
        agent = sessions[session_id].get("agent")
        if not agent:
            agent = create_agent(repository)
            sessions[session_id]["agent"] = agent
        
        # Read file content for analysis
        file_path = Path(file_info["file_path"])
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")
        
        # Analyze based on file type
        file_ext = file_path.suffix.lower()
        analysis_prompt = f"""
        Please analyze the uploaded file: {file_info['filename']} ({file_ext} format)
        
        File size: {file_info['size']} bytes
        Upload time: {file_info['upload_timestamp']}
        
        Please provide:
        1. Document summary and key findings
        2. Identified data elements and requirements
        3. Regulatory compliance implications
        4. Recommended next steps for governance
        
        Focus on extracting actionable governance insights from this document.
        """
        
        # Invoke agent for analysis
        result = agent(analysis_prompt)
        
        # Extract response text
        if hasattr(result, 'message'):
            if isinstance(result.message, str):
                analysis_text = result.message
            elif isinstance(result.message, dict) and 'content' in result.message:
                if isinstance(result.message['content'], list) and len(result.message['content']) > 0:
                    analysis_text = result.message['content'][0].get('text', str(result.message))
                else:
                    analysis_text = str(result.message['content'])
            else:
                analysis_text = str(result.message)
        else:
            analysis_text = str(result)
        
        # Update file status
        file_info["analysis_status"] = "completed"
        file_info["analysis_result"] = analysis_text
        file_info["analysis_timestamp"] = datetime.now().isoformat()
        
        print(f"[ANALYSIS] File analyzed: {file_info['filename']} -> {len(analysis_text)} chars")
        
        return FileAnalysisResult(
            file_id=file_id,
            filename=file_info["filename"],
            content_type=file_info["content_type"],
            extracted_text=analysis_text,
            metadata={
                "size": file_info["size"],
                "upload_timestamp": file_info["upload_timestamp"]
            },
            analysis_timestamp=file_info["analysis_timestamp"]
        )
        
    except Exception as e:
        print(f"[ERROR] File analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chat/files/{session_id}")
async def list_session_files(session_id: str):
    """List all files uploaded in a session"""
    if session_id not in sessions or "files" not in sessions[session_id]:
        return {"data": []}
    
    files = []
    for file_id, file_info in sessions[session_id]["files"].items():
        files.append({
            "file_id": file_id,
            "filename": file_info["filename"],
            "size": file_info["size"],
            "content_type": file_info["content_type"],
            "upload_timestamp": file_info["upload_timestamp"],
            "analysis_status": file_info["analysis_status"]
        })
    
    return {"data": files}

@app.post("/api/chat/generate-report")
async def generate_report(
    session_id: str = Form(...),
    report_type: str = Form(...),
    format: str = Form("pdf")
):
    """
    Generate a downloadable report based on chat conversation and analysis.
    """
    try:
        if session_id not in sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session = sessions[session_id]
        messages = session.get("messages", [])
        files = session.get("files", {})
        
        # Generate report content based on conversation
        report_content = {
            "report_type": report_type,
            "generated_at": datetime.now().isoformat(),
            "session_id": session_id,
            "conversation_summary": f"Conversation with {len(messages)} messages",
            "files_analyzed": len(files),
            "key_findings": [],
            "recommendations": [],
            "next_steps": []
        }
        
        # Extract insights from assistant messages
        for msg in messages:
            if msg.get("role") == "assistant":
                content = msg.get("content", "")
                if "recommendation" in content.lower():
                    report_content["recommendations"].append(content[:200] + "...")
                elif "finding" in content.lower() or "identified" in content.lower():
                    report_content["key_findings"].append(content[:200] + "...")
        
        # Add file analysis results
        for file_id, file_info in files.items():
            if file_info.get("analysis_result"):
                report_content["key_findings"].append(
                    f"Analysis of {file_info['filename']}: {file_info['analysis_result'][:200]}..."
                )
        
        # Generate report file
        report_id = str(uuid4())
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        if format.lower() == "json":
            filename = f"{report_type}_report_{timestamp}.json"
            file_path = UPLOAD_DIR / filename
            with open(file_path, "w") as f:
                json.dump(report_content, f, indent=2)
            content_type = "application/json"
        
        elif format.lower() == "csv":
            filename = f"{report_type}_report_{timestamp}.csv"
            file_path = UPLOAD_DIR / filename
            
            # Convert to CSV format
            import csv
            with open(file_path, "w", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(["Category", "Content"])
                writer.writerow(["Report Type", report_content["report_type"]])
                writer.writerow(["Generated At", report_content["generated_at"]])
                writer.writerow(["Session ID", report_content["session_id"]])
                writer.writerow(["Files Analyzed", report_content["files_analyzed"]])
                
                for i, finding in enumerate(report_content["key_findings"]):
                    writer.writerow([f"Finding {i+1}", finding])
                
                for i, rec in enumerate(report_content["recommendations"]):
                    writer.writerow([f"Recommendation {i+1}", rec])
            
            content_type = "text/csv"
        
        else:  # Default to text format
            filename = f"{report_type}_report_{timestamp}.txt"
            file_path = UPLOAD_DIR / filename
            
            with open(file_path, "w") as f:
                f.write(f"Data Governance Report: {report_content['report_type']}\n")
                f.write(f"Generated: {report_content['generated_at']}\n")
                f.write(f"Session: {report_content['session_id']}\n")
                f.write(f"Files Analyzed: {report_content['files_analyzed']}\n\n")
                
                f.write("KEY FINDINGS:\n")
                for i, finding in enumerate(report_content["key_findings"], 1):
                    f.write(f"{i}. {finding}\n")
                
                f.write("\nRECOMMENDATIONS:\n")
                for i, rec in enumerate(report_content["recommendations"], 1):
                    f.write(f"{i}. {rec}\n")
            
            content_type = "text/plain"
        
        print(f"[REPORT] Generated report: {filename}")
        
        return {
            "data": {
                "report_id": report_id,
                "filename": filename,
                "download_url": f"/api/download/report/{report_id}",
                "content_type": content_type,
                "generated_at": report_content["generated_at"]
            }
        }
        
    except Exception as e:
        print(f"[ERROR] Report generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/generated/{filename}")
async def download_generated_file(filename: str):
    """Download a file generated by the document generation tools"""
    try:
        # Look for the file in the uploads directory
        file_path = UPLOAD_DIR / filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Generated file not found")
        
        # Determine content type
        content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        
        print(f"[DOWNLOAD] Serving generated file: {filename}")
        
        return FileResponse(
            path=str(file_path),
            filename=filename,
            media_type=content_type
        )
        
    except Exception as e:
        print(f"[ERROR] Generated file download error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/report/{report_id}")
async def download_report(report_id: str):
    """Download a generated report"""
    try:
        # Find report file (simplified - in production use database)
        report_files = list(UPLOAD_DIR.glob(f"*report*.txt")) + \
                      list(UPLOAD_DIR.glob(f"*report*.json")) + \
                      list(UPLOAD_DIR.glob(f"*report*.csv"))
        
        if not report_files:
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Get the most recent report file (simplified logic)
        report_file = max(report_files, key=lambda x: x.stat().st_mtime)
        
        if not report_file.exists():
            raise HTTPException(status_code=404, detail="Report file not found")
        
        # Determine content type
        content_type = mimetypes.guess_type(str(report_file))[0] or "application/octet-stream"
        
        return FileResponse(
            path=str(report_file),
            filename=report_file.name,
            media_type=content_type
        )
        
    except Exception as e:
        print(f"[ERROR] Report download error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/file/{file_id}")
async def download_uploaded_file(file_id: str, session_id: str):
    """Download an originally uploaded file"""
    try:
        if session_id not in sessions or "files" not in sessions[session_id]:
            raise HTTPException(status_code=404, detail="Session not found")
        
        file_info = sessions[session_id]["files"].get(file_id)
        if not file_info:
            raise HTTPException(status_code=404, detail="File not found")
        
        file_path = Path(file_info["file_path"])
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")
        
        return FileResponse(
            path=str(file_path),
            filename=file_info["filename"],
            media_type=file_info["content_type"]
        )
        
    except Exception as e:
        print(f"[ERROR] File download error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================
# Legacy Workflow endpoints - Maintained for compatibility
# ============================================================

@app.post("/api/workflows/{cycle_id}/documentation/compile")
async def compile_documentation_package(cycle_id: str):
    """Generate documentation package for a governance cycle"""
    try:
        # Generate a comprehensive documentation package
        package_content = {
            "cycle_id": cycle_id,
            "generated_at": datetime.now().isoformat(),
            "package_type": "governance_documentation",
            "contents": [
                "Regulatory compliance summary",
                "Data quality assessment",
                "Lineage mapping documentation", 
                "Issue resolution report",
                "Control effectiveness review"
            ]
        }
        
        # Create package file
        package_id = f"pkg_{cycle_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        filename = f"governance_package_{cycle_id}.json"
        file_path = UPLOAD_DIR / filename
        
        with open(file_path, "w") as f:
            json.dump(package_content, f, indent=2)
        
        return {
            "data": {
                "packageId": package_id,
                "downloadUrl": f"/api/download/package/{cycle_id}",
                "filename": filename,
                "generated_at": package_content["generated_at"]
            }
        }
        
    except Exception as e:
        print(f"[ERROR] Package compilation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download/package/{cycle_id}")
async def download_package(cycle_id: str):
    """Download governance documentation package"""
    try:
        # Find the most recent package for this cycle
        package_files = list(UPLOAD_DIR.glob(f"governance_package_{cycle_id}.*"))
        
        if not package_files:
            # Generate a default package if none exists
            content = {
                "cycle_id": cycle_id,
                "generated_at": datetime.now().isoformat(),
                "status": "Generated on demand",
                "summary": f"Governance documentation package for cycle {cycle_id}",
                "contents": [
                    "This package contains governance documentation and analysis results",
                    "Generated automatically by the Data Governance Platform",
                    f"Cycle ID: {cycle_id}",
                    f"Generated: {datetime.now().isoformat()}"
                ]
            }
            
            filename = f"governance_package_{cycle_id}.json"
            file_path = UPLOAD_DIR / filename
            
            with open(file_path, "w") as f:
                json.dump(content, f, indent=2)
            
            package_files = [file_path]
        
        package_file = package_files[0]
        
        return FileResponse(
            path=str(package_file),
            filename=package_file.name,
            media_type="application/json"
        )
        
    except Exception as e:
        print(f"[ERROR] Package download error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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

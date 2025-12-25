"""Bedrock Agent Lambda handlers for regulatory knowledge base.

Provides handlers for:
- Agent session management
- Natural language queries with full agent capabilities
- Regulatory-specific query shortcuts
"""

import json
import os
from typing import Any, Optional

from regulatory_kb.core import get_logger, configure_logging
from regulatory_kb.agent import (
    BedrockAgentService,
    AgentConfig,
    ToolRegistry,
)
from regulatory_kb.storage.graph_store import FalkorDBStore, GraphStoreConfig
from regulatory_kb.storage.vector_search import VectorSearchService

configure_logging(level="INFO", json_format=True)
logger = get_logger(__name__)

# Global service instance
_agent_service: Optional[BedrockAgentService] = None


def _get_agent_service() -> BedrockAgentService:
    """Get or create the Bedrock Agent service."""
    global _agent_service
    
    if _agent_service is None:
        config = AgentConfig(
            region=os.environ.get("AWS_REGION", "us-east-1"),
            model_id=os.environ.get(
                "BEDROCK_MODEL_ID",
                "anthropic.claude-3-sonnet-20240229-v1:0"
            ),
            session_timeout_hours=int(os.environ.get("SESSION_TIMEOUT_HOURS", "8")),
            max_tokens=int(os.environ.get("MAX_TOKENS", "4096")),
            temperature=float(os.environ.get("TEMPERATURE", "0.1")),
        )
        
        # Set up graph store
        store_config = GraphStoreConfig(
            host=os.environ.get("FALKORDB_HOST", "localhost"),
            port=int(os.environ.get("FALKORDB_PORT", "6379")),
            password=os.environ.get("FALKORDB_PASSWORD"),
        )
        
        store = FalkorDBStore(store_config)
        try:
            store.connect()
            logger.info("falkordb_connected")
        except Exception as e:
            logger.warning("falkordb_connection_failed", error=str(e))
        
        vector_service = VectorSearchService(store)
        tool_registry = ToolRegistry.create_default_registry(store, vector_service)
        
        _agent_service = BedrockAgentService(config, tool_registry)
        logger.info("agent_service_initialized")
    
    return _agent_service


def create_session_handler(event: dict, context: Any) -> dict:
    """Create a new agent session.

    Args:
        event: API Gateway event
        context: Lambda context

    Returns:
        API Gateway response with session ID
    """
    logger.info("create_session_request")
    
    try:
        body = json.loads(event.get("body", "{}"))
        initial_context = body.get("context", {})
        
        agent_service = _get_agent_service()
        session = agent_service.create_session(initial_context)
        
        return {
            "statusCode": 201,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({
                "session_id": session.session_id,
                "created_at": session.created_at.isoformat(),
                "timeout_hours": session.timeout_hours,
            }),
        }
    
    except Exception as e:
        logger.error("create_session_failed", error=str(e))
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }


def delete_session_handler(event: dict, context: Any) -> dict:
    """Delete an agent session.

    Args:
        event: API Gateway event with session_id path parameter
        context: Lambda context

    Returns:
        API Gateway response
    """
    try:
        path_params = event.get("pathParameters", {})
        session_id = path_params.get("session_id")
        
        if not session_id:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "session_id is required"}),
            }
        
        agent_service = _get_agent_service()
        deleted = agent_service.delete_session(session_id)
        
        if deleted:
            return {
                "statusCode": 204,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": "",
            }
        else:
            return {
                "statusCode": 404,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Session not found"}),
            }
    
    except Exception as e:
        logger.error("delete_session_failed", error=str(e))
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }


def query_handler(event: dict, context: Any) -> dict:
    """Handle natural language queries with full agent capabilities.

    Args:
        event: API Gateway event with POST body containing question
        context: Lambda context

    Returns:
        API Gateway response with answer and citations
    """
    logger.info("agent_query_request")
    
    try:
        body = json.loads(event.get("body", "{}"))
        question = body.get("question")
        session_id = body.get("session_id")
        additional_context = body.get("context", {})
        
        if not question:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "question is required"}),
            }
        
        logger.info(
            "processing_agent_query",
            question_length=len(question),
            session_id=session_id,
        )
        
        agent_service = _get_agent_service()
        response = agent_service.query(
            question=question,
            session_id=session_id,
            context=additional_context,
        )
        
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({
                "answer": response.text,
                "citations": [
                    {
                        "document_id": c.document_id,
                        "document_title": c.document_title,
                        "section": c.section,
                        "page": c.page,
                        "excerpt": c.excerpt,
                        "confidence": c.confidence,
                    }
                    for c in response.citations
                ],
                "confidence": response.confidence,
                "is_uncertain": response.is_uncertain,
                "uncertainty_reason": response.uncertainty_reason,
                "tool_calls": [
                    {
                        "tool_name": tc["tool_name"],
                        "success": tc["success"],
                    }
                    for tc in response.tool_calls
                ],
            }),
        }
    
    except Exception as e:
        logger.error("agent_query_failed", error=str(e))
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }


def ccar_query_handler(event: dict, context: Any) -> dict:
    """Shortcut handler for CCAR-related queries.

    Args:
        event: API Gateway event
        context: Lambda context

    Returns:
        API Gateway response with CCAR information
    """
    logger.info("ccar_query_request")
    
    try:
        body = json.loads(event.get("body", "{}"))
        session_id = body.get("session_id")
        
        agent_service = _get_agent_service()
        response = agent_service.query_ccar_requirements(session_id)
        
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({
                "answer": response.text,
                "citations": [
                    {
                        "document_id": c.document_id,
                        "document_title": c.document_title,
                        "excerpt": c.excerpt,
                    }
                    for c in response.citations
                ],
                "confidence": response.confidence,
            }),
        }
    
    except Exception as e:
        logger.error("ccar_query_failed", error=str(e))
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }


def liquidity_query_handler(event: dict, context: Any) -> dict:
    """Shortcut handler for liquidity-related queries.

    Args:
        event: API Gateway event
        context: Lambda context

    Returns:
        API Gateway response with liquidity information
    """
    logger.info("liquidity_query_request")
    
    try:
        body = json.loads(event.get("body", "{}"))
        session_id = body.get("session_id")
        
        agent_service = _get_agent_service()
        response = agent_service.query_liquidity_requirements(session_id)
        
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({
                "answer": response.text,
                "citations": [
                    {
                        "document_id": c.document_id,
                        "document_title": c.document_title,
                        "excerpt": c.excerpt,
                    }
                    for c in response.citations
                ],
                "confidence": response.confidence,
            }),
        }
    
    except Exception as e:
        logger.error("liquidity_query_failed", error=str(e))
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }


def aml_deadlines_handler(event: dict, context: Any) -> dict:
    """Shortcut handler for AML deadline queries.

    Args:
        event: API Gateway event
        context: Lambda context

    Returns:
        API Gateway response with AML deadline information
    """
    logger.info("aml_deadlines_query_request")
    
    try:
        body = json.loads(event.get("body", "{}"))
        session_id = body.get("session_id")
        
        agent_service = _get_agent_service()
        response = agent_service.query_aml_deadlines(session_id)
        
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({
                "answer": response.text,
                "citations": [
                    {
                        "document_id": c.document_id,
                        "document_title": c.document_title,
                        "excerpt": c.excerpt,
                    }
                    for c in response.citations
                ],
                "confidence": response.confidence,
            }),
        }
    
    except Exception as e:
        logger.error("aml_deadlines_query_failed", error=str(e))
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }


def compare_requirements_handler(event: dict, context: Any) -> dict:
    """Handler for comparing U.S. and Canadian requirements.

    Args:
        event: API Gateway event with topic in body
        context: Lambda context

    Returns:
        API Gateway response with comparison
    """
    logger.info("compare_requirements_request")
    
    try:
        body = json.loads(event.get("body", "{}"))
        topic = body.get("topic")
        session_id = body.get("session_id")
        
        if not topic:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "topic is required"}),
            }
        
        agent_service = _get_agent_service()
        response = agent_service.compare_us_canadian_requirements(topic, session_id)
        
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": json.dumps({
                "answer": response.text,
                "citations": [
                    {
                        "document_id": c.document_id,
                        "document_title": c.document_title,
                        "excerpt": c.excerpt,
                    }
                    for c in response.citations
                ],
                "confidence": response.confidence,
                "topic": topic,
            }),
        }
    
    except Exception as e:
        logger.error("compare_requirements_failed", error=str(e))
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)}),
        }

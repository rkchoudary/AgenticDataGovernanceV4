"""Webhook Lambda handlers for subscription management and delivery.

Implements Requirements 13.7:
- Webhook notifications when high-priority documents are updated
"""

import json
import os
from typing import Any, Optional

from regulatory_kb.core import get_logger, configure_logging
from regulatory_kb.api import (
    AuthService,
    AuthConfig,
    Permission,
    AuditLogger,
)
from regulatory_kb.api.webhooks import (
    WebhookService,
    WebhookEventType,
    WebhookStatus,
)

configure_logging(level="INFO", json_format=True)
logger = get_logger(__name__)

# Global service instances
_webhook_service: Optional[WebhookService] = None
_auth_service: Optional[AuthService] = None
_audit_logger: Optional[AuditLogger] = None


def _get_webhook_service() -> WebhookService:
    """Get or create the webhook service."""
    global _webhook_service
    
    if _webhook_service is None:
        _webhook_service = WebhookService(
            signing_secret=os.environ.get("WEBHOOK_SIGNING_SECRET", "webhook-secret"),
            max_retries=int(os.environ.get("WEBHOOK_MAX_RETRIES", "5")),
            delivery_timeout=int(os.environ.get("WEBHOOK_TIMEOUT", "30")),
        )
    
    return _webhook_service


def _get_auth_service() -> AuthService:
    """Get or create the auth service."""
    global _auth_service
    
    if _auth_service is None:
        config = AuthConfig(
            secret_key=os.environ.get("API_SECRET_KEY", "default-secret-key"),
        )
        _auth_service = AuthService(config)
    
    return _auth_service


def _get_audit_logger() -> AuditLogger:
    """Get or create the audit logger."""
    global _audit_logger
    
    if _audit_logger is None:
        _audit_logger = AuditLogger()
    
    return _audit_logger


def _authenticate_request(event: dict) -> tuple[bool, Optional[str], dict]:
    """Authenticate an API request."""
    headers = event.get("headers") or {}
    auth_service = _get_auth_service()
    
    if os.environ.get("DISABLE_AUTH", "false").lower() == "true":
        return True, "anonymous", {}
    
    result = auth_service.authenticate_request(headers, Permission.ADMIN)
    
    if not result.success:
        return False, None, {
            "statusCode": 401,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": result.error}),
        }
    
    return True, result.user_id, {}


def _build_response(status_code: int, body: Any) -> dict:
    """Build an API Gateway response."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body) if not isinstance(body, str) else body,
    }


def subscription_handler(event: dict, context: Any) -> dict:
    """Handle webhook subscription management.

    Routes:
    - POST /webhooks/subscriptions - Create subscription
    - GET /webhooks/subscriptions - List subscriptions
    - GET /webhooks/subscriptions/{id} - Get subscription
    - PUT /webhooks/subscriptions/{id} - Update subscription
    - DELETE /webhooks/subscriptions/{id} - Delete subscription

    Args:
        event: API Gateway event
        context: Lambda context

    Returns:
        API Gateway response
    """
    logger.info("webhook_subscription_request", method=event.get("httpMethod"))

    # Authenticate
    is_auth, client_id, auth_error = _authenticate_request(event)
    if not is_auth:
        return auth_error

    try:
        method = event.get("httpMethod", "GET")
        path_params = event.get("pathParameters") or {}
        subscription_id = path_params.get("id")
        
        webhook_service = _get_webhook_service()

        if method == "POST":
            # Create subscription
            body = json.loads(event.get("body", "{}"))
            
            url = body.get("url")
            if not url:
                return _build_response(400, {"error": "url is required"})
            
            events = body.get("events", [])
            event_types = []
            for e in events:
                try:
                    event_types.append(WebhookEventType(e))
                except ValueError:
                    return _build_response(400, {"error": f"Invalid event type: {e}"})
            
            if not event_types:
                return _build_response(400, {"error": "At least one event type is required"})
            
            subscription = webhook_service.create_subscription(
                url=url,
                events=event_types,
                regulator_filter=body.get("regulator_filter"),
                category_filter=body.get("category_filter"),
                metadata=body.get("metadata"),
            )
            
            return _build_response(201, {
                "subscription": {
                    "id": subscription.id,
                    "url": subscription.url,
                    "secret": subscription.secret,
                    "events": [e.value for e in subscription.events],
                    "is_active": subscription.is_active,
                    "created_at": subscription.created_at.isoformat(),
                }
            })

        elif method == "GET":
            if subscription_id:
                # Get single subscription
                subscription = webhook_service.get_subscription(subscription_id)
                if not subscription:
                    return _build_response(404, {"error": "Subscription not found"})
                
                return _build_response(200, {
                    "subscription": {
                        "id": subscription.id,
                        "url": subscription.url,
                        "events": [e.value for e in subscription.events],
                        "is_active": subscription.is_active,
                        "created_at": subscription.created_at.isoformat(),
                        "regulator_filter": subscription.regulator_filter,
                        "category_filter": subscription.category_filter,
                    }
                })
            else:
                # List subscriptions
                subscriptions = webhook_service.list_subscriptions()
                return _build_response(200, {
                    "subscriptions": [
                        {
                            "id": s.id,
                            "url": s.url,
                            "events": [e.value for e in s.events],
                            "is_active": s.is_active,
                            "created_at": s.created_at.isoformat(),
                        }
                        for s in subscriptions
                    ]
                })

        elif method == "PUT":
            if not subscription_id:
                return _build_response(400, {"error": "Subscription ID required"})
            
            body = json.loads(event.get("body", "{}"))
            
            events = None
            if "events" in body:
                events = []
                for e in body["events"]:
                    try:
                        events.append(WebhookEventType(e))
                    except ValueError:
                        return _build_response(400, {"error": f"Invalid event type: {e}"})
            
            subscription = webhook_service.update_subscription(
                subscription_id=subscription_id,
                url=body.get("url"),
                events=events,
                is_active=body.get("is_active"),
                regulator_filter=body.get("regulator_filter"),
                category_filter=body.get("category_filter"),
            )
            
            if not subscription:
                return _build_response(404, {"error": "Subscription not found"})
            
            return _build_response(200, {
                "subscription": {
                    "id": subscription.id,
                    "url": subscription.url,
                    "events": [e.value for e in subscription.events],
                    "is_active": subscription.is_active,
                }
            })

        elif method == "DELETE":
            if not subscription_id:
                return _build_response(400, {"error": "Subscription ID required"})
            
            deleted = webhook_service.delete_subscription(subscription_id)
            if not deleted:
                return _build_response(404, {"error": "Subscription not found"})
            
            return _build_response(200, {"deleted": True})

        else:
            return _build_response(405, {"error": f"Method {method} not allowed"})

    except json.JSONDecodeError as e:
        return _build_response(400, {"error": f"Invalid JSON: {str(e)}"})
    except Exception as e:
        logger.error("webhook_subscription_error", error=str(e))
        return _build_response(500, {"error": str(e)})


def delivery_handler(event: dict, context: Any) -> dict:
    """Handle webhook delivery management.

    Routes:
    - GET /webhooks/deliveries - List deliveries
    - GET /webhooks/deliveries/{id} - Get delivery
    - POST /webhooks/deliveries/{id}/retry - Retry delivery
    - GET /webhooks/stats - Get delivery statistics
    - GET /webhooks/dead-letter - Get dead letter queue
    - POST /webhooks/dead-letter/{id}/retry - Retry from dead letter

    Args:
        event: API Gateway event
        context: Lambda context

    Returns:
        API Gateway response
    """
    logger.info("webhook_delivery_request", method=event.get("httpMethod"))

    # Authenticate
    is_auth, client_id, auth_error = _authenticate_request(event)
    if not is_auth:
        return auth_error

    try:
        method = event.get("httpMethod", "GET")
        path = event.get("path", "")
        path_params = event.get("pathParameters") or {}
        query_params = event.get("queryStringParameters") or {}
        
        webhook_service = _get_webhook_service()

        # Stats endpoint
        if "/stats" in path:
            stats = webhook_service.get_delivery_stats()
            return _build_response(200, {"stats": stats})

        # Dead letter queue endpoints
        if "/dead-letter" in path:
            delivery_id = path_params.get("id")
            
            if method == "GET" and not delivery_id:
                # List dead letter queue
                dlq = webhook_service.get_dead_letter_queue()
                return _build_response(200, {
                    "dead_letter_queue": [
                        {
                            "id": d.id,
                            "subscription_id": d.subscription_id,
                            "event_type": d.event_type.value,
                            "attempts": d.attempts,
                            "last_error": d.last_error,
                            "created_at": d.created_at.isoformat(),
                        }
                        for d in dlq
                    ]
                })
            
            elif method == "POST" and delivery_id and "/retry" in path:
                # Retry from dead letter
                delivery = webhook_service.retry_dead_letter(delivery_id)
                if not delivery:
                    return _build_response(404, {"error": "Delivery not found in dead letter queue"})
                
                # Attempt delivery
                success = webhook_service.deliver_sync(delivery)
                
                return _build_response(200, {
                    "delivery": {
                        "id": delivery.id,
                        "status": delivery.status.value,
                        "success": success,
                    }
                })

        # Regular delivery endpoints
        delivery_id = path_params.get("id")

        if method == "GET":
            if delivery_id:
                # Get single delivery
                delivery = webhook_service.get_delivery(delivery_id)
                if not delivery:
                    return _build_response(404, {"error": "Delivery not found"})
                
                return _build_response(200, {
                    "delivery": {
                        "id": delivery.id,
                        "subscription_id": delivery.subscription_id,
                        "event_type": delivery.event_type.value,
                        "status": delivery.status.value,
                        "attempts": delivery.attempts,
                        "last_error": delivery.last_error,
                        "response_status": delivery.response_status,
                        "created_at": delivery.created_at.isoformat(),
                        "delivered_at": delivery.delivered_at.isoformat() if delivery.delivered_at else None,
                    }
                })
            else:
                # List deliveries
                subscription_id = query_params.get("subscription_id")
                status = query_params.get("status")
                limit = int(query_params.get("limit", "100"))
                
                status_filter = None
                if status:
                    try:
                        status_filter = WebhookStatus(status)
                    except ValueError:
                        pass
                
                deliveries = webhook_service.list_deliveries(
                    subscription_id=subscription_id,
                    status=status_filter,
                    limit=limit,
                )
                
                return _build_response(200, {
                    "deliveries": [
                        {
                            "id": d.id,
                            "subscription_id": d.subscription_id,
                            "event_type": d.event_type.value,
                            "status": d.status.value,
                            "attempts": d.attempts,
                            "created_at": d.created_at.isoformat(),
                        }
                        for d in deliveries
                    ]
                })

        elif method == "POST" and delivery_id and "/retry" in path:
            # Retry delivery
            delivery = webhook_service.get_delivery(delivery_id)
            if not delivery:
                return _build_response(404, {"error": "Delivery not found"})
            
            if delivery.status == WebhookStatus.DELIVERED:
                return _build_response(400, {"error": "Delivery already succeeded"})
            
            # Reset and retry
            delivery.status = WebhookStatus.PENDING
            delivery.attempts = 0
            success = webhook_service.deliver_sync(delivery)
            
            return _build_response(200, {
                "delivery": {
                    "id": delivery.id,
                    "status": delivery.status.value,
                    "success": success,
                }
            })

        else:
            return _build_response(405, {"error": f"Method {method} not allowed"})

    except Exception as e:
        logger.error("webhook_delivery_error", error=str(e))
        return _build_response(500, {"error": str(e)})


def event_trigger_handler(event: dict, context: Any) -> dict:
    """Handle internal event triggers for webhook dispatch.

    This handler is triggered by internal events (e.g., from SQS or EventBridge)
    to dispatch webhooks when documents are created/updated.

    Args:
        event: Event containing document update information
        context: Lambda context

    Returns:
        Processing result
    """
    logger.info("webhook_event_trigger", event_type=event.get("event_type"))

    try:
        webhook_service = _get_webhook_service()
        
        event_type = event.get("event_type")
        data = event.get("data", {})
        
        if event_type == "document.created":
            deliveries = webhook_service.dispatch_document_created(
                document_id=data.get("document_id", ""),
                title=data.get("title", ""),
                regulator_id=data.get("regulator_id", ""),
                categories=data.get("categories", []),
                metadata=data.get("metadata"),
            )
        
        elif event_type == "document.updated":
            deliveries = webhook_service.dispatch_document_updated(
                document_id=data.get("document_id", ""),
                title=data.get("title", ""),
                regulator_id=data.get("regulator_id", ""),
                categories=data.get("categories", []),
                changes=data.get("changes"),
                is_high_priority=data.get("is_high_priority", False),
            )
        
        elif event_type == "deadline.approaching":
            deliveries = webhook_service.dispatch_deadline_approaching(
                deadline_type=data.get("deadline_type", ""),
                deadline_date=data.get("deadline_date", ""),
                document_id=data.get("document_id", ""),
                document_title=data.get("document_title", ""),
                days_remaining=data.get("days_remaining", 0),
            )
        
        # Upload event types (Implements Requirements 3.6, 6.5)
        elif event_type == "upload.processing.completed":
            deliveries = webhook_service.dispatch_upload_processing_completed(
                upload_id=data.get("upload_id", ""),
                kb_document_id=data.get("kb_document_id", ""),
                title=data.get("title"),
                regulator=data.get("regulator"),
                categories=data.get("categories", []),
                chunk_count=data.get("chunk_count", 0),
                validation_score=data.get("validation_score", 0.0),
                uploader_id=data.get("uploader_id"),
            )
        
        elif event_type == "upload.processing.failed":
            deliveries = webhook_service.dispatch_upload_processing_failed(
                upload_id=data.get("upload_id", ""),
                error_message=data.get("error_message", ""),
                error_stage=data.get("error_stage", ""),
                uploader_id=data.get("uploader_id"),
                file_name=data.get("file_name"),
            )
        
        elif event_type == "upload.document.replaced":
            deliveries = webhook_service.dispatch_document_replaced(
                new_document_id=data.get("new_document_id", ""),
                previous_document_id=data.get("previous_document_id", ""),
                title=data.get("title", ""),
                regulator=data.get("regulator"),
                version_number=data.get("version_number", 1),
                uploader_id=data.get("uploader_id"),
            )
        
        else:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": f"Unknown event type: {event_type}"}),
            }
        
        # Deliver webhooks
        results = []
        for delivery in deliveries:
            success = webhook_service.deliver_sync(delivery)
            results.append({
                "delivery_id": delivery.id,
                "success": success,
                "status": delivery.status.value,
            })
        
        return {
            "statusCode": 200,
            "body": json.dumps({
                "event_type": event_type,
                "deliveries": len(deliveries),
                "results": results,
            }),
        }

    except Exception as e:
        logger.error("webhook_event_trigger_error", error=str(e))
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }

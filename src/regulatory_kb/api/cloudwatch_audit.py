"""CloudWatch-based audit logging for regulatory compliance.

Implements Requirements 7.2, 7.3, 7.5:
- Log all upload actions with uploader identity
- Log document modifications with before/after states
- Store logs in CloudWatch with 7-year retention
"""

import json
import os
from datetime import datetime, timezone
from typing import Any, Optional

import boto3
from botocore.exceptions import ClientError

from regulatory_kb.core import get_logger
from regulatory_kb.api.audit import AuditEvent, AuditEventType, AuditLogger

logger = get_logger(__name__)

# 7 years in days (Requirement 7.5)
RETENTION_DAYS = 2557


class CloudWatchAuditLogger(AuditLogger):
    """CloudWatch-based audit logger for regulatory compliance.
    
    Extends the base AuditLogger to persist audit events to CloudWatch Logs
    with 7-year retention for regulatory compliance.
    
    Implements Requirements 7.2, 7.3, 7.5:
    - Logs all upload actions with uploader identity
    - Logs document modifications with before/after states
    - Stores logs in CloudWatch with 7-year retention
    """
    
    def __init__(
        self,
        log_group_name: Optional[str] = None,
        log_stream_prefix: str = "upload-audit",
        region: Optional[str] = None,
        cloudwatch_client: Optional[Any] = None,
    ):
        """Initialize the CloudWatch audit logger.
        
        Args:
            log_group_name: CloudWatch log group name.
            log_stream_prefix: Prefix for log stream names.
            region: AWS region.
            cloudwatch_client: Optional CloudWatch client (for testing).
        """
        super().__init__()
        
        self.log_group_name = log_group_name or os.environ.get(
            "AUDIT_LOG_GROUP", "/regulatory-kb/upload-audit"
        )
        self.log_stream_prefix = log_stream_prefix
        self.region = region or os.environ.get("AWS_REGION", "us-east-1")
        self._cloudwatch_client = cloudwatch_client
        self._log_stream_name: Optional[str] = None
        self._sequence_token: Optional[str] = None
        self._initialized = False
    
    @property
    def cloudwatch_client(self):
        """Get CloudWatch Logs client."""
        if self._cloudwatch_client is None:
            self._cloudwatch_client = boto3.client(
                "logs",
                region_name=self.region,
            )
        return self._cloudwatch_client
    
    def _ensure_initialized(self) -> None:
        """Ensure log group and stream are created."""
        if self._initialized:
            return
        
        try:
            # Create log group if it doesn't exist
            self._create_log_group()
            
            # Create log stream for today
            self._create_log_stream()
            
            self._initialized = True
        except ClientError as e:
            logger.error("cloudwatch_init_failed", error=str(e))
            # Continue without CloudWatch - fall back to in-memory logging
    
    def _create_log_group(self) -> None:
        """Create CloudWatch log group with retention policy."""
        try:
            self.cloudwatch_client.create_log_group(
                logGroupName=self.log_group_name,
            )
            logger.info("log_group_created", log_group=self.log_group_name)
        except ClientError as e:
            if e.response["Error"]["Code"] != "ResourceAlreadyExistsException":
                raise
        
        # Set retention policy (7 years = 2557 days)
        try:
            self.cloudwatch_client.put_retention_policy(
                logGroupName=self.log_group_name,
                retentionInDays=RETENTION_DAYS,
            )
            logger.info(
                "retention_policy_set",
                log_group=self.log_group_name,
                retention_days=RETENTION_DAYS,
            )
        except ClientError as e:
            logger.warning("retention_policy_failed", error=str(e))
    
    def _create_log_stream(self) -> None:
        """Create CloudWatch log stream for current date."""
        today = datetime.now(timezone.utc).strftime("%Y/%m/%d")
        self._log_stream_name = f"{self.log_stream_prefix}/{today}"
        
        try:
            self.cloudwatch_client.create_log_stream(
                logGroupName=self.log_group_name,
                logStreamName=self._log_stream_name,
            )
            logger.info(
                "log_stream_created",
                log_group=self.log_group_name,
                log_stream=self._log_stream_name,
            )
        except ClientError as e:
            if e.response["Error"]["Code"] != "ResourceAlreadyExistsException":
                raise
            # Stream exists, get sequence token
            self._get_sequence_token()
    
    def _get_sequence_token(self) -> None:
        """Get the sequence token for the log stream."""
        try:
            response = self.cloudwatch_client.describe_log_streams(
                logGroupName=self.log_group_name,
                logStreamNamePrefix=self._log_stream_name,
                limit=1,
            )
            streams = response.get("logStreams", [])
            if streams:
                self._sequence_token = streams[0].get("uploadSequenceToken")
        except ClientError as e:
            logger.warning("get_sequence_token_failed", error=str(e))
    
    def log(self, event: AuditEvent) -> None:
        """Log an audit event to CloudWatch and in-memory.
        
        Args:
            event: The audit event to log.
        """
        # Always log to in-memory storage (parent class)
        super().log(event)
        
        # Also log to CloudWatch
        self._log_to_cloudwatch(event)
    
    def _log_to_cloudwatch(self, event: AuditEvent) -> None:
        """Log an event to CloudWatch Logs.
        
        Args:
            event: The audit event to log.
        """
        try:
            self._ensure_initialized()
            
            if not self._log_stream_name:
                return
            
            # Prepare log event
            log_event = {
                "timestamp": int(event.timestamp.timestamp() * 1000),
                "message": event.to_json(),
            }
            
            # Put log event
            kwargs = {
                "logGroupName": self.log_group_name,
                "logStreamName": self._log_stream_name,
                "logEvents": [log_event],
            }
            
            if self._sequence_token:
                kwargs["sequenceToken"] = self._sequence_token
            
            response = self.cloudwatch_client.put_log_events(**kwargs)
            self._sequence_token = response.get("nextSequenceToken")
            
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            
            if error_code == "InvalidSequenceTokenException":
                # Get correct sequence token and retry
                self._sequence_token = e.response["Error"].get("expectedSequenceToken")
                self._log_to_cloudwatch(event)
            elif error_code == "DataAlreadyAcceptedException":
                # Log already accepted, update sequence token
                self._sequence_token = e.response["Error"].get("expectedSequenceToken")
            else:
                logger.error("cloudwatch_log_failed", error=str(e))
    
    def query_cloudwatch_events(
        self,
        start_time: datetime,
        end_time: datetime,
        filter_pattern: Optional[str] = None,
        limit: int = 100,
    ) -> list[AuditEvent]:
        """Query audit events from CloudWatch Logs.
        
        Implements Requirement 7.4:
        - Support querying audit logs
        
        Args:
            start_time: Start of time range.
            end_time: End of time range.
            filter_pattern: CloudWatch Logs filter pattern.
            limit: Maximum events to return.
            
        Returns:
            List of matching audit events.
        """
        try:
            kwargs = {
                "logGroupName": self.log_group_name,
                "startTime": int(start_time.timestamp() * 1000),
                "endTime": int(end_time.timestamp() * 1000),
                "limit": limit,
            }
            
            if filter_pattern:
                kwargs["filterPattern"] = filter_pattern
            
            response = self.cloudwatch_client.filter_log_events(**kwargs)
            
            events = []
            for log_event in response.get("events", []):
                try:
                    event_data = json.loads(log_event["message"])
                    event = AuditEvent(
                        event_id=event_data.get("event_id", ""),
                        event_type=AuditEventType(event_data.get("event_type", "document.view")),
                        timestamp=datetime.fromisoformat(event_data.get("timestamp", "")),
                        client_id=event_data.get("client_id"),
                        user_id=event_data.get("user_id"),
                        ip_address=event_data.get("ip_address"),
                        user_agent=event_data.get("user_agent"),
                        request_id=event_data.get("request_id"),
                        resource_type=event_data.get("resource_type"),
                        resource_id=event_data.get("resource_id"),
                        action=event_data.get("action"),
                        status=event_data.get("status", "success"),
                        status_code=event_data.get("status_code", 200),
                        duration_ms=event_data.get("duration_ms"),
                        request_path=event_data.get("request_path"),
                        request_method=event_data.get("request_method"),
                        query_params=event_data.get("query_params", {}),
                        response_size=event_data.get("response_size"),
                        error_message=event_data.get("error_message"),
                        metadata=event_data.get("metadata", {}),
                    )
                    events.append(event)
                except (json.JSONDecodeError, ValueError) as e:
                    logger.warning("parse_log_event_failed", error=str(e))
            
            return events
            
        except ClientError as e:
            logger.error("cloudwatch_query_failed", error=str(e))
            return []
    
    def build_filter_pattern(
        self,
        uploader_id: Optional[str] = None,
        document_id: Optional[str] = None,
        event_type: Optional[str] = None,
    ) -> str:
        """Build a CloudWatch Logs filter pattern.
        
        Args:
            uploader_id: Filter by uploader ID.
            document_id: Filter by document ID.
            event_type: Filter by event type.
            
        Returns:
            CloudWatch Logs filter pattern string.
        """
        patterns = []
        
        if uploader_id:
            patterns.append(f'{{ $.client_id = "{uploader_id}" }}')
        
        if document_id:
            patterns.append(f'{{ $.resource_id = "{document_id}" }}')
        
        if event_type:
            patterns.append(f'{{ $.event_type = "{event_type}" }}')
        
        if not patterns:
            return ""
        
        # Combine patterns with AND
        if len(patterns) == 1:
            return patterns[0]
        
        return " && ".join(patterns)

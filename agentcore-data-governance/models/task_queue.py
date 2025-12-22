"""
Task Queue data models for background processing.

This module defines Pydantic models for task queue operations,
supporting both AWS SQS and Azure Service Bus.

Requirements: 39.1, 39.2, 39.3, 39.4, 39.5
"""

from datetime import datetime
from enum import Enum
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field
from uuid import uuid4


class TaskPriority(str, Enum):
    """Task priority levels for queue ordering."""
    
    CRITICAL = "critical"  # Immediate processing
    HIGH = "high"          # Process before normal
    NORMAL = "normal"      # Standard processing
    LOW = "low"            # Process when idle


class TaskStatus(str, Enum):
    """Status of a queued task."""
    
    PENDING = "pending"        # Waiting in queue
    PROCESSING = "processing"  # Currently being processed
    COMPLETED = "completed"    # Successfully completed
    FAILED = "failed"          # Failed after retries
    DEAD_LETTER = "dead_letter"  # Moved to DLQ
    CANCELLED = "cancelled"    # Cancelled by user


class TaskType(str, Enum):
    """Types of background tasks."""
    
    AGENT_INVOCATION = "agent_invocation"
    REPORT_GENERATION = "report_generation"
    DATA_QUALITY_CHECK = "data_quality_check"
    LINEAGE_SCAN = "lineage_scan"
    NOTIFICATION = "notification"
    AUDIT_EXPORT = "audit_export"
    TENANT_PROVISIONING = "tenant_provisioning"
    CLEANUP = "cleanup"
    CUSTOM = "custom"


class RetryPolicy(BaseModel):
    """Configuration for task retry behavior."""
    
    max_retries: int = Field(default=3, ge=0, le=10)
    initial_delay_seconds: int = Field(default=1, ge=1)
    max_delay_seconds: int = Field(default=300, ge=1)
    backoff_multiplier: float = Field(default=2.0, ge=1.0, le=10.0)
    
    def get_delay_for_attempt(self, attempt: int) -> int:
        """
        Calculate delay for a given retry attempt using exponential backoff.
        
        Args:
            attempt: The retry attempt number (0-indexed)
            
        Returns:
            Delay in seconds
        """
        delay = self.initial_delay_seconds * (self.backoff_multiplier ** attempt)
        return min(int(delay), self.max_delay_seconds)


class TaskMessage(BaseModel):
    """A task message to be queued for processing."""
    
    id: str = Field(default_factory=lambda: str(uuid4()))
    task_type: TaskType
    priority: TaskPriority = TaskPriority.NORMAL
    payload: dict[str, Any] = Field(default_factory=dict)
    
    # Scheduling
    delay_seconds: int = Field(default=0, ge=0)
    scheduled_at: Optional[datetime] = None
    
    # Metadata
    tenant_id: Optional[str] = None
    correlation_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    created_by: Optional[str] = None
    
    # Retry configuration
    retry_policy: RetryPolicy = Field(default_factory=RetryPolicy)
    
    # Tags for filtering/routing
    tags: dict[str, str] = Field(default_factory=dict)


class TaskResult(BaseModel):
    """Result of processing a task."""
    
    task_id: str
    status: TaskStatus
    result: Optional[Any] = None
    error_message: Optional[str] = None
    error_details: Optional[dict[str, Any]] = None
    
    # Timing
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    
    # Retry info
    attempt_number: int = 0
    next_retry_at: Optional[datetime] = None


class TaskProgress(BaseModel):
    """Progress information for a running task."""
    
    task_id: str
    status: TaskStatus
    progress_percent: int = Field(default=0, ge=0, le=100)
    current_step: Optional[str] = None
    total_steps: Optional[int] = None
    completed_steps: Optional[int] = None
    estimated_completion: Optional[datetime] = None
    last_updated: datetime = Field(default_factory=datetime.now)
    metadata: dict[str, Any] = Field(default_factory=dict)


class QueueStats(BaseModel):
    """Statistics for a task queue."""
    
    queue_name: str
    approximate_message_count: int = 0
    approximate_not_visible_count: int = 0  # In-flight messages
    approximate_delayed_count: int = 0
    oldest_message_age_seconds: Optional[int] = None
    
    # Processing stats
    messages_sent_last_hour: int = 0
    messages_received_last_hour: int = 0
    messages_deleted_last_hour: int = 0
    
    # DLQ stats
    dlq_message_count: int = 0
    
    last_updated: datetime = Field(default_factory=datetime.now)


class DeadLetterMessage(BaseModel):
    """A message that has been moved to the dead-letter queue."""
    
    id: str = Field(default_factory=lambda: str(uuid4()))
    original_task: TaskMessage
    failure_reason: str
    failure_details: Optional[dict[str, Any]] = None
    attempt_count: int
    first_failure_at: datetime
    last_failure_at: datetime = Field(default_factory=datetime.now)
    
    # Original queue info
    source_queue: str
    
    # For manual retry
    can_retry: bool = True
    retry_count: int = 0


class QueueConfig(BaseModel):
    """Configuration for a task queue."""
    
    name: str
    provider: Literal["aws", "azure"] = "aws"
    
    # Queue settings
    visibility_timeout_seconds: int = Field(default=30, ge=0, le=43200)
    message_retention_days: int = Field(default=14, ge=1, le=14)
    max_message_size_kb: int = Field(default=256, ge=1, le=256)
    
    # DLQ settings
    enable_dlq: bool = True
    dlq_max_receive_count: int = Field(default=3, ge=1, le=1000)
    
    # Priority queue settings
    enable_priority: bool = True
    priority_levels: int = Field(default=4, ge=1, le=10)
    
    # Encryption
    encryption_enabled: bool = True
    encryption_key_id: Optional[str] = None
    
    # Tags
    tags: dict[str, str] = Field(default_factory=dict)


class WorkerConfig(BaseModel):
    """Configuration for a task queue worker."""
    
    worker_id: str = Field(default_factory=lambda: str(uuid4()))
    queue_name: str
    
    # Processing settings
    max_concurrent_tasks: int = Field(default=10, ge=1, le=100)
    poll_interval_seconds: int = Field(default=1, ge=1, le=60)
    visibility_timeout_seconds: int = Field(default=30, ge=0, le=43200)
    
    # Batch settings
    batch_size: int = Field(default=10, ge=1, le=10)
    
    # Health check
    heartbeat_interval_seconds: int = Field(default=30, ge=10, le=300)
    
    # Shutdown
    graceful_shutdown_timeout_seconds: int = Field(default=30, ge=0, le=300)


class ScalingConfig(BaseModel):
    """Auto-scaling configuration for task queue workers."""
    
    enabled: bool = True
    
    # Scaling bounds
    min_workers: int = Field(default=1, ge=0, le=100)
    max_workers: int = Field(default=10, ge=1, le=1000)
    
    # Scale-up triggers
    scale_up_queue_depth_threshold: int = Field(default=100, ge=1)
    scale_up_latency_threshold_ms: int = Field(default=5000, ge=100)
    scale_up_cooldown_seconds: int = Field(default=60, ge=30)
    
    # Scale-down triggers
    scale_down_queue_depth_threshold: int = Field(default=10, ge=0)
    scale_down_idle_seconds: int = Field(default=300, ge=60)
    scale_down_cooldown_seconds: int = Field(default=300, ge=60)
    
    # Step scaling
    scale_up_increment: int = Field(default=2, ge=1, le=10)
    scale_down_increment: int = Field(default=1, ge=1, le=10)

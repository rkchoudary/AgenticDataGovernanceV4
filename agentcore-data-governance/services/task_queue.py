"""
Task Queue Service for background processing.

This module provides a cloud-agnostic task queue abstraction with
implementations for AWS SQS and Azure Service Bus.

Requirements: 39.1, 39.2, 39.3, 39.4, 39.5
- 39.1: Durable message queues with at-least-once delivery
- 39.2: Priority queues, delayed execution, retry with exponential backoff
- 39.3: Task status API, progress percentage, estimated completion time
- 39.4: Dead-letter queue after max retries with alerting
- 39.5: Auto-scale based on queue depth and processing latency
"""

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import Any, Callable, Optional, Protocol, runtime_checkable
from uuid import uuid4

from models.task_queue import (
    DeadLetterMessage,
    QueueConfig,
    QueueStats,
    ScalingConfig,
    TaskMessage,
    TaskPriority,
    TaskProgress,
    TaskResult,
    TaskStatus,
    WorkerConfig,
)

logger = logging.getLogger(__name__)


# ============================================
# Task Queue Protocol
# ============================================

@runtime_checkable
class TaskQueueProvider(Protocol):
    """
    Protocol for task queue providers.
    
    Implementations must provide methods for sending, receiving,
    and managing tasks in a durable message queue.
    
    Requirements: 39.1
    """
    
    def create_queue(self, config: QueueConfig) -> str:
        """
        Create a new task queue.
        
        Args:
            config: Queue configuration
            
        Returns:
            Queue URL/identifier
        """
        ...
    
    def delete_queue(self, queue_name: str) -> bool:
        """
        Delete a task queue.
        
        Args:
            queue_name: Name of the queue to delete
            
        Returns:
            True if deleted successfully
        """
        ...
    
    def send_task(
        self,
        queue_name: str,
        task: TaskMessage,
    ) -> str:
        """
        Send a task to the queue.
        
        Args:
            queue_name: Target queue name
            task: Task message to send
            
        Returns:
            Message ID
        """
        ...
    
    def receive_tasks(
        self,
        queue_name: str,
        max_messages: int = 10,
        visibility_timeout: int = 30,
        wait_time_seconds: int = 20,
    ) -> list[tuple[str, TaskMessage]]:
        """
        Receive tasks from the queue.
        
        Args:
            queue_name: Source queue name
            max_messages: Maximum messages to receive
            visibility_timeout: Time before message becomes visible again
            wait_time_seconds: Long polling wait time
            
        Returns:
            List of (receipt_handle, task) tuples
        """
        ...
    
    def delete_task(self, queue_name: str, receipt_handle: str) -> bool:
        """
        Delete a task from the queue (acknowledge completion).
        
        Args:
            queue_name: Queue name
            receipt_handle: Receipt handle from receive
            
        Returns:
            True if deleted successfully
        """
        ...
    
    def change_visibility(
        self,
        queue_name: str,
        receipt_handle: str,
        visibility_timeout: int,
    ) -> bool:
        """
        Change the visibility timeout of a message.
        
        Args:
            queue_name: Queue name
            receipt_handle: Receipt handle
            visibility_timeout: New visibility timeout
            
        Returns:
            True if changed successfully
        """
        ...
    
    def get_queue_stats(self, queue_name: str) -> QueueStats:
        """
        Get queue statistics.
        
        Args:
            queue_name: Queue name
            
        Returns:
            Queue statistics
        """
        ...
    
    def get_dlq_messages(
        self,
        queue_name: str,
        max_messages: int = 10,
    ) -> list[DeadLetterMessage]:
        """
        Get messages from the dead-letter queue.
        
        Args:
            queue_name: Main queue name (DLQ is derived)
            max_messages: Maximum messages to retrieve
            
        Returns:
            List of dead-letter messages
        """
        ...
    
    def retry_dlq_message(
        self,
        queue_name: str,
        message_id: str,
    ) -> bool:
        """
        Retry a message from the dead-letter queue.
        
        Args:
            queue_name: Main queue name
            message_id: Message ID to retry
            
        Returns:
            True if requeued successfully
        """
        ...


# ============================================
# AWS SQS Adapter
# ============================================

class AWSSQSAdapter(TaskQueueProvider):
    """
    AWS SQS implementation of the task queue provider.
    
    Supports standard and FIFO queues with priority via
    multiple queues or message attributes.
    
    Requirements: 39.1, 39.2
    """
    
    def __init__(self, region: str = "us-west-2"):
        """
        Initialize the SQS adapter.
        
        Args:
            region: AWS region
        """
        self.region = region
        self._queues: dict[str, dict[str, Any]] = {}
        self._messages: dict[str, list[dict[str, Any]]] = {}
        self._dlq_messages: dict[str, list[DeadLetterMessage]] = {}
        self._visibility: dict[str, dict[str, datetime]] = {}
        
        # In production, this would use boto3
        # import boto3
        # self.sqs = boto3.client('sqs', region_name=region)
    
    def create_queue(self, config: QueueConfig) -> str:
        """Create an SQS queue."""
        queue_url = f"https://sqs.{self.region}.amazonaws.com/123456789012/{config.name}"
        
        self._queues[config.name] = {
            "url": queue_url,
            "config": config,
            "created_at": datetime.now(),
        }
        self._messages[config.name] = []
        self._dlq_messages[config.name] = []
        self._visibility[config.name] = {}
        
        # Create DLQ if enabled
        if config.enable_dlq:
            dlq_name = f"{config.name}-dlq"
            dlq_url = f"https://sqs.{self.region}.amazonaws.com/123456789012/{dlq_name}"
            self._queues[dlq_name] = {
                "url": dlq_url,
                "config": config,
                "is_dlq": True,
                "created_at": datetime.now(),
            }
            self._messages[dlq_name] = []
        
        logger.info(f"Created SQS queue: {config.name}")
        return queue_url
    
    def delete_queue(self, queue_name: str) -> bool:
        """Delete an SQS queue."""
        if queue_name in self._queues:
            del self._queues[queue_name]
            del self._messages[queue_name]
            if queue_name in self._dlq_messages:
                del self._dlq_messages[queue_name]
            if queue_name in self._visibility:
                del self._visibility[queue_name]
            
            # Delete DLQ
            dlq_name = f"{queue_name}-dlq"
            if dlq_name in self._queues:
                del self._queues[dlq_name]
                del self._messages[dlq_name]
            
            logger.info(f"Deleted SQS queue: {queue_name}")
            return True
        return False
    
    def send_task(self, queue_name: str, task: TaskMessage) -> str:
        """Send a task to SQS."""
        if queue_name not in self._messages:
            raise ValueError(f"Queue not found: {queue_name}")
        
        message_id = str(uuid4())
        message = {
            "id": message_id,
            "task": task,
            "sent_at": datetime.now(),
            "receive_count": 0,
            "available_at": datetime.now() + timedelta(seconds=task.delay_seconds),
        }
        
        # Insert based on priority (higher priority = earlier in list)
        priority_order = {
            TaskPriority.CRITICAL: 0,
            TaskPriority.HIGH: 1,
            TaskPriority.NORMAL: 2,
            TaskPriority.LOW: 3,
        }
        
        insert_idx = len(self._messages[queue_name])
        for i, msg in enumerate(self._messages[queue_name]):
            if priority_order[task.priority] < priority_order[msg["task"].priority]:
                insert_idx = i
                break
        
        self._messages[queue_name].insert(insert_idx, message)
        logger.debug(f"Sent task {task.id} to queue {queue_name}")
        return message_id
    
    def receive_tasks(
        self,
        queue_name: str,
        max_messages: int = 10,
        visibility_timeout: int = 30,
        wait_time_seconds: int = 20,
    ) -> list[tuple[str, TaskMessage]]:
        """Receive tasks from SQS."""
        if queue_name not in self._messages:
            raise ValueError(f"Queue not found: {queue_name}")
        
        now = datetime.now()
        results = []
        
        for message in self._messages[queue_name][:]:
            if len(results) >= max_messages:
                break
            
            # Check if message is available
            if message["available_at"] > now:
                continue
            
            # Check visibility
            msg_id = message["id"]
            if msg_id in self._visibility.get(queue_name, {}):
                if self._visibility[queue_name][msg_id] > now:
                    continue
            
            # Generate receipt handle
            receipt_handle = f"{msg_id}:{str(uuid4())}"
            
            # Set visibility timeout
            if queue_name not in self._visibility:
                self._visibility[queue_name] = {}
            self._visibility[queue_name][msg_id] = now + timedelta(seconds=visibility_timeout)
            
            # Increment receive count
            message["receive_count"] += 1
            
            results.append((receipt_handle, message["task"]))
        
        return results
    
    def delete_task(self, queue_name: str, receipt_handle: str) -> bool:
        """Delete a task from SQS."""
        if queue_name not in self._messages:
            return False
        
        msg_id = receipt_handle.split(":")[0]
        
        for i, message in enumerate(self._messages[queue_name]):
            if message["id"] == msg_id:
                del self._messages[queue_name][i]
                if msg_id in self._visibility.get(queue_name, {}):
                    del self._visibility[queue_name][msg_id]
                logger.debug(f"Deleted task {msg_id} from queue {queue_name}")
                return True
        
        return False
    
    def change_visibility(
        self,
        queue_name: str,
        receipt_handle: str,
        visibility_timeout: int,
    ) -> bool:
        """Change visibility timeout."""
        msg_id = receipt_handle.split(":")[0]
        
        if queue_name not in self._visibility:
            self._visibility[queue_name] = {}
        
        self._visibility[queue_name][msg_id] = datetime.now() + timedelta(seconds=visibility_timeout)
        return True
    
    def get_queue_stats(self, queue_name: str) -> QueueStats:
        """Get SQS queue statistics."""
        if queue_name not in self._queues:
            raise ValueError(f"Queue not found: {queue_name}")
        
        now = datetime.now()
        messages = self._messages.get(queue_name, [])
        
        # Count visible vs in-flight
        visible_count = 0
        in_flight_count = 0
        delayed_count = 0
        oldest_age = None
        
        for msg in messages:
            msg_id = msg["id"]
            
            if msg["available_at"] > now:
                delayed_count += 1
            elif msg_id in self._visibility.get(queue_name, {}) and self._visibility[queue_name][msg_id] > now:
                in_flight_count += 1
            else:
                visible_count += 1
                age = (now - msg["sent_at"]).total_seconds()
                if oldest_age is None or age > oldest_age:
                    oldest_age = int(age)
        
        dlq_count = len(self._dlq_messages.get(queue_name, []))
        
        return QueueStats(
            queue_name=queue_name,
            approximate_message_count=visible_count,
            approximate_not_visible_count=in_flight_count,
            approximate_delayed_count=delayed_count,
            oldest_message_age_seconds=oldest_age,
            dlq_message_count=dlq_count,
        )
    
    def get_dlq_messages(
        self,
        queue_name: str,
        max_messages: int = 10,
    ) -> list[DeadLetterMessage]:
        """Get messages from DLQ."""
        return self._dlq_messages.get(queue_name, [])[:max_messages]
    
    def retry_dlq_message(self, queue_name: str, message_id: str) -> bool:
        """Retry a DLQ message."""
        dlq_messages = self._dlq_messages.get(queue_name, [])
        
        for i, dlq_msg in enumerate(dlq_messages):
            if dlq_msg.id == message_id:
                # Re-queue the original task
                task = dlq_msg.original_task
                task.retry_policy.max_retries = 3  # Reset retries
                self.send_task(queue_name, task)
                
                # Remove from DLQ
                del dlq_messages[i]
                logger.info(f"Retried DLQ message {message_id}")
                return True
        
        return False
    
    def move_to_dlq(self, queue_name: str, task: TaskMessage, failure_reason: str, attempt_count: int) -> None:
        """Move a failed task to the dead-letter queue."""
        if queue_name not in self._dlq_messages:
            self._dlq_messages[queue_name] = []
        
        dlq_message = DeadLetterMessage(
            original_task=task,
            failure_reason=failure_reason,
            attempt_count=attempt_count,
            first_failure_at=datetime.now(),
            source_queue=queue_name,
        )
        
        self._dlq_messages[queue_name].append(dlq_message)
        logger.warning(f"Moved task {task.id} to DLQ: {failure_reason}")



# ============================================
# Azure Service Bus Adapter
# ============================================

class AzureServiceBusAdapter(TaskQueueProvider):
    """
    Azure Service Bus implementation of the task queue provider.
    
    Supports queues and topics with sessions for priority handling.
    
    Requirements: 39.1, 39.2
    """
    
    def __init__(self, connection_string: Optional[str] = None, namespace: str = "governance"):
        """
        Initialize the Service Bus adapter.
        
        Args:
            connection_string: Azure Service Bus connection string
            namespace: Service Bus namespace
        """
        self.connection_string = connection_string
        self.namespace = namespace
        self._queues: dict[str, dict[str, Any]] = {}
        self._messages: dict[str, list[dict[str, Any]]] = {}
        self._dlq_messages: dict[str, list[DeadLetterMessage]] = {}
        self._visibility: dict[str, dict[str, datetime]] = {}
        
        # In production, this would use azure-servicebus
        # from azure.servicebus import ServiceBusClient
        # self.client = ServiceBusClient.from_connection_string(connection_string)
    
    def create_queue(self, config: QueueConfig) -> str:
        """Create a Service Bus queue."""
        queue_url = f"sb://{self.namespace}.servicebus.windows.net/{config.name}"
        
        self._queues[config.name] = {
            "url": queue_url,
            "config": config,
            "created_at": datetime.now(),
        }
        self._messages[config.name] = []
        self._dlq_messages[config.name] = []
        self._visibility[config.name] = {}
        
        logger.info(f"Created Service Bus queue: {config.name}")
        return queue_url
    
    def delete_queue(self, queue_name: str) -> bool:
        """Delete a Service Bus queue."""
        if queue_name in self._queues:
            del self._queues[queue_name]
            del self._messages[queue_name]
            if queue_name in self._dlq_messages:
                del self._dlq_messages[queue_name]
            if queue_name in self._visibility:
                del self._visibility[queue_name]
            logger.info(f"Deleted Service Bus queue: {queue_name}")
            return True
        return False
    
    def send_task(self, queue_name: str, task: TaskMessage) -> str:
        """Send a task to Service Bus."""
        if queue_name not in self._messages:
            raise ValueError(f"Queue not found: {queue_name}")
        
        message_id = str(uuid4())
        message = {
            "id": message_id,
            "task": task,
            "sent_at": datetime.now(),
            "receive_count": 0,
            "available_at": datetime.now() + timedelta(seconds=task.delay_seconds),
            "session_id": task.priority.value,  # Use priority as session for ordering
        }
        
        # Insert based on priority
        priority_order = {
            TaskPriority.CRITICAL: 0,
            TaskPriority.HIGH: 1,
            TaskPriority.NORMAL: 2,
            TaskPriority.LOW: 3,
        }
        
        insert_idx = len(self._messages[queue_name])
        for i, msg in enumerate(self._messages[queue_name]):
            if priority_order[task.priority] < priority_order[msg["task"].priority]:
                insert_idx = i
                break
        
        self._messages[queue_name].insert(insert_idx, message)
        logger.debug(f"Sent task {task.id} to Service Bus queue {queue_name}")
        return message_id
    
    def receive_tasks(
        self,
        queue_name: str,
        max_messages: int = 10,
        visibility_timeout: int = 30,
        wait_time_seconds: int = 20,
    ) -> list[tuple[str, TaskMessage]]:
        """Receive tasks from Service Bus."""
        if queue_name not in self._messages:
            raise ValueError(f"Queue not found: {queue_name}")
        
        now = datetime.now()
        results = []
        
        for message in self._messages[queue_name][:]:
            if len(results) >= max_messages:
                break
            
            if message["available_at"] > now:
                continue
            
            msg_id = message["id"]
            if msg_id in self._visibility.get(queue_name, {}):
                if self._visibility[queue_name][msg_id] > now:
                    continue
            
            lock_token = f"{msg_id}:{str(uuid4())}"
            
            if queue_name not in self._visibility:
                self._visibility[queue_name] = {}
            self._visibility[queue_name][msg_id] = now + timedelta(seconds=visibility_timeout)
            
            message["receive_count"] += 1
            results.append((lock_token, message["task"]))
        
        return results
    
    def delete_task(self, queue_name: str, receipt_handle: str) -> bool:
        """Complete a task (delete from Service Bus)."""
        if queue_name not in self._messages:
            return False
        
        msg_id = receipt_handle.split(":")[0]
        
        for i, message in enumerate(self._messages[queue_name]):
            if message["id"] == msg_id:
                del self._messages[queue_name][i]
                if msg_id in self._visibility.get(queue_name, {}):
                    del self._visibility[queue_name][msg_id]
                return True
        
        return False
    
    def change_visibility(
        self,
        queue_name: str,
        receipt_handle: str,
        visibility_timeout: int,
    ) -> bool:
        """Renew message lock."""
        msg_id = receipt_handle.split(":")[0]
        
        if queue_name not in self._visibility:
            self._visibility[queue_name] = {}
        
        self._visibility[queue_name][msg_id] = datetime.now() + timedelta(seconds=visibility_timeout)
        return True
    
    def get_queue_stats(self, queue_name: str) -> QueueStats:
        """Get Service Bus queue statistics."""
        if queue_name not in self._queues:
            raise ValueError(f"Queue not found: {queue_name}")
        
        now = datetime.now()
        messages = self._messages.get(queue_name, [])
        
        visible_count = 0
        in_flight_count = 0
        delayed_count = 0
        oldest_age = None
        
        for msg in messages:
            msg_id = msg["id"]
            
            if msg["available_at"] > now:
                delayed_count += 1
            elif msg_id in self._visibility.get(queue_name, {}) and self._visibility[queue_name][msg_id] > now:
                in_flight_count += 1
            else:
                visible_count += 1
                age = (now - msg["sent_at"]).total_seconds()
                if oldest_age is None or age > oldest_age:
                    oldest_age = int(age)
        
        dlq_count = len(self._dlq_messages.get(queue_name, []))
        
        return QueueStats(
            queue_name=queue_name,
            approximate_message_count=visible_count,
            approximate_not_visible_count=in_flight_count,
            approximate_delayed_count=delayed_count,
            oldest_message_age_seconds=oldest_age,
            dlq_message_count=dlq_count,
        )
    
    def get_dlq_messages(
        self,
        queue_name: str,
        max_messages: int = 10,
    ) -> list[DeadLetterMessage]:
        """Get messages from DLQ."""
        return self._dlq_messages.get(queue_name, [])[:max_messages]
    
    def retry_dlq_message(self, queue_name: str, message_id: str) -> bool:
        """Retry a DLQ message."""
        dlq_messages = self._dlq_messages.get(queue_name, [])
        
        for i, dlq_msg in enumerate(dlq_messages):
            if dlq_msg.id == message_id:
                task = dlq_msg.original_task
                task.retry_policy.max_retries = 3
                self.send_task(queue_name, task)
                del dlq_messages[i]
                logger.info(f"Retried DLQ message {message_id}")
                return True
        
        return False
    
    def move_to_dlq(self, queue_name: str, task: TaskMessage, failure_reason: str, attempt_count: int) -> None:
        """Move a failed task to the dead-letter queue."""
        if queue_name not in self._dlq_messages:
            self._dlq_messages[queue_name] = []
        
        dlq_message = DeadLetterMessage(
            original_task=task,
            failure_reason=failure_reason,
            attempt_count=attempt_count,
            first_failure_at=datetime.now(),
            source_queue=queue_name,
        )
        
        self._dlq_messages[queue_name].append(dlq_message)
        logger.warning(f"Moved task {task.id} to DLQ: {failure_reason}")


# ============================================
# Task Handler Type
# ============================================

TaskHandler = Callable[[TaskMessage], TaskResult]


# ============================================
# Task Queue Worker
# ============================================

class TaskQueueWorker:
    """
    Worker for processing tasks from a queue.
    
    Implements retry with exponential backoff and dead-letter handling.
    
    Requirements: 39.2, 39.3, 39.4
    """
    
    def __init__(
        self,
        provider: TaskQueueProvider,
        config: WorkerConfig,
        handlers: dict[str, TaskHandler],
    ):
        """
        Initialize the worker.
        
        Args:
            provider: Task queue provider
            config: Worker configuration
            handlers: Map of task type to handler function
        """
        self.provider = provider
        self.config = config
        self.handlers = handlers
        self._running = False
        self._current_tasks: dict[str, TaskProgress] = {}
        self._results: dict[str, TaskResult] = {}
        self._alert_callback: Optional[Callable[[DeadLetterMessage], None]] = None
    
    def set_alert_callback(self, callback: Callable[[DeadLetterMessage], None]) -> None:
        """Set callback for DLQ alerts."""
        self._alert_callback = callback
    
    def get_task_progress(self, task_id: str) -> Optional[TaskProgress]:
        """
        Get progress for a task.
        
        Requirements: 39.3
        """
        return self._current_tasks.get(task_id)
    
    def get_task_result(self, task_id: str) -> Optional[TaskResult]:
        """Get result for a completed task."""
        return self._results.get(task_id)
    
    def update_progress(
        self,
        task_id: str,
        progress_percent: int,
        current_step: Optional[str] = None,
        estimated_completion: Optional[datetime] = None,
    ) -> None:
        """
        Update task progress.
        
        Requirements: 39.3
        """
        if task_id in self._current_tasks:
            self._current_tasks[task_id].progress_percent = progress_percent
            self._current_tasks[task_id].current_step = current_step
            self._current_tasks[task_id].estimated_completion = estimated_completion
            self._current_tasks[task_id].last_updated = datetime.now()
    
    def process_task(self, receipt_handle: str, task: TaskMessage, attempt: int = 0) -> TaskResult:
        """
        Process a single task with retry logic.
        
        Requirements: 39.2, 39.4
        """
        task_id = task.id
        started_at = datetime.now()
        
        # Track progress
        self._current_tasks[task_id] = TaskProgress(
            task_id=task_id,
            status=TaskStatus.PROCESSING,
            progress_percent=0,
        )
        
        try:
            # Get handler for task type
            handler = self.handlers.get(task.task_type.value)
            if not handler:
                raise ValueError(f"No handler for task type: {task.task_type}")
            
            # Execute handler
            result = handler(task)
            
            # Success - delete from queue
            self.provider.delete_task(self.config.queue_name, receipt_handle)
            
            completed_at = datetime.now()
            result.started_at = started_at
            result.completed_at = completed_at
            result.duration_ms = int((completed_at - started_at).total_seconds() * 1000)
            result.attempt_number = attempt
            
            self._results[task_id] = result
            del self._current_tasks[task_id]
            
            logger.info(f"Task {task_id} completed successfully")
            return result
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Task {task_id} failed (attempt {attempt + 1}): {error_msg}")
            
            # Check if we should retry
            if attempt < task.retry_policy.max_retries:
                # Calculate delay for next retry
                delay = task.retry_policy.get_delay_for_attempt(attempt)
                next_retry = datetime.now() + timedelta(seconds=delay)
                
                # Extend visibility to cover retry delay
                self.provider.change_visibility(
                    self.config.queue_name,
                    receipt_handle,
                    delay + self.config.visibility_timeout_seconds,
                )
                
                result = TaskResult(
                    task_id=task_id,
                    status=TaskStatus.PENDING,
                    error_message=error_msg,
                    started_at=started_at,
                    completed_at=datetime.now(),
                    attempt_number=attempt,
                    next_retry_at=next_retry,
                )
                
                self._current_tasks[task_id].status = TaskStatus.PENDING
                logger.info(f"Task {task_id} scheduled for retry in {delay}s")
                return result
            else:
                # Max retries exceeded - move to DLQ
                self.provider.delete_task(self.config.queue_name, receipt_handle)
                
                # Move to DLQ
                if hasattr(self.provider, 'move_to_dlq'):
                    self.provider.move_to_dlq(
                        self.config.queue_name,
                        task,
                        error_msg,
                        attempt + 1,
                    )
                    
                    # Alert on DLQ
                    if self._alert_callback:
                        dlq_msg = DeadLetterMessage(
                            original_task=task,
                            failure_reason=error_msg,
                            attempt_count=attempt + 1,
                            first_failure_at=started_at,
                            source_queue=self.config.queue_name,
                        )
                        self._alert_callback(dlq_msg)
                
                result = TaskResult(
                    task_id=task_id,
                    status=TaskStatus.DEAD_LETTER,
                    error_message=f"Max retries exceeded: {error_msg}",
                    started_at=started_at,
                    completed_at=datetime.now(),
                    attempt_number=attempt,
                )
                
                self._results[task_id] = result
                if task_id in self._current_tasks:
                    del self._current_tasks[task_id]
                
                logger.error(f"Task {task_id} moved to DLQ after {attempt + 1} attempts")
                return result
    
    def poll_once(self) -> list[TaskResult]:
        """Poll and process one batch of tasks."""
        results = []
        
        tasks = self.provider.receive_tasks(
            self.config.queue_name,
            max_messages=self.config.batch_size,
            visibility_timeout=self.config.visibility_timeout_seconds,
            wait_time_seconds=self.config.poll_interval_seconds,
        )
        
        for receipt_handle, task in tasks:
            result = self.process_task(receipt_handle, task)
            results.append(result)
        
        return results
    
    async def run(self) -> None:
        """Run the worker loop."""
        self._running = True
        logger.info(f"Worker {self.config.worker_id} started for queue {self.config.queue_name}")
        
        while self._running:
            try:
                self.poll_once()
                await asyncio.sleep(self.config.poll_interval_seconds)
            except Exception as e:
                logger.error(f"Worker error: {e}")
                await asyncio.sleep(self.config.poll_interval_seconds)
        
        logger.info(f"Worker {self.config.worker_id} stopped")
    
    def stop(self) -> None:
        """Stop the worker gracefully."""
        self._running = False



# ============================================
# Auto-Scaling Manager
# ============================================

class AutoScalingManager:
    """
    Manages auto-scaling of task queue workers based on queue depth.
    
    Requirements: 39.5
    """
    
    def __init__(
        self,
        provider: TaskQueueProvider,
        queue_name: str,
        config: ScalingConfig,
        worker_factory: Callable[[], TaskQueueWorker],
    ):
        """
        Initialize the auto-scaling manager.
        
        Args:
            provider: Task queue provider
            queue_name: Queue to monitor
            config: Scaling configuration
            worker_factory: Factory function to create workers
        """
        self.provider = provider
        self.queue_name = queue_name
        self.config = config
        self.worker_factory = worker_factory
        
        self._workers: list[TaskQueueWorker] = []
        self._running = False
        self._last_scale_up: Optional[datetime] = None
        self._last_scale_down: Optional[datetime] = None
        self._metrics_history: list[dict[str, Any]] = []
    
    @property
    def current_worker_count(self) -> int:
        """Get current number of workers."""
        return len(self._workers)
    
    def get_scaling_metrics(self) -> dict[str, Any]:
        """Get current scaling metrics."""
        stats = self.provider.get_queue_stats(self.queue_name)
        
        return {
            "queue_depth": stats.approximate_message_count,
            "in_flight": stats.approximate_not_visible_count,
            "delayed": stats.approximate_delayed_count,
            "dlq_count": stats.dlq_message_count,
            "worker_count": self.current_worker_count,
            "min_workers": self.config.min_workers,
            "max_workers": self.config.max_workers,
            "last_scale_up": self._last_scale_up,
            "last_scale_down": self._last_scale_down,
        }
    
    def should_scale_up(self) -> bool:
        """
        Determine if we should scale up.
        
        Requirements: 39.5
        """
        if not self.config.enabled:
            return False
        
        if self.current_worker_count >= self.config.max_workers:
            return False
        
        # Check cooldown
        if self._last_scale_up:
            cooldown_end = self._last_scale_up + timedelta(seconds=self.config.scale_up_cooldown_seconds)
            if datetime.now() < cooldown_end:
                return False
        
        stats = self.provider.get_queue_stats(self.queue_name)
        
        # Scale up if queue depth exceeds threshold
        if stats.approximate_message_count >= self.config.scale_up_queue_depth_threshold:
            return True
        
        # Scale up if oldest message is too old (latency threshold)
        if stats.oldest_message_age_seconds:
            if stats.oldest_message_age_seconds * 1000 >= self.config.scale_up_latency_threshold_ms:
                return True
        
        return False
    
    def should_scale_down(self) -> bool:
        """
        Determine if we should scale down.
        
        Requirements: 39.5
        """
        if not self.config.enabled:
            return False
        
        if self.current_worker_count <= self.config.min_workers:
            return False
        
        # Check cooldown
        if self._last_scale_down:
            cooldown_end = self._last_scale_down + timedelta(seconds=self.config.scale_down_cooldown_seconds)
            if datetime.now() < cooldown_end:
                return False
        
        stats = self.provider.get_queue_stats(self.queue_name)
        
        # Scale down if queue depth is below threshold
        if stats.approximate_message_count <= self.config.scale_down_queue_depth_threshold:
            return True
        
        return False
    
    def scale_up(self) -> int:
        """
        Scale up workers.
        
        Returns:
            Number of workers added
        """
        workers_to_add = min(
            self.config.scale_up_increment,
            self.config.max_workers - self.current_worker_count,
        )
        
        for _ in range(workers_to_add):
            worker = self.worker_factory()
            self._workers.append(worker)
        
        self._last_scale_up = datetime.now()
        logger.info(f"Scaled up by {workers_to_add} workers. Total: {self.current_worker_count}")
        return workers_to_add
    
    def scale_down(self) -> int:
        """
        Scale down workers.
        
        Returns:
            Number of workers removed
        """
        workers_to_remove = min(
            self.config.scale_down_increment,
            self.current_worker_count - self.config.min_workers,
        )
        
        for _ in range(workers_to_remove):
            if self._workers:
                worker = self._workers.pop()
                worker.stop()
        
        self._last_scale_down = datetime.now()
        logger.info(f"Scaled down by {workers_to_remove} workers. Total: {self.current_worker_count}")
        return workers_to_remove
    
    def evaluate_and_scale(self) -> dict[str, Any]:
        """
        Evaluate scaling needs and take action.
        
        Returns:
            Scaling action taken
        """
        action = {"action": "none", "workers_changed": 0}
        
        if self.should_scale_up():
            workers_added = self.scale_up()
            action = {"action": "scale_up", "workers_changed": workers_added}
        elif self.should_scale_down():
            workers_removed = self.scale_down()
            action = {"action": "scale_down", "workers_changed": workers_removed}
        
        # Record metrics
        metrics = self.get_scaling_metrics()
        metrics["action"] = action
        metrics["timestamp"] = datetime.now()
        self._metrics_history.append(metrics)
        
        # Keep only last 100 metrics
        if len(self._metrics_history) > 100:
            self._metrics_history = self._metrics_history[-100:]
        
        return action
    
    async def run(self, check_interval_seconds: int = 30) -> None:
        """Run the auto-scaling loop."""
        self._running = True
        logger.info(f"Auto-scaling manager started for queue {self.queue_name}")
        
        # Start minimum workers
        while self.current_worker_count < self.config.min_workers:
            self.scale_up()
        
        while self._running:
            try:
                self.evaluate_and_scale()
                await asyncio.sleep(check_interval_seconds)
            except Exception as e:
                logger.error(f"Auto-scaling error: {e}")
                await asyncio.sleep(check_interval_seconds)
        
        logger.info("Auto-scaling manager stopped")
    
    def stop(self) -> None:
        """Stop the auto-scaling manager and all workers."""
        self._running = False
        for worker in self._workers:
            worker.stop()
        self._workers.clear()


# ============================================
# Task Queue Service
# ============================================

class TaskQueueService:
    """
    High-level service for task queue operations.
    
    Provides a unified interface for sending tasks, tracking progress,
    and managing workers with auto-scaling.
    
    Requirements: 39.1, 39.2, 39.3, 39.4, 39.5
    """
    
    def __init__(
        self,
        provider: TaskQueueProvider,
        queue_config: QueueConfig,
        scaling_config: Optional[ScalingConfig] = None,
    ):
        """
        Initialize the task queue service.
        
        Args:
            provider: Task queue provider (SQS or Service Bus)
            queue_config: Queue configuration
            scaling_config: Optional auto-scaling configuration
        """
        self.provider = provider
        self.queue_config = queue_config
        self.scaling_config = scaling_config or ScalingConfig()
        
        self._handlers: dict[str, TaskHandler] = {}
        self._workers: list[TaskQueueWorker] = []
        self._scaling_manager: Optional[AutoScalingManager] = None
        self._task_progress: dict[str, TaskProgress] = {}
        self._task_results: dict[str, TaskResult] = {}
        
        # Create the queue
        self.queue_url = provider.create_queue(queue_config)
    
    def register_handler(self, task_type: str, handler: TaskHandler) -> None:
        """
        Register a handler for a task type.
        
        Args:
            task_type: Task type to handle
            handler: Handler function
        """
        self._handlers[task_type] = handler
        logger.info(f"Registered handler for task type: {task_type}")
    
    def send_task(
        self,
        task_type: str,
        payload: dict[str, Any],
        priority: TaskPriority = TaskPriority.NORMAL,
        delay_seconds: int = 0,
        tenant_id: Optional[str] = None,
        correlation_id: Optional[str] = None,
        tags: Optional[dict[str, str]] = None,
    ) -> str:
        """
        Send a task to the queue.
        
        Requirements: 39.1, 39.2
        
        Args:
            task_type: Type of task
            payload: Task payload
            priority: Task priority
            delay_seconds: Delay before processing
            tenant_id: Optional tenant ID
            correlation_id: Optional correlation ID
            tags: Optional tags
            
        Returns:
            Task ID
        """
        from models.task_queue import TaskType
        
        task = TaskMessage(
            task_type=TaskType(task_type),
            priority=priority,
            payload=payload,
            delay_seconds=delay_seconds,
            tenant_id=tenant_id,
            correlation_id=correlation_id,
            tags=tags or {},
        )
        
        self.provider.send_task(self.queue_config.name, task)
        
        # Initialize progress tracking
        self._task_progress[task.id] = TaskProgress(
            task_id=task.id,
            status=TaskStatus.PENDING,
        )
        
        logger.info(f"Sent task {task.id} of type {task_type} with priority {priority}")
        return task.id
    
    def get_task_status(self, task_id: str) -> Optional[TaskProgress]:
        """
        Get the status of a task.
        
        Requirements: 39.3
        
        Args:
            task_id: Task ID
            
        Returns:
            Task progress or None if not found
        """
        # Check workers first
        for worker in self._workers:
            progress = worker.get_task_progress(task_id)
            if progress:
                return progress
        
        # Check local cache
        return self._task_progress.get(task_id)
    
    def get_task_result(self, task_id: str) -> Optional[TaskResult]:
        """
        Get the result of a completed task.
        
        Args:
            task_id: Task ID
            
        Returns:
            Task result or None if not found
        """
        # Check workers first
        for worker in self._workers:
            result = worker.get_task_result(task_id)
            if result:
                return result
        
        return self._task_results.get(task_id)
    
    def get_queue_stats(self) -> QueueStats:
        """
        Get queue statistics.
        
        Returns:
            Queue statistics
        """
        return self.provider.get_queue_stats(self.queue_config.name)
    
    def get_dlq_messages(self, max_messages: int = 10) -> list[DeadLetterMessage]:
        """
        Get messages from the dead-letter queue.
        
        Requirements: 39.4
        
        Args:
            max_messages: Maximum messages to retrieve
            
        Returns:
            List of dead-letter messages
        """
        return self.provider.get_dlq_messages(self.queue_config.name, max_messages)
    
    def retry_dlq_message(self, message_id: str) -> bool:
        """
        Retry a message from the dead-letter queue.
        
        Args:
            message_id: Message ID to retry
            
        Returns:
            True if requeued successfully
        """
        return self.provider.retry_dlq_message(self.queue_config.name, message_id)
    
    def create_worker(self, worker_config: Optional[WorkerConfig] = None) -> TaskQueueWorker:
        """
        Create a new worker.
        
        Args:
            worker_config: Optional worker configuration
            
        Returns:
            New worker instance
        """
        config = worker_config or WorkerConfig(queue_name=self.queue_config.name)
        worker = TaskQueueWorker(self.provider, config, self._handlers)
        self._workers.append(worker)
        return worker
    
    def enable_auto_scaling(self, config: Optional[ScalingConfig] = None) -> AutoScalingManager:
        """
        Enable auto-scaling for workers.
        
        Requirements: 39.5
        
        Args:
            config: Optional scaling configuration
            
        Returns:
            Auto-scaling manager
        """
        scaling_config = config or self.scaling_config
        
        def worker_factory() -> TaskQueueWorker:
            return self.create_worker()
        
        self._scaling_manager = AutoScalingManager(
            self.provider,
            self.queue_config.name,
            scaling_config,
            worker_factory,
        )
        
        return self._scaling_manager
    
    def get_scaling_metrics(self) -> Optional[dict[str, Any]]:
        """
        Get auto-scaling metrics.
        
        Returns:
            Scaling metrics or None if auto-scaling not enabled
        """
        if self._scaling_manager:
            return self._scaling_manager.get_scaling_metrics()
        return None
    
    def shutdown(self) -> None:
        """Shutdown the service and all workers."""
        if self._scaling_manager:
            self._scaling_manager.stop()
        
        for worker in self._workers:
            worker.stop()
        
        self._workers.clear()
        logger.info("Task queue service shutdown complete")


# ============================================
# Factory Function
# ============================================

def create_task_queue_service(
    provider_type: str = "aws",
    queue_name: str = "governance-tasks",
    region: str = "us-west-2",
    scaling_config: Optional[ScalingConfig] = None,
) -> TaskQueueService:
    """
    Factory function to create a task queue service.
    
    Args:
        provider_type: "aws" or "azure"
        queue_name: Name for the queue
        region: Cloud region
        scaling_config: Optional scaling configuration
        
    Returns:
        Configured TaskQueueService
    """
    if provider_type == "aws":
        provider = AWSSQSAdapter(region=region)
    elif provider_type == "azure":
        provider = AzureServiceBusAdapter(namespace=queue_name)
    else:
        raise ValueError(f"Unknown provider type: {provider_type}")
    
    queue_config = QueueConfig(
        name=queue_name,
        provider=provider_type,
    )
    
    return TaskQueueService(
        provider=provider,
        queue_config=queue_config,
        scaling_config=scaling_config,
    )

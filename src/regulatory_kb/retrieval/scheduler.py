"""Document scheduler with configurable schedules and priority-based queuing.

Implements Requirements 11.1, 11.2:
- Monitor quarterly Call Report instruction updates and annual CCAR instruction cycles
- Monitor guideline version changes (CAR 2024 to CAR 2026 transitions)
"""

import asyncio
import heapq
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum, IntEnum
from typing import Callable, Optional, Any
from pydantic import BaseModel, Field

from regulatory_kb.core import get_logger
from regulatory_kb.core.errors import RetryableError

logger = get_logger(__name__)


class UpdateCycle(str, Enum):
    """Regulatory update cycles for document monitoring."""

    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMI_ANNUAL = "semi-annual"
    ANNUAL = "annual"
    ON_DEMAND = "on-demand"


class TaskPriority(IntEnum):
    """Priority levels for scheduled tasks (lower number = higher priority)."""

    CRITICAL = 1  # Critical regulatory updates (CFR amendments)
    HIGH = 2      # Important updates (CCAR instructions, major guidance)
    NORMAL = 3    # Regular updates (quarterly reports)
    LOW = 4       # Background updates (historical documents)


class TaskStatus(str, Enum):
    """Status of a scheduled task."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"


class ScheduleConfig(BaseModel):
    """Configuration for a document retrieval schedule."""

    regulator_id: str = Field(..., description="Regulator identifier")
    document_type: str = Field(..., description="Type of document to retrieve")
    source_url: str = Field(..., description="URL to retrieve document from")
    update_cycle: UpdateCycle = Field(..., description="How often to check for updates")
    priority: TaskPriority = Field(
        default=TaskPriority.NORMAL, description="Task priority"
    )
    enabled: bool = Field(default=True, description="Whether schedule is active")
    description: Optional[str] = Field(None, description="Human-readable description")
    metadata: dict[str, Any] = Field(
        default_factory=dict, description="Additional metadata"
    )

    def get_interval_seconds(self) -> int:
        """Get the interval in seconds based on update cycle."""
        intervals = {
            UpdateCycle.DAILY: 86400,
            UpdateCycle.WEEKLY: 604800,
            UpdateCycle.MONTHLY: 2592000,
            UpdateCycle.QUARTERLY: 7776000,
            UpdateCycle.SEMI_ANNUAL: 15552000,
            UpdateCycle.ANNUAL: 31536000,
            UpdateCycle.ON_DEMAND: 0,
        }
        return intervals.get(self.update_cycle, 86400)


@dataclass(order=True)
class ScheduledTask:
    """A task scheduled for execution with priority ordering."""

    priority: int
    scheduled_time: datetime = field(compare=True)
    task_id: str = field(compare=False)
    config: ScheduleConfig = field(compare=False)
    retry_count: int = field(default=0, compare=False)
    status: TaskStatus = field(default=TaskStatus.PENDING, compare=False)
    last_error: Optional[str] = field(default=None, compare=False)
    created_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc), compare=False
    )

    def __hash__(self) -> int:
        return hash(self.task_id)


class RetryConfig(BaseModel):
    """Configuration for retry logic with exponential backoff."""

    max_retries: int = Field(default=3, description="Maximum retry attempts")
    base_delay_seconds: float = Field(
        default=1.0, description="Base delay for exponential backoff"
    )
    max_delay_seconds: float = Field(
        default=300.0, description="Maximum delay between retries"
    )
    jitter: bool = Field(default=True, description="Add random jitter to delays")

    def get_delay(self, retry_count: int) -> float:
        """Calculate delay for a given retry count using exponential backoff."""
        delay = min(
            self.base_delay_seconds * (2 ** retry_count),
            self.max_delay_seconds
        )
        if self.jitter:
            delay = delay * (0.5 + random.random())
        return delay


class DocumentScheduler:
    """Scheduler for document retrieval tasks with priority-based queuing.

    Supports configurable schedules for different regulatory update cycles
    (quarterly, annual) and implements retry logic with exponential backoff.
    """

    def __init__(
        self,
        retry_config: Optional[RetryConfig] = None,
        task_handler: Optional[Callable[[ScheduledTask], Any]] = None,
    ):
        """Initialize the document scheduler.

        Args:
            retry_config: Configuration for retry behavior
            task_handler: Async function to handle task execution
        """
        self._task_queue: list[ScheduledTask] = []
        self._schedules: dict[str, ScheduleConfig] = {}
        self._active_tasks: dict[str, ScheduledTask] = {}
        self._retry_config = retry_config or RetryConfig()
        self._task_handler = task_handler
        self._running = False
        self._task_counter = 0

        logger.info(
            "scheduler_initialized",
            max_retries=self._retry_config.max_retries,
            base_delay=self._retry_config.base_delay_seconds,
        )

    def add_schedule(self, schedule_id: str, config: ScheduleConfig) -> None:
        """Add a new schedule configuration.

        Args:
            schedule_id: Unique identifier for the schedule
            config: Schedule configuration
        """
        self._schedules[schedule_id] = config
        logger.info(
            "schedule_added",
            schedule_id=schedule_id,
            regulator=config.regulator_id,
            update_cycle=config.update_cycle.value,
            priority=config.priority.name,
        )

    def remove_schedule(self, schedule_id: str) -> bool:
        """Remove a schedule configuration.

        Args:
            schedule_id: Schedule identifier to remove

        Returns:
            True if schedule was removed, False if not found
        """
        if schedule_id in self._schedules:
            del self._schedules[schedule_id]
            logger.info("schedule_removed", schedule_id=schedule_id)
            return True
        return False

    def get_schedule(self, schedule_id: str) -> Optional[ScheduleConfig]:
        """Get a schedule configuration by ID."""
        return self._schedules.get(schedule_id)

    def list_schedules(self) -> dict[str, ScheduleConfig]:
        """List all registered schedules."""
        return dict(self._schedules)

    def _generate_task_id(self) -> str:
        """Generate a unique task ID."""
        self._task_counter += 1
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        return f"task_{timestamp}_{self._task_counter}"

    def enqueue_task(
        self,
        config: ScheduleConfig,
        scheduled_time: Optional[datetime] = None,
        priority_override: Optional[TaskPriority] = None,
    ) -> ScheduledTask:
        """Add a task to the priority queue.

        Args:
            config: Schedule configuration for the task
            scheduled_time: When to execute (defaults to now)
            priority_override: Override the config's priority

        Returns:
            The created scheduled task
        """
        task = ScheduledTask(
            priority=priority_override or config.priority,
            scheduled_time=scheduled_time or datetime.now(timezone.utc),
            task_id=self._generate_task_id(),
            config=config,
        )

        heapq.heappush(self._task_queue, task)
        self._active_tasks[task.task_id] = task

        logger.info(
            "task_enqueued",
            task_id=task.task_id,
            priority=task.priority,
            scheduled_time=task.scheduled_time.isoformat(),
            regulator=config.regulator_id,
        )

        return task

    def enqueue_from_schedule(
        self,
        schedule_id: str,
        scheduled_time: Optional[datetime] = None,
    ) -> Optional[ScheduledTask]:
        """Create and enqueue a task from a registered schedule.

        Args:
            schedule_id: ID of the registered schedule
            scheduled_time: When to execute (defaults to now)

        Returns:
            The created task, or None if schedule not found
        """
        config = self._schedules.get(schedule_id)
        if not config or not config.enabled:
            logger.warning(
                "schedule_not_found_or_disabled",
                schedule_id=schedule_id,
            )
            return None

        return self.enqueue_task(config, scheduled_time)

    def peek_next_task(self) -> Optional[ScheduledTask]:
        """View the next task without removing it from the queue."""
        if not self._task_queue:
            return None
        return self._task_queue[0]

    def dequeue_task(self) -> Optional[ScheduledTask]:
        """Remove and return the highest priority task.

        Returns:
            The next task to execute, or None if queue is empty
        """
        if not self._task_queue:
            return None

        task = heapq.heappop(self._task_queue)
        task.status = TaskStatus.IN_PROGRESS

        logger.info(
            "task_dequeued",
            task_id=task.task_id,
            priority=task.priority,
            regulator=task.config.regulator_id,
        )

        return task

    def get_queue_size(self) -> int:
        """Get the current number of tasks in the queue."""
        return len(self._task_queue)

    def get_pending_tasks(self) -> list[ScheduledTask]:
        """Get all pending tasks sorted by priority."""
        return sorted(self._task_queue)

    def complete_task(self, task: ScheduledTask) -> None:
        """Mark a task as completed.

        Args:
            task: The task to mark as completed
        """
        task.status = TaskStatus.COMPLETED
        if task.task_id in self._active_tasks:
            del self._active_tasks[task.task_id]

        logger.info(
            "task_completed",
            task_id=task.task_id,
            regulator=task.config.regulator_id,
        )

    def fail_task(self, task: ScheduledTask, error: str) -> bool:
        """Mark a task as failed and potentially schedule a retry.

        Args:
            task: The task that failed
            error: Error message describing the failure

        Returns:
            True if task will be retried, False if max retries exceeded
        """
        task.last_error = error
        task.retry_count += 1

        if task.retry_count <= self._retry_config.max_retries:
            task.status = TaskStatus.RETRYING
            delay = self._retry_config.get_delay(task.retry_count)
            retry_time = datetime.now(timezone.utc) + timedelta(seconds=delay)

            # Re-enqueue with updated retry time
            task.scheduled_time = retry_time
            heapq.heappush(self._task_queue, task)

            logger.warning(
                "task_retry_scheduled",
                task_id=task.task_id,
                retry_count=task.retry_count,
                max_retries=self._retry_config.max_retries,
                delay_seconds=delay,
                retry_time=retry_time.isoformat(),
                error=error,
            )
            return True
        else:
            task.status = TaskStatus.FAILED
            if task.task_id in self._active_tasks:
                del self._active_tasks[task.task_id]

            logger.error(
                "task_failed_max_retries",
                task_id=task.task_id,
                retry_count=task.retry_count,
                error=error,
            )
            return False

    def schedule_all_enabled(self) -> list[ScheduledTask]:
        """Create tasks for all enabled schedules.

        Returns:
            List of created tasks
        """
        tasks = []
        for schedule_id, config in self._schedules.items():
            if config.enabled:
                task = self.enqueue_from_schedule(schedule_id)
                if task:
                    tasks.append(task)

        logger.info("all_schedules_enqueued", task_count=len(tasks))
        return tasks

    def get_tasks_by_regulator(self, regulator_id: str) -> list[ScheduledTask]:
        """Get all pending tasks for a specific regulator."""
        return [
            task for task in self._task_queue
            if task.config.regulator_id == regulator_id
        ]

    def get_tasks_by_priority(self, priority: TaskPriority) -> list[ScheduledTask]:
        """Get all pending tasks with a specific priority."""
        return [
            task for task in self._task_queue
            if task.priority == priority
        ]

    def clear_queue(self) -> int:
        """Clear all pending tasks from the queue.

        Returns:
            Number of tasks cleared
        """
        count = len(self._task_queue)
        self._task_queue.clear()
        self._active_tasks.clear()
        logger.info("queue_cleared", tasks_cleared=count)
        return count

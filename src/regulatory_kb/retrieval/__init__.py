"""Document retrieval system for regulatory knowledge base."""

from regulatory_kb.retrieval.scheduler import (
    DocumentScheduler,
    ScheduleConfig,
    ScheduledTask,
    TaskPriority,
    UpdateCycle,
    RetryConfig,
)
from regulatory_kb.retrieval.service import (
    DocumentRetrievalService,
    RetrievalResult,
    RetrievalStatus,
    BaseSourceAdapter,
    RetrieverConfig,
)
from regulatory_kb.retrieval.adapters import (
    FederalReserveAdapter,
    OCCAdapter,
    FDICAdapter,
    FinCENAdapter,
    ECFRAdapter,
    FederalRegisterAdapter,
    OSFIAdapter,
    FINTRACAdapter,
)

__all__ = [
    # Scheduler
    "DocumentScheduler",
    "ScheduleConfig",
    "ScheduledTask",
    "TaskPriority",
    "UpdateCycle",
    "RetryConfig",
    # Service
    "DocumentRetrievalService",
    "RetrievalResult",
    "RetrievalStatus",
    "BaseSourceAdapter",
    "RetrieverConfig",
    # Adapters
    "FederalReserveAdapter",
    "OCCAdapter",
    "FDICAdapter",
    "FinCENAdapter",
    "ECFRAdapter",
    "FederalRegisterAdapter",
    "OSFIAdapter",
    "FINTRACAdapter",
]

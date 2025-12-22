"""
Unit tests for Task Queue Service.

Tests the task queue abstraction, worker processing,
retry logic, dead-letter queue handling, and auto-scaling.

Requirements: 39.1, 39.2, 39.3, 39.4, 39.5
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock

import sys
sys.path.insert(0, '.')

from models.task_queue import (
    TaskPriority,
    TaskStatus,
    TaskType,
    RetryPolicy,
    TaskMessage,
    TaskResult,
    TaskProgress,
    QueueConfig,
    WorkerConfig,
    ScalingConfig,
    QueueStats,
    DeadLetterMessage,
)
from services.task_queue import (
    AWSSQSAdapter,
    AzureServiceBusAdapter,
    TaskQueueWorker,
    AutoScalingManager,
    TaskQueueService,
    create_task_queue_service,
)


class TestRetryPolicy:
    """Tests for RetryPolicy model."""
    
    def test_exponential_backoff_calculation(self):
        """Test exponential backoff delay calculation."""
        policy = RetryPolicy(
            max_retries=5,
            initial_delay_seconds=1,
            backoff_multiplier=2.0,
            max_delay_seconds=60
        )
        
        assert policy.get_delay_for_attempt(0) == 1
        assert policy.get_delay_for_attempt(1) == 2
        assert policy.get_delay_for_attempt(2) == 4
        assert policy.get_delay_for_attempt(3) == 8
        assert policy.get_delay_for_attempt(4) == 16
        assert policy.get_delay_for_attempt(5) == 32
    
    def test_max_delay_cap(self):
        """Test that delay is capped at max_delay_seconds."""
        policy = RetryPolicy(
            max_retries=10,
            initial_delay_seconds=10,
            backoff_multiplier=3.0,
            max_delay_seconds=100
        )
        
        # 10 * 3^3 = 270, should be capped at 100
        assert policy.get_delay_for_attempt(3) == 100
        assert policy.get_delay_for_attempt(10) == 100


class TestTaskMessage:
    """Tests for TaskMessage model."""
    
    def test_task_message_creation(self):
        """Test creating a task message."""
        task = TaskMessage(
            task_type=TaskType.AGENT_INVOCATION,
            priority=TaskPriority.HIGH,
            payload={'agent': 'regulatory', 'action': 'scan'},
            tenant_id='tenant-123'
        )
        
        assert task.id is not None
        assert task.task_type == TaskType.AGENT_INVOCATION
        assert task.priority == TaskPriority.HIGH
        assert task.payload == {'agent': 'regulatory', 'action': 'scan'}
        assert task.tenant_id == 'tenant-123'
        assert task.delay_seconds == 0
    
    def test_task_message_with_delay(self):
        """Test creating a delayed task message."""
        task = TaskMessage(
            task_type=TaskType.NOTIFICATION,
            delay_seconds=300,
            payload={'message': 'test'}
        )
        
        assert task.delay_seconds == 300


class TestAWSSQSAdapter:
    """Tests for AWS SQS adapter."""
    
    def test_create_and_delete_queue(self):
        """Test queue creation and deletion."""
        adapter = AWSSQSAdapter(region='us-west-2')
        config = QueueConfig(name='test-queue', provider='aws')
        
        queue_url = adapter.create_queue(config)
        assert 'test-queue' in queue_url
        
        assert adapter.delete_queue('test-queue') is True
        assert adapter.delete_queue('nonexistent') is False
    
    def test_send_and_receive_tasks(self):
        """Test sending and receiving tasks."""
        adapter = AWSSQSAdapter(region='us-west-2')
        config = QueueConfig(name='test-queue', provider='aws')
        adapter.create_queue(config)
        
        task = TaskMessage(
            task_type=TaskType.AGENT_INVOCATION,
            payload={'test': 'data'}
        )
        
        message_id = adapter.send_task('test-queue', task)
        assert message_id is not None
        
        received = adapter.receive_tasks('test-queue', max_messages=1)
        assert len(received) == 1
        
        receipt_handle, received_task = received[0]
        assert received_task.payload == {'test': 'data'}
        
        adapter.delete_queue('test-queue')
    
    def test_priority_ordering(self):
        """Test that tasks are received in priority order."""
        adapter = AWSSQSAdapter(region='us-west-2')
        config = QueueConfig(name='priority-queue', provider='aws')
        adapter.create_queue(config)
        
        # Send tasks in reverse priority order
        task_low = TaskMessage(task_type=TaskType.NOTIFICATION, priority=TaskPriority.LOW, payload={'p': 'low'})
        task_normal = TaskMessage(task_type=TaskType.NOTIFICATION, priority=TaskPriority.NORMAL, payload={'p': 'normal'})
        task_high = TaskMessage(task_type=TaskType.NOTIFICATION, priority=TaskPriority.HIGH, payload={'p': 'high'})
        task_critical = TaskMessage(task_type=TaskType.NOTIFICATION, priority=TaskPriority.CRITICAL, payload={'p': 'critical'})
        
        adapter.send_task('priority-queue', task_low)
        adapter.send_task('priority-queue', task_normal)
        adapter.send_task('priority-queue', task_high)
        adapter.send_task('priority-queue', task_critical)
        
        # Receive all tasks
        received = adapter.receive_tasks('priority-queue', max_messages=4)
        
        # Should be in priority order: critical, high, normal, low
        priorities = [task.priority for _, task in received]
        assert priorities == [
            TaskPriority.CRITICAL,
            TaskPriority.HIGH,
            TaskPriority.NORMAL,
            TaskPriority.LOW
        ]
        
        adapter.delete_queue('priority-queue')
    
    def test_queue_stats(self):
        """Test getting queue statistics."""
        adapter = AWSSQSAdapter(region='us-west-2')
        config = QueueConfig(name='stats-queue', provider='aws')
        adapter.create_queue(config)
        
        # Send some tasks
        for i in range(5):
            task = TaskMessage(task_type=TaskType.NOTIFICATION, payload={'i': i})
            adapter.send_task('stats-queue', task)
        
        stats = adapter.get_queue_stats('stats-queue')
        assert stats.queue_name == 'stats-queue'
        assert stats.approximate_message_count == 5
        
        adapter.delete_queue('stats-queue')
    
    def test_delete_task(self):
        """Test deleting a task from the queue."""
        adapter = AWSSQSAdapter(region='us-west-2')
        config = QueueConfig(name='delete-queue', provider='aws')
        adapter.create_queue(config)
        
        task = TaskMessage(task_type=TaskType.NOTIFICATION, payload={'test': 1})
        adapter.send_task('delete-queue', task)
        
        received = adapter.receive_tasks('delete-queue', max_messages=1)
        receipt_handle, _ = received[0]
        
        assert adapter.delete_task('delete-queue', receipt_handle) is True
        
        # Queue should be empty now
        stats = adapter.get_queue_stats('delete-queue')
        assert stats.approximate_message_count == 0
        
        adapter.delete_queue('delete-queue')


class TestAzureServiceBusAdapter:
    """Tests for Azure Service Bus adapter."""
    
    def test_create_and_delete_queue(self):
        """Test queue creation and deletion."""
        adapter = AzureServiceBusAdapter(namespace='test-ns')
        config = QueueConfig(name='test-queue', provider='azure')
        
        queue_url = adapter.create_queue(config)
        assert 'test-queue' in queue_url
        
        assert adapter.delete_queue('test-queue') is True
    
    def test_send_and_receive_tasks(self):
        """Test sending and receiving tasks."""
        adapter = AzureServiceBusAdapter(namespace='test-ns')
        config = QueueConfig(name='test-queue', provider='azure')
        adapter.create_queue(config)
        
        task = TaskMessage(
            task_type=TaskType.AGENT_INVOCATION,
            payload={'test': 'azure'}
        )
        
        adapter.send_task('test-queue', task)
        
        received = adapter.receive_tasks('test-queue', max_messages=1)
        assert len(received) == 1
        
        _, received_task = received[0]
        assert received_task.payload == {'test': 'azure'}
        
        adapter.delete_queue('test-queue')


class TestTaskQueueWorker:
    """Tests for TaskQueueWorker."""
    
    def test_successful_task_processing(self):
        """Test processing a task successfully."""
        adapter = AWSSQSAdapter(region='us-west-2')
        config = QueueConfig(name='worker-queue', provider='aws')
        adapter.create_queue(config)
        
        results = []
        
        def handler(task: TaskMessage) -> TaskResult:
            results.append(task.payload)
            return TaskResult(task_id=task.id, status=TaskStatus.COMPLETED, result={'ok': True})
        
        worker_config = WorkerConfig(queue_name='worker-queue')
        worker = TaskQueueWorker(adapter, worker_config, {'notification': handler})
        
        task = TaskMessage(task_type=TaskType.NOTIFICATION, payload={'test': 'worker'})
        adapter.send_task('worker-queue', task)
        
        worker.poll_once()
        
        assert len(results) == 1
        assert results[0] == {'test': 'worker'}
        
        adapter.delete_queue('worker-queue')
    
    def test_task_progress_tracking(self):
        """Test task progress tracking."""
        adapter = AWSSQSAdapter(region='us-west-2')
        config = QueueConfig(name='progress-queue', provider='aws')
        adapter.create_queue(config)
        
        def handler(task: TaskMessage) -> TaskResult:
            return TaskResult(task_id=task.id, status=TaskStatus.COMPLETED)
        
        worker_config = WorkerConfig(queue_name='progress-queue')
        worker = TaskQueueWorker(adapter, worker_config, {'notification': handler})
        
        task = TaskMessage(task_type=TaskType.NOTIFICATION, payload={})
        adapter.send_task('progress-queue', task)
        
        # Before processing
        progress = worker.get_task_progress(task.id)
        assert progress is None
        
        worker.poll_once()
        
        # After processing - should have result
        result = worker.get_task_result(task.id)
        assert result is not None
        assert result.status == TaskStatus.COMPLETED
        
        adapter.delete_queue('progress-queue')


class TestAutoScalingManager:
    """Tests for AutoScalingManager."""
    
    def test_scale_up_on_queue_depth(self):
        """Test scaling up when queue depth exceeds threshold."""
        adapter = AWSSQSAdapter(region='us-west-2')
        config = QueueConfig(name='scale-queue', provider='aws')
        adapter.create_queue(config)
        
        scaling_config = ScalingConfig(
            enabled=True,
            min_workers=1,
            max_workers=5,
            scale_up_queue_depth_threshold=5,
            scale_up_increment=2,
        )
        
        def worker_factory():
            return TaskQueueWorker(
                adapter,
                WorkerConfig(queue_name='scale-queue'),
                {}
            )
        
        manager = AutoScalingManager(adapter, 'scale-queue', scaling_config, worker_factory)
        
        # Add messages to trigger scale-up
        for i in range(10):
            task = TaskMessage(task_type=TaskType.NOTIFICATION, payload={'i': i})
            adapter.send_task('scale-queue', task)
        
        assert manager.should_scale_up() is True
        
        workers_added = manager.scale_up()
        assert workers_added == 2
        assert manager.current_worker_count == 2
        
        manager.stop()
        adapter.delete_queue('scale-queue')
    
    def test_scale_down_on_low_queue_depth(self):
        """Test scaling down when queue depth is low."""
        adapter = AWSSQSAdapter(region='us-west-2')
        config = QueueConfig(name='scale-down-queue', provider='aws')
        adapter.create_queue(config)
        
        scaling_config = ScalingConfig(
            enabled=True,
            min_workers=1,
            max_workers=5,
            scale_down_queue_depth_threshold=2,
            scale_down_increment=1,
        )
        
        def worker_factory():
            return TaskQueueWorker(
                adapter,
                WorkerConfig(queue_name='scale-down-queue'),
                {}
            )
        
        manager = AutoScalingManager(adapter, 'scale-down-queue', scaling_config, worker_factory)
        
        # Start with multiple workers
        manager.scale_up()
        manager.scale_up()
        assert manager.current_worker_count >= 2
        
        # Queue is empty, should scale down
        manager._last_scale_down = None  # Reset cooldown
        assert manager.should_scale_down() is True
        
        workers_removed = manager.scale_down()
        assert workers_removed == 1
        
        manager.stop()
        adapter.delete_queue('scale-down-queue')
    
    def test_max_workers_limit(self):
        """Test that scaling respects max workers limit."""
        adapter = AWSSQSAdapter(region='us-west-2')
        config = QueueConfig(name='max-queue', provider='aws')
        adapter.create_queue(config)
        
        scaling_config = ScalingConfig(
            enabled=True,
            min_workers=1,
            max_workers=3,
            scale_up_queue_depth_threshold=1,
            scale_up_increment=2,
        )
        
        def worker_factory():
            return TaskQueueWorker(
                adapter,
                WorkerConfig(queue_name='max-queue'),
                {}
            )
        
        manager = AutoScalingManager(adapter, 'max-queue', scaling_config, worker_factory)
        
        # Add messages
        for i in range(100):
            task = TaskMessage(task_type=TaskType.NOTIFICATION, payload={'i': i})
            adapter.send_task('max-queue', task)
        
        # Try to scale up multiple times
        for _ in range(10):
            manager._last_scale_up = None
            manager.evaluate_and_scale()
        
        # Should not exceed max
        assert manager.current_worker_count <= scaling_config.max_workers
        
        manager.stop()
        adapter.delete_queue('max-queue')
    
    def test_scaling_metrics(self):
        """Test getting scaling metrics."""
        adapter = AWSSQSAdapter(region='us-west-2')
        config = QueueConfig(name='metrics-queue', provider='aws')
        adapter.create_queue(config)
        
        scaling_config = ScalingConfig(min_workers=1, max_workers=5)
        
        def worker_factory():
            return TaskQueueWorker(
                adapter,
                WorkerConfig(queue_name='metrics-queue'),
                {}
            )
        
        manager = AutoScalingManager(adapter, 'metrics-queue', scaling_config, worker_factory)
        
        metrics = manager.get_scaling_metrics()
        
        assert 'queue_depth' in metrics
        assert 'worker_count' in metrics
        assert 'min_workers' in metrics
        assert 'max_workers' in metrics
        
        manager.stop()
        adapter.delete_queue('metrics-queue')


class TestTaskQueueService:
    """Tests for TaskQueueService."""
    
    def test_service_creation(self):
        """Test creating a task queue service."""
        service = create_task_queue_service(
            provider_type='aws',
            queue_name='service-queue',
            region='us-west-2'
        )
        
        assert service.queue_url is not None
        assert 'service-queue' in service.queue_url
        
        service.shutdown()
    
    def test_send_and_track_task(self):
        """Test sending a task and tracking its status."""
        service = create_task_queue_service(
            provider_type='aws',
            queue_name='track-queue'
        )
        
        task_id = service.send_task(
            task_type='notification',
            payload={'message': 'test'},
            priority=TaskPriority.HIGH,
            tenant_id='tenant-123'
        )
        
        assert task_id is not None
        
        progress = service.get_task_status(task_id)
        assert progress is not None
        assert progress.status == TaskStatus.PENDING
        
        service.shutdown()
    
    def test_queue_stats(self):
        """Test getting queue statistics."""
        service = create_task_queue_service(
            provider_type='aws',
            queue_name='stats-service-queue'
        )
        
        # Send some tasks
        for i in range(3):
            service.send_task(
                task_type='notification',
                payload={'i': i}
            )
        
        stats = service.get_queue_stats()
        assert stats.approximate_message_count == 3
        
        service.shutdown()
    
    def test_register_handler(self):
        """Test registering a task handler."""
        service = create_task_queue_service(
            provider_type='aws',
            queue_name='handler-queue'
        )
        
        def my_handler(task: TaskMessage) -> TaskResult:
            return TaskResult(task_id=task.id, status=TaskStatus.COMPLETED)
        
        service.register_handler('notification', my_handler)
        
        assert 'notification' in service._handlers
        
        service.shutdown()
    
    def test_enable_auto_scaling(self):
        """Test enabling auto-scaling."""
        service = create_task_queue_service(
            provider_type='aws',
            queue_name='autoscale-queue'
        )
        
        scaling_config = ScalingConfig(min_workers=1, max_workers=5)
        manager = service.enable_auto_scaling(scaling_config)
        
        assert manager is not None
        
        metrics = service.get_scaling_metrics()
        assert metrics is not None
        assert 'worker_count' in metrics
        
        service.shutdown()


class TestFactoryFunction:
    """Tests for the factory function."""
    
    def test_create_aws_service(self):
        """Test creating an AWS-based service."""
        service = create_task_queue_service(
            provider_type='aws',
            queue_name='aws-factory-queue',
            region='us-east-1'
        )
        
        assert service is not None
        assert 'aws-factory-queue' in service.queue_url
        
        service.shutdown()
    
    def test_create_azure_service(self):
        """Test creating an Azure-based service."""
        service = create_task_queue_service(
            provider_type='azure',
            queue_name='azure-factory-queue'
        )
        
        assert service is not None
        assert 'azure-factory-queue' in service.queue_url
        
        service.shutdown()
    
    def test_invalid_provider(self):
        """Test that invalid provider raises error."""
        with pytest.raises(ValueError, match="Unknown provider type"):
            create_task_queue_service(provider_type='invalid')

"""
AWS AgentCore Memory provider implementation.

This module implements the MemoryStoreProvider protocol using
AWS Bedrock AgentCore Memory for persistent storage.

Requirements: 21.2
"""

from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

from cloud.base import (
    MemoryStoreProvider,
    MemoryConfig,
    MemoryStoreResult,
)


class AWSMemoryStoreProvider:
    """
    AWS implementation of MemoryStoreProvider using AgentCore Memory.
    
    This provider creates and manages memory stores for agent
    conversations and knowledge persistence.
    
    Requirements: 21.2
    """
    
    def __init__(self, region: str = "us-west-2"):
        """
        Initialize the AWS Memory Store provider.
        
        Args:
            region: AWS region for AgentCore Memory
        """
        self.region = region
        self._client = None
        
        # In-memory storage for local development/testing
        self._memory_stores: dict[str, MemoryStoreResult] = {}
        self._events: dict[str, list[dict[str, Any]]] = {}
    
    @property
    def client(self):
        """Lazy-load the AgentCore Memory client."""
        if self._client is None:
            try:
                from bedrock_agentcore.memory import MemoryClient
                self._client = MemoryClient(region_name=self.region)
            except ImportError:
                # AgentCore SDK not available
                self._client = None
        return self._client
    
    def create_memory_store(self, config: MemoryConfig) -> MemoryStoreResult:
        """
        Create a new memory store.
        
        Args:
            config: Memory store configuration
            
        Returns:
            Memory store creation result
        """
        memory_id = f"memory-{uuid4().hex[:12]}"
        
        if self.client:
            try:
                response = self.client.create_memory(
                    memory_name=config.name,
                    retention_days=config.retention_days,
                    encryption_enabled=config.encryption_enabled,
                    encryption_key_id=config.encryption_key_id,
                    tags=config.tags,
                )
                memory_id = response.get("memory_id", memory_id)
                endpoint_url = response.get("endpoint_url")
                status = "active"
            except Exception:
                endpoint_url = f"https://memory.{self.region}.amazonaws.com/{memory_id}"
                status = "active"
        else:
            # Local development mode
            endpoint_url = f"http://localhost:8081/memory/{memory_id}"
            status = "active"
        
        result = MemoryStoreResult(
            memory_id=memory_id,
            memory_name=config.name,
            endpoint_url=endpoint_url,
            status=status,
            provider="aws",
            metadata={
                "retention_days": config.retention_days,
                "encryption_enabled": config.encryption_enabled,
                "region": self.region,
            },
        )
        
        self._memory_stores[memory_id] = result
        self._events[memory_id] = []
        return result
    
    def store_event(
        self,
        memory_id: str,
        session_id: str,
        actor_id: str,
        event_type: str,
        data: dict[str, Any]
    ) -> str:
        """
        Store an event in the memory store.
        
        Args:
            memory_id: Memory store identifier
            session_id: Session identifier
            actor_id: Actor identifier
            event_type: Type of event
            data: Event data
            
        Returns:
            Event identifier
        """
        event_id = f"event-{uuid4().hex[:12]}"
        
        event = {
            "event_id": event_id,
            "memory_id": memory_id,
            "session_id": session_id,
            "actor_id": actor_id,
            "event_type": event_type,
            "data": data,
            "timestamp": datetime.now().isoformat(),
        }
        
        if self.client:
            try:
                response = self.client.store_event(
                    memory_id=memory_id,
                    session_id=session_id,
                    actor_id=actor_id,
                    event_type=event_type,
                    data=data,
                )
                event_id = response.get("event_id", event_id)
            except Exception:
                pass
        
        # Store locally as well
        if memory_id not in self._events:
            self._events[memory_id] = []
        self._events[memory_id].append(event)
        
        return event_id
    
    def get_events(
        self,
        memory_id: str,
        session_id: Optional[str] = None,
        actor_id: Optional[str] = None,
        event_type: Optional[str] = None,
        since: Optional[datetime] = None,
        limit: Optional[int] = None
    ) -> list[dict[str, Any]]:
        """
        Retrieve events from the memory store.
        
        Args:
            memory_id: Memory store identifier
            session_id: Optional session filter
            actor_id: Optional actor filter
            event_type: Optional event type filter
            since: Optional datetime filter
            limit: Optional result limit
            
        Returns:
            List of events
        """
        if self.client:
            try:
                response = self.client.get_events(
                    memory_id=memory_id,
                    session_id=session_id,
                    actor_id=actor_id,
                    event_type=event_type,
                    since=since.isoformat() if since else None,
                    limit=limit,
                )
                return response.get("events", [])
            except Exception:
                pass
        
        # Filter from local storage
        events = self._events.get(memory_id, [])
        
        if session_id:
            events = [e for e in events if e["session_id"] == session_id]
        if actor_id:
            events = [e for e in events if e["actor_id"] == actor_id]
        if event_type:
            events = [e for e in events if e["event_type"] == event_type]
        if since:
            events = [
                e for e in events
                if datetime.fromisoformat(e["timestamp"]) >= since
            ]
        
        # Sort by timestamp descending
        events = sorted(events, key=lambda e: e["timestamp"], reverse=True)
        
        if limit:
            events = events[:limit]
        
        return events
    
    def delete_memory_store(self, memory_id: str) -> bool:
        """
        Delete a memory store.
        
        Args:
            memory_id: Memory store identifier
            
        Returns:
            True if deleted successfully
        """
        if self.client:
            try:
                self.client.delete_memory(memory_id=memory_id)
            except Exception:
                pass
        
        # Remove from local storage
        if memory_id in self._memory_stores:
            del self._memory_stores[memory_id]
            self._events.pop(memory_id, None)
            return True
        
        return False
    
    def get_memory_store_status(self, memory_id: str) -> dict[str, Any]:
        """
        Get the status of a memory store.
        
        Args:
            memory_id: Memory store identifier
            
        Returns:
            Memory store status information
        """
        if self.client:
            try:
                return self.client.get_memory(memory_id=memory_id)
            except Exception:
                pass
        
        # Check local storage
        if memory_id in self._memory_stores:
            store = self._memory_stores[memory_id]
            return {
                "memory_id": store.memory_id,
                "memory_name": store.memory_name,
                "status": store.status,
                "endpoint_url": store.endpoint_url,
                "created_at": store.created_at.isoformat(),
                "event_count": len(self._events.get(memory_id, [])),
            }
        
        return {"memory_id": memory_id, "status": "not_found"}

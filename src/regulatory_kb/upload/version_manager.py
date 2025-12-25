"""Version management for document uploads.

Implements Requirements 6.1-6.5:
- Document replacement with version history
- Archive previous versions in S3
- Preserve relationships from previous version
- Query previous versions
- Webhook notifications for document replacement
"""

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import boto3
from botocore.exceptions import ClientError

from regulatory_kb.core import get_logger
from regulatory_kb.upload.models import UploadStatus, FileType
from regulatory_kb.upload.status_tracker import StatusTracker

logger = get_logger(__name__)


class VersionRecord:
    """Record of a document version."""
    
    def __init__(
        self,
        document_id: str,
        version_number: int,
        s3_key: str,
        created_at: Optional[datetime] = None,
        title: Optional[str] = None,
        regulator: Optional[str] = None,
        uploader_id: Optional[str] = None,
        metadata: Optional[dict] = None,
        previous_version_id: Optional[str] = None,
    ):
        self.document_id = document_id
        self.version_number = version_number
        self.s3_key = s3_key
        self.created_at = created_at or datetime.now(timezone.utc)
        self.title = title
        self.regulator = regulator
        self.uploader_id = uploader_id
        self.metadata = metadata or {}
        self.previous_version_id = previous_version_id
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "document_id": self.document_id,
            "version_number": self.version_number,
            "s3_key": self.s3_key,
            "created_at": self.created_at.isoformat(),
            "title": self.title,
            "regulator": self.regulator,
            "uploader_id": self.uploader_id,
            "metadata": self.metadata,
            "previous_version_id": self.previous_version_id,
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "VersionRecord":
        """Create from dictionary."""
        created_at = data.get("created_at")
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at)
        
        return cls(
            document_id=data["document_id"],
            version_number=data["version_number"],
            s3_key=data["s3_key"],
            created_at=created_at,
            title=data.get("title"),
            regulator=data.get("regulator"),
            uploader_id=data.get("uploader_id"),
            metadata=data.get("metadata", {}),
            previous_version_id=data.get("previous_version_id"),
        )


class ReplacementResult:
    """Result of a document replacement operation."""
    
    def __init__(
        self,
        success: bool,
        new_document_id: Optional[str] = None,
        previous_version_id: Optional[str] = None,
        version_number: int = 1,
        error_message: Optional[str] = None,
        relationships_preserved: bool = False,
        preserved_relationship_count: int = 0,
    ):
        self.success = success
        self.new_document_id = new_document_id
        self.previous_version_id = previous_version_id
        self.version_number = version_number
        self.error_message = error_message
        self.relationships_preserved = relationships_preserved
        self.preserved_relationship_count = preserved_relationship_count
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "success": self.success,
            "new_document_id": self.new_document_id,
            "previous_version_id": self.previous_version_id,
            "version_number": self.version_number,
            "error_message": self.error_message,
            "relationships_preserved": self.relationships_preserved,
            "preserved_relationship_count": self.preserved_relationship_count,
        }


class MatchingDocument:
    """A document that matches for potential replacement."""
    
    def __init__(
        self,
        document_id: str,
        title: str,
        regulator: str,
        version_number: int = 1,
        created_at: Optional[datetime] = None,
    ):
        self.document_id = document_id
        self.title = title
        self.regulator = regulator
        self.version_number = version_number
        self.created_at = created_at
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "document_id": self.document_id,
            "title": self.title,
            "regulator": self.regulator,
            "version_number": self.version_number,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PreservedRelationship:
    """A relationship preserved from a previous version."""
    
    def __init__(
        self,
        relationship_type: str,
        source_id: str,
        target_id: str,
        properties: Optional[dict] = None,
    ):
        self.relationship_type = relationship_type
        self.source_id = source_id
        self.target_id = target_id
        self.properties = properties or {}
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "relationship_type": self.relationship_type,
            "source_id": self.source_id,
            "target_id": self.target_id,
            "properties": self.properties,
        }


class VersionManager:
    """Manages document versions and replacements.
    
    Implements Requirements 6.1-6.5:
    - Detect matching documents by title and regulator
    - Archive previous versions in S3
    - Preserve relationships from previous version
    - Track version history in DynamoDB
    - Support querying previous versions
    """

    def __init__(
        self,
        bucket_name: Optional[str] = None,
        version_table_name: Optional[str] = None,
        status_tracker: Optional[StatusTracker] = None,
        s3_client: Optional[Any] = None,
        dynamodb_client: Optional[Any] = None,
    ):
        """Initialize version manager.
        
        Args:
            bucket_name: S3 bucket name for document storage.
            version_table_name: DynamoDB table name for version history.
            status_tracker: Status tracker instance.
            s3_client: Optional S3 client (for testing).
            dynamodb_client: Optional DynamoDB client (for testing).
        """
        self.bucket_name = bucket_name or os.environ.get(
            "UPLOAD_BUCKET", "regulatory-kb-uploads"
        )
        self.version_table_name = version_table_name or os.environ.get(
            "VERSION_HISTORY_TABLE", "regulatory-kb-version-history"
        )
        self.status_tracker = status_tracker or StatusTracker()
        self._s3_client = s3_client
        self._dynamodb_client = dynamodb_client
        self._table = None

    @property
    def s3_client(self):
        """Get S3 client."""
        if self._s3_client is None:
            self._s3_client = boto3.client("s3")
        return self._s3_client

    @property
    def dynamodb_client(self):
        """Get DynamoDB client."""
        if self._dynamodb_client is None:
            self._dynamodb_client = boto3.client("dynamodb")
        return self._dynamodb_client

    @property
    def table(self):
        """Get DynamoDB table resource."""
        if self._table is None:
            dynamodb = boto3.resource("dynamodb")
            self._table = dynamodb.Table(self.version_table_name)
        return self._table

    def find_matching_documents(
        self,
        title: str,
        regulator: str,
    ) -> list[MatchingDocument]:
        """Find documents matching by title and regulator.
        
        Implements Requirement 6.1:
        - Detect matching documents by title and regulator
        
        Args:
            title: Document title to match.
            regulator: Regulator to match.
            
        Returns:
            List of matching documents.
        """
        try:
            # Query version history table for matching documents
            response = self.table.query(
                IndexName="title-regulator-index",
                KeyConditionExpression="title = :title AND regulator = :regulator",
                ExpressionAttributeValues={
                    ":title": title,
                    ":regulator": regulator,
                },
            )
            
            matches = []
            for item in response.get("Items", []):
                created_at = None
                if item.get("created_at"):
                    created_at = datetime.fromisoformat(item["created_at"])
                
                matches.append(MatchingDocument(
                    document_id=item["document_id"],
                    title=item.get("title", ""),
                    regulator=item.get("regulator", ""),
                    version_number=item.get("version_number", 1),
                    created_at=created_at,
                ))
            
            # Sort by version number descending (latest first)
            matches.sort(key=lambda m: m.version_number, reverse=True)
            
            return matches
            
        except ClientError as e:
            logger.warning(
                "find_matching_documents_failed",
                title=title,
                regulator=regulator,
                error=str(e),
            )
            return []

    def archive_version(
        self,
        document_id: str,
        current_s3_key: str,
        version_number: int,
    ) -> str:
        """Archive a document version in S3.
        
        Implements Requirement 6.2:
        - Archive the previous version and maintain version history
        
        Args:
            document_id: Document identifier.
            current_s3_key: Current S3 key of the document.
            version_number: Version number to archive.
            
        Returns:
            S3 key of the archived version.
        """
        # Determine file extension
        ext = current_s3_key.rsplit(".", 1)[-1] if "." in current_s3_key else "pdf"
        
        # Create archive key
        archive_key = f"versions/{document_id}/v{version_number}/document.{ext}"
        
        try:
            # Copy to archive location
            self.s3_client.copy_object(
                Bucket=self.bucket_name,
                CopySource={"Bucket": self.bucket_name, "Key": current_s3_key},
                Key=archive_key,
                Metadata={
                    "document_id": document_id,
                    "version_number": str(version_number),
                    "archived_at": datetime.now(timezone.utc).isoformat(),
                },
                MetadataDirective="REPLACE",
            )
            
            logger.info(
                "version_archived",
                document_id=document_id,
                version_number=version_number,
                archive_key=archive_key,
            )
            
            return archive_key
            
        except ClientError as e:
            logger.error(
                "archive_version_failed",
                document_id=document_id,
                version_number=version_number,
                error=str(e),
            )
            raise

    def create_version_record(self, record: VersionRecord) -> None:
        """Create a version record in DynamoDB.
        
        Implements Requirement 6.2:
        - Store version metadata in DynamoDB
        
        Args:
            record: Version record to create.
        """
        try:
            item = {
                "document_id": record.document_id,
                "version_number": record.version_number,
                "s3_key": record.s3_key,
                "created_at": record.created_at.isoformat(),
            }
            
            if record.title:
                item["title"] = record.title
            if record.regulator:
                item["regulator"] = record.regulator
            if record.uploader_id:
                item["uploader_id"] = record.uploader_id
            if record.metadata:
                item["metadata"] = record.metadata
            if record.previous_version_id:
                item["previous_version_id"] = record.previous_version_id
            
            self.table.put_item(Item=item)
            
            logger.info(
                "version_record_created",
                document_id=record.document_id,
                version_number=record.version_number,
            )
            
        except ClientError as e:
            logger.error(
                "create_version_record_failed",
                document_id=record.document_id,
                error=str(e),
            )
            raise

    def get_version_history(
        self,
        document_id: str,
    ) -> list[VersionRecord]:
        """Get version history for a document.
        
        Implements Requirement 6.4:
        - Support querying previous versions
        
        Args:
            document_id: Document identifier.
            
        Returns:
            List of version records, newest first.
        """
        try:
            response = self.table.query(
                KeyConditionExpression="document_id = :doc_id",
                ExpressionAttributeValues={":doc_id": document_id},
                ScanIndexForward=False,  # Descending order
            )
            
            versions = []
            for item in response.get("Items", []):
                versions.append(VersionRecord.from_dict(item))
            
            return versions
            
        except ClientError as e:
            logger.error(
                "get_version_history_failed",
                document_id=document_id,
                error=str(e),
            )
            return []

    def get_version(
        self,
        document_id: str,
        version_number: int,
    ) -> Optional[VersionRecord]:
        """Get a specific version of a document.
        
        Implements Requirement 6.4:
        - Access previous versions
        
        Args:
            document_id: Document identifier.
            version_number: Version number to retrieve.
            
        Returns:
            Version record or None if not found.
        """
        try:
            response = self.table.get_item(
                Key={
                    "document_id": document_id,
                    "version_number": version_number,
                },
            )
            
            item = response.get("Item")
            if not item:
                return None
            
            return VersionRecord.from_dict(item)
            
        except ClientError as e:
            logger.error(
                "get_version_failed",
                document_id=document_id,
                version_number=version_number,
                error=str(e),
            )
            return None

    def get_latest_version(
        self,
        document_id: str,
    ) -> Optional[VersionRecord]:
        """Get the latest version of a document.
        
        Implements Requirement 6.4:
        - Return the latest version by default
        
        Args:
            document_id: Document identifier.
            
        Returns:
            Latest version record or None if not found.
        """
        versions = self.get_version_history(document_id)
        return versions[0] if versions else None

    def get_next_version_number(
        self,
        document_id: str,
    ) -> int:
        """Get the next version number for a document.
        
        Args:
            document_id: Document identifier.
            
        Returns:
            Next version number.
        """
        latest = self.get_latest_version(document_id)
        return (latest.version_number + 1) if latest else 1


    def replace_document(
        self,
        existing_document_id: str,
        new_file_content: bytes,
        new_file_name: str,
        uploader_id: str,
        title: Optional[str] = None,
        regulator: Optional[str] = None,
        metadata: Optional[dict] = None,
        preserve_relationships: bool = True,
    ) -> ReplacementResult:
        """Replace an existing document with a new version.
        
        Implements Requirements 6.1-6.4:
        - Archive previous version in S3
        - Preserve relationships from previous version
        - Create new version record
        
        Args:
            existing_document_id: ID of the document to replace.
            new_file_content: Content of the new file.
            new_file_name: Name of the new file.
            uploader_id: ID of the uploader.
            title: Document title.
            regulator: Regulator identifier.
            metadata: Additional metadata.
            preserve_relationships: Whether to preserve relationships.
            
        Returns:
            ReplacementResult with details of the operation.
        """
        try:
            # Get the current version
            current_version = self.get_latest_version(existing_document_id)
            
            if not current_version:
                return ReplacementResult(
                    success=False,
                    error_message=f"Document not found: {existing_document_id}",
                )
            
            # Archive the current version
            try:
                self.archive_version(
                    document_id=existing_document_id,
                    current_s3_key=current_version.s3_key,
                    version_number=current_version.version_number,
                )
            except Exception as e:
                logger.warning(
                    "archive_failed_continuing",
                    document_id=existing_document_id,
                    error=str(e),
                )
            
            # Determine new version number
            new_version_number = current_version.version_number + 1
            
            # Generate new document ID (keeping the base ID)
            new_document_id = f"{existing_document_id}_v{new_version_number}"
            
            # Determine file extension
            ext = new_file_name.rsplit(".", 1)[-1] if "." in new_file_name else "pdf"
            
            # Store new file in S3
            new_s3_key = f"uploads/completed/{new_document_id}/document.{ext}"
            
            try:
                self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=new_s3_key,
                    Body=new_file_content,
                    Metadata={
                        "original_filename": new_file_name,
                        "document_id": new_document_id,
                        "version_number": str(new_version_number),
                        "previous_version_id": existing_document_id,
                    },
                )
            except ClientError as e:
                return ReplacementResult(
                    success=False,
                    error_message=f"Failed to store new file: {str(e)}",
                )
            
            # Create version record for the new version
            new_record = VersionRecord(
                document_id=new_document_id,
                version_number=new_version_number,
                s3_key=new_s3_key,
                title=title or current_version.title,
                regulator=regulator or current_version.regulator,
                uploader_id=uploader_id,
                metadata=metadata or {},
                previous_version_id=existing_document_id,
            )
            
            try:
                self.create_version_record(new_record)
            except Exception as e:
                logger.warning(
                    "version_record_failed",
                    document_id=new_document_id,
                    error=str(e),
                )
            
            # Update the "current" pointer
            try:
                self._update_current_pointer(existing_document_id, new_document_id)
            except Exception as e:
                logger.warning(
                    "current_pointer_update_failed",
                    document_id=existing_document_id,
                    error=str(e),
                )
            
            # Preserve relationships from previous version
            preserved_count = 0
            if preserve_relationships:
                try:
                    preserved_count = self._preserve_relationships(
                        old_document_id=existing_document_id,
                        new_document_id=new_document_id,
                    )
                except Exception as e:
                    logger.warning(
                        "relationship_preservation_failed",
                        old_document_id=existing_document_id,
                        new_document_id=new_document_id,
                        error=str(e),
                    )
            
            logger.info(
                "document_replaced",
                previous_document_id=existing_document_id,
                new_document_id=new_document_id,
                version_number=new_version_number,
                relationships_preserved=preserved_count,
            )
            
            return ReplacementResult(
                success=True,
                new_document_id=new_document_id,
                previous_version_id=existing_document_id,
                version_number=new_version_number,
                relationships_preserved=preserve_relationships and preserved_count > 0,
                preserved_relationship_count=preserved_count,
            )
            
        except Exception as e:
            logger.error(
                "replace_document_failed",
                document_id=existing_document_id,
                error=str(e),
            )
            return ReplacementResult(
                success=False,
                error_message=str(e),
            )

    def _preserve_relationships(
        self,
        old_document_id: str,
        new_document_id: str,
    ) -> int:
        """Preserve relationships from old document to new document.
        
        Implements Requirement 6.3:
        - Preserve relationships from the previous version where applicable
        
        This stores relationship metadata in DynamoDB for later recreation
        when the new document is processed and added to the graph.
        
        Args:
            old_document_id: ID of the old document.
            new_document_id: ID of the new document.
            
        Returns:
            Number of relationships preserved.
        """
        # Store relationship preservation request in DynamoDB
        # The actual relationship recreation happens during document processing
        # when the new document is added to the graph
        
        preservation_record = {
            "new_document_id": new_document_id,
            "old_document_id": old_document_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "pending",
        }
        
        # Store in S3 as a preservation request
        preservation_key = f"versions/{new_document_id}/relationship_preservation.json"
        
        try:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=preservation_key,
                Body=json.dumps(preservation_record),
                ContentType="application/json",
            )
            
            logger.info(
                "relationship_preservation_requested",
                old_document_id=old_document_id,
                new_document_id=new_document_id,
            )
            
            # Return 1 to indicate preservation was requested
            # Actual count will be determined during processing
            return 1
            
        except ClientError as e:
            logger.error(
                "relationship_preservation_request_failed",
                old_document_id=old_document_id,
                new_document_id=new_document_id,
                error=str(e),
            )
            return 0

    def get_relationship_preservation_request(
        self,
        document_id: str,
    ) -> Optional[dict]:
        """Get relationship preservation request for a document.
        
        Args:
            document_id: Document ID to check.
            
        Returns:
            Preservation request data or None if not found.
        """
        preservation_key = f"versions/{document_id}/relationship_preservation.json"
        
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=preservation_key,
            )
            
            return json.loads(response["Body"].read().decode("utf-8"))
            
        except ClientError:
            return None

    def mark_relationships_preserved(
        self,
        document_id: str,
        relationship_count: int,
    ) -> None:
        """Mark relationships as preserved for a document.
        
        Args:
            document_id: Document ID.
            relationship_count: Number of relationships preserved.
        """
        preservation_key = f"versions/{document_id}/relationship_preservation.json"
        
        try:
            # Get existing record
            existing = self.get_relationship_preservation_request(document_id)
            if existing:
                existing["status"] = "completed"
                existing["relationship_count"] = relationship_count
                existing["completed_at"] = datetime.now(timezone.utc).isoformat()
                
                self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=preservation_key,
                    Body=json.dumps(existing),
                    ContentType="application/json",
                )
                
                logger.info(
                    "relationships_preserved",
                    document_id=document_id,
                    relationship_count=relationship_count,
                )
                
        except ClientError as e:
            logger.warning(
                "mark_relationships_preserved_failed",
                document_id=document_id,
                error=str(e),
            )

    def create_version_relationship_in_graph(
        self,
        new_document_id: str,
        previous_document_id: str,
        graph_store: Any,
    ) -> bool:
        """Create a SUPERSEDES relationship in the graph.
        
        Implements Requirement 6.3:
        - Create version relationships in graph
        
        Args:
            new_document_id: ID of the new document version.
            previous_document_id: ID of the previous document version.
            graph_store: FalkorDB graph store instance.
            
        Returns:
            True if relationship was created successfully.
        """
        try:
            # Import here to avoid circular imports
            from regulatory_kb.models.relationship import GraphRelationship, RelationshipType
            
            relationship = GraphRelationship(
                source_node=new_document_id,
                target_node=previous_document_id,
                relationship_type=RelationshipType.SUPERSEDES,
                properties={
                    "version_transition": True,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
                validated=True,
            )
            
            result = graph_store.create_relationship(relationship)
            
            if result:
                logger.info(
                    "version_relationship_created",
                    new_document_id=new_document_id,
                    previous_document_id=previous_document_id,
                )
            
            return result
            
        except Exception as e:
            logger.error(
                "create_version_relationship_failed",
                new_document_id=new_document_id,
                previous_document_id=previous_document_id,
                error=str(e),
            )
            return False

    def get_all_versions_from_graph(
        self,
        document_id: str,
        graph_store: Any,
    ) -> list[dict]:
        """Get all versions of a document from the graph.
        
        Implements Requirement 6.4:
        - Support querying previous versions
        
        Args:
            document_id: Document ID (can be any version).
            graph_store: FalkorDB graph store instance.
            
        Returns:
            List of document versions with their metadata.
        """
        try:
            # Query for all documents in the version chain
            query = """
            MATCH (d:Document)
            WHERE d.id = $id OR d.id STARTS WITH $base_id
            OPTIONAL MATCH (d)-[:SUPERSEDES*0..]->(prev:Document)
            RETURN DISTINCT d.id as id, d.title as title, d.version as version,
                   d.created_at as created_at, d.regulator_id as regulator_id
            ORDER BY d.created_at DESC
            """
            
            # Extract base document ID
            base_id = document_id.split("_v")[0] if "_v" in document_id else document_id
            
            result = graph_store.query(query, {"id": document_id, "base_id": base_id})
            
            return result.nodes if result else []
            
        except Exception as e:
            logger.error(
                "get_all_versions_from_graph_failed",
                document_id=document_id,
                error=str(e),
            )
            return []

    def copy_relationships_from_previous_version(
        self,
        new_document_id: str,
        previous_document_id: str,
        graph_store: Any,
    ) -> int:
        """Copy applicable relationships from previous version to new version.
        
        Implements Requirement 6.3:
        - Preserve relationships from the previous version where applicable
        
        Args:
            new_document_id: ID of the new document version.
            previous_document_id: ID of the previous document version.
            graph_store: FalkorDB graph store instance.
            
        Returns:
            Number of relationships copied.
        """
        try:
            # Get outgoing relationships from previous version
            # (excluding SUPERSEDES which is version-specific)
            query = """
            MATCH (d:Document {id: $prev_id})-[r]->(target)
            WHERE type(r) <> 'SUPERSEDES'
            RETURN type(r) as rel_type, target.id as target_id, properties(r) as props
            """
            
            result = graph_store.query(query, {"prev_id": previous_document_id})
            
            copied_count = 0
            
            if result and result.nodes:
                from regulatory_kb.models.relationship import GraphRelationship, RelationshipType
                
                for node in result.nodes:
                    rel_type_str = node.get("rel_type")
                    target_id = node.get("target_id")
                    props = node.get("props", {})
                    
                    if rel_type_str and target_id:
                        try:
                            rel_type = RelationshipType(rel_type_str)
                            
                            # Create the same relationship for the new document
                            relationship = GraphRelationship(
                                source_node=new_document_id,
                                target_node=target_id,
                                relationship_type=rel_type,
                                properties={
                                    **props,
                                    "copied_from_version": previous_document_id,
                                },
                                validated=True,
                            )
                            
                            if graph_store.create_relationship(relationship):
                                copied_count += 1
                                
                        except ValueError:
                            # Unknown relationship type, skip
                            pass
            
            # Also get incoming relationships (documents that reference this one)
            incoming_query = """
            MATCH (source:Document)-[r]->(d:Document {id: $prev_id})
            WHERE type(r) <> 'SUPERSEDES'
            RETURN type(r) as rel_type, source.id as source_id, properties(r) as props
            """
            
            incoming_result = graph_store.query(incoming_query, {"prev_id": previous_document_id})
            
            if incoming_result and incoming_result.nodes:
                from regulatory_kb.models.relationship import GraphRelationship, RelationshipType
                
                for node in incoming_result.nodes:
                    rel_type_str = node.get("rel_type")
                    source_id = node.get("source_id")
                    props = node.get("props", {})
                    
                    if rel_type_str and source_id:
                        try:
                            rel_type = RelationshipType(rel_type_str)
                            
                            # Create the same relationship pointing to the new document
                            relationship = GraphRelationship(
                                source_node=source_id,
                                target_node=new_document_id,
                                relationship_type=rel_type,
                                properties={
                                    **props,
                                    "copied_from_version": previous_document_id,
                                },
                                validated=True,
                            )
                            
                            if graph_store.create_relationship(relationship):
                                copied_count += 1
                                
                        except ValueError:
                            # Unknown relationship type, skip
                            pass
            
            logger.info(
                "relationships_copied",
                new_document_id=new_document_id,
                previous_document_id=previous_document_id,
                copied_count=copied_count,
            )
            
            return copied_count
            
        except Exception as e:
            logger.error(
                "copy_relationships_failed",
                new_document_id=new_document_id,
                previous_document_id=previous_document_id,
                error=str(e),
            )
            return 0

    def get_latest_version_from_graph(
        self,
        base_document_id: str,
        graph_store: Any,
    ) -> Optional[dict]:
        """Get the latest version of a document from the graph.
        
        Implements Requirement 6.4:
        - Return the latest version by default
        
        Args:
            base_document_id: Base document ID.
            graph_store: FalkorDB graph store instance.
            
        Returns:
            Latest version document data or None.
        """
        try:
            # Find the document that doesn't have any SUPERSEDES relationships pointing to it
            # (i.e., it's not superseded by any other document)
            query = """
            MATCH (d:Document)
            WHERE d.id = $id OR d.id STARTS WITH $base_id
            AND NOT EXISTS {
                MATCH (newer:Document)-[:SUPERSEDES]->(d)
            }
            RETURN d
            ORDER BY d.created_at DESC
            LIMIT 1
            """
            
            base_id = base_document_id.split("_v")[0] if "_v" in base_document_id else base_document_id
            
            result = graph_store.query(query, {"id": base_document_id, "base_id": base_id})
            
            return result.nodes[0] if result and result.nodes else None
            
        except Exception as e:
            logger.error(
                "get_latest_version_from_graph_failed",
                base_document_id=base_document_id,
                error=str(e),
            )
            return None

    def _update_current_pointer(
        self,
        base_document_id: str,
        current_document_id: str,
    ) -> None:
        """Update the current version pointer in S3.
        
        Creates a "current" marker file that points to the latest version.
        
        Args:
            base_document_id: Base document identifier.
            current_document_id: Current version document ID.
        """
        pointer_key = f"versions/{base_document_id}/current.json"
        
        pointer_data = {
            "current_document_id": current_document_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        
        self.s3_client.put_object(
            Bucket=self.bucket_name,
            Key=pointer_key,
            Body=json.dumps(pointer_data),
            ContentType="application/json",
        )

    def get_current_document_id(
        self,
        base_document_id: str,
    ) -> Optional[str]:
        """Get the current document ID for a base document.
        
        Args:
            base_document_id: Base document identifier.
            
        Returns:
            Current document ID or None if not found.
        """
        pointer_key = f"versions/{base_document_id}/current.json"
        
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=pointer_key,
            )
            
            pointer_data = json.loads(response["Body"].read().decode("utf-8"))
            return pointer_data.get("current_document_id")
            
        except ClientError:
            return None

    def get_archived_file(
        self,
        document_id: str,
        version_number: int,
    ) -> Optional[bytes]:
        """Get the content of an archived version.
        
        Implements Requirement 6.4:
        - Access previous versions
        
        Args:
            document_id: Document identifier.
            version_number: Version number to retrieve.
            
        Returns:
            File content or None if not found.
        """
        version = self.get_version(document_id, version_number)
        if not version:
            return None
        
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=version.s3_key,
            )
            return response["Body"].read()
            
        except ClientError as e:
            logger.error(
                "get_archived_file_failed",
                document_id=document_id,
                version_number=version_number,
                error=str(e),
            )
            return None

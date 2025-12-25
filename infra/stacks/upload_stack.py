"""Upload stack for document upload infrastructure.

Implements Requirements 1.1-1.7, 4.1-4.5, 5.1-5.5:
- Upload API Lambda handler
- DynamoDB table for status tracking
- S3 bucket structure for uploads
- SQS queue for processing
"""

import os
import subprocess
import shutil

from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    CfnOutput,
    aws_lambda as lambda_,
    aws_apigateway as apigw,
    aws_iam as iam,
    aws_logs as logs,
    aws_dynamodb as dynamodb,
    aws_s3 as s3,
    aws_sqs as sqs,
    aws_lambda_event_sources as lambda_event_sources,
)
from constructs import Construct

from infra.stacks.storage_stack import StorageStack


def create_lambda_package():
    """Create a Lambda deployment package with dependencies."""
    package_dir = os.path.join(os.getcwd(), ".lambda-package")
    
    if os.path.exists(package_dir):
        shutil.rmtree(package_dir)
    os.makedirs(package_dir)
    
    subprocess.run(
        ["pip", "install", "-r", "lambda-requirements.txt", "-t", package_dir, "--quiet"],
        check=True,
    )
    
    src_handlers = "src/handlers"
    src_regulatory_kb = "src/regulatory_kb"
    
    if os.path.exists(src_handlers):
        shutil.copytree(src_handlers, os.path.join(package_dir, "handlers"), dirs_exist_ok=True)
    if os.path.exists(src_regulatory_kb):
        shutil.copytree(src_regulatory_kb, os.path.join(package_dir, "regulatory_kb"), dirs_exist_ok=True)
    
    return package_dir


class UploadStack(Stack):
    """Stack for document upload infrastructure.
    
    Creates:
    - DynamoDB table for upload status tracking
    - S3 bucket structure for uploads
    - SQS queue for upload processing
    - Lambda function for upload API
    - API Gateway routes for upload endpoints
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        storage_stack: StorageStack,
        api: apigw.RestApi,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ==================== DynamoDB Table ====================
        # Implements Requirements 4.1-4.5: Upload status tracking
        
        self.upload_status_table = dynamodb.Table(
            self,
            "UploadStatusTable",
            table_name="regulatory-kb-upload-status",
            partition_key=dynamodb.Attribute(
                name="upload_id",
                type=dynamodb.AttributeType.STRING,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            time_to_live_attribute="ttl",  # TTL for completed uploads (30 days)
            point_in_time_recovery=True,
        )

        # GSI for uploader_id queries
        self.upload_status_table.add_global_secondary_index(
            index_name="uploader_id-index",
            partition_key=dynamodb.Attribute(
                name="uploader_id",
                type=dynamodb.AttributeType.STRING,
            ),
            sort_key=dynamodb.Attribute(
                name="created_at",
                type=dynamodb.AttributeType.STRING,
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # GSI for batch_id queries
        self.upload_status_table.add_global_secondary_index(
            index_name="batch_id-index",
            partition_key=dynamodb.Attribute(
                name="batch_id",
                type=dynamodb.AttributeType.STRING,
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # ==================== Version History Table ====================
        # Implements Requirements 6.2, 6.4: Version history tracking
        
        self.version_history_table = dynamodb.Table(
            self,
            "VersionHistoryTable",
            table_name="regulatory-kb-version-history",
            partition_key=dynamodb.Attribute(
                name="document_id",
                type=dynamodb.AttributeType.STRING,
            ),
            sort_key=dynamodb.Attribute(
                name="version_number",
                type=dynamodb.AttributeType.NUMBER,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            point_in_time_recovery=True,
        )

        # GSI for title-regulator queries (for finding matching documents)
        self.version_history_table.add_global_secondary_index(
            index_name="title-regulator-index",
            partition_key=dynamodb.Attribute(
                name="title",
                type=dynamodb.AttributeType.STRING,
            ),
            sort_key=dynamodb.Attribute(
                name="regulator",
                type=dynamodb.AttributeType.STRING,
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # ==================== S3 Upload Bucket ====================
        # Implements Requirements 1.6, 6.2: S3 storage with versioning
        
        self.upload_bucket = s3.Bucket(
            self,
            "UploadBucket",
            bucket_name=f"regulatory-kb-uploads-{self.account}",
            versioned=True,  # For document replacement
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.RETAIN,
            lifecycle_rules=[
                # Clean up pending uploads after 7 days
                s3.LifecycleRule(
                    id="CleanupPendingUploads",
                    prefix="uploads/pending/",
                    expiration=Duration.days(7),
                ),
                # Archive completed uploads after 90 days
                s3.LifecycleRule(
                    id="ArchiveCompletedUploads",
                    prefix="uploads/completed/",
                    transitions=[
                        s3.Transition(
                            storage_class=s3.StorageClass.GLACIER,
                            transition_after=Duration.days(90),
                        ),
                    ],
                ),
                # Archive versions after 90 days
                s3.LifecycleRule(
                    id="ArchiveVersions",
                    prefix="versions/",
                    noncurrent_version_transitions=[
                        s3.NoncurrentVersionTransition(
                            storage_class=s3.StorageClass.GLACIER,
                            transition_after=Duration.days(90),
                        ),
                    ],
                ),
            ],
        )

        # ==================== SQS Queue ====================
        # Implements Requirements 1.7, 3.1: Processing queue
        
        # Dead letter queue for failed processing
        self.upload_dlq = sqs.Queue(
            self,
            "UploadDeadLetterQueue",
            queue_name="regulatory-kb-upload-dlq",
            retention_period=Duration.days(14),
        )

        # Main processing queue
        self.upload_queue = sqs.Queue(
            self,
            "UploadProcessingQueue",
            queue_name="regulatory-kb-upload-processing",
            visibility_timeout=Duration.minutes(15),  # Processing duration
            retention_period=Duration.days(7),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=self.upload_dlq,
            ),
        )

        # ==================== Lambda Role ====================
        
        self.upload_lambda_role = iam.Role(
            self,
            "UploadLambdaRole",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AWSLambdaBasicExecutionRole"
                ),
            ],
        )

        # Grant S3 permissions
        self.upload_bucket.grant_read_write(self.upload_lambda_role)
        storage_stack.document_bucket.grant_read_write(self.upload_lambda_role)

        # Grant DynamoDB permissions
        self.upload_status_table.grant_read_write_data(self.upload_lambda_role)
        self.version_history_table.grant_read_write_data(self.upload_lambda_role)

        # Grant SQS permissions
        self.upload_queue.grant_send_messages(self.upload_lambda_role)

        # ==================== Lambda Functions ====================
        
        lambda_package_dir = create_lambda_package()
        lambda_code = lambda_.Code.from_asset(lambda_package_dir)

        common_env = {
            "UPLOAD_BUCKET": self.upload_bucket.bucket_name,
            "UPLOAD_STATUS_TABLE": self.upload_status_table.table_name,
            "VERSION_HISTORY_TABLE": self.version_history_table.table_name,
            "UPLOAD_QUEUE_URL": self.upload_queue.queue_url,
            "DOCUMENT_BUCKET": storage_stack.document_bucket.bucket_name,
            "LOG_LEVEL": "INFO",
        }

        # Upload API Lambda
        self.upload_lambda = lambda_.Function(
            self,
            "UploadApiLambda",
            function_name="regulatory-kb-upload-api",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="handlers.upload.upload_handler",
            code=lambda_code,
            timeout=Duration.seconds(30),
            memory_size=512,
            role=self.upload_lambda_role,
            environment=common_env,
            log_retention=logs.RetentionDays.ONE_MONTH,
        )

        # Upload Processing Lambda (triggered by SQS)
        self.processing_lambda = lambda_.Function(
            self,
            "UploadProcessingLambda",
            function_name="regulatory-kb-upload-processing",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="handlers.upload_processor.process_handler",
            code=lambda_code,
            timeout=Duration.minutes(10),
            memory_size=1024,
            role=self.upload_lambda_role,
            environment={
                **common_env,
                "FALKORDB_HOST": "localhost",  # Will be updated for production
                "FALKORDB_PORT": "6379",
            },
            log_retention=logs.RetentionDays.ONE_MONTH,
        )

        # Add SQS trigger to processing Lambda
        self.processing_lambda.add_event_source(
            lambda_event_sources.SqsEventSource(
                self.upload_queue,
                batch_size=1,  # Process one document at a time
            )
        )

        # ==================== API Gateway Routes ====================
        
        upload_integration = apigw.LambdaIntegration(
            self.upload_lambda,
            proxy=True,
        )

        # /documents/upload - Single document upload
        documents = api.root.get_resource("documents")
        if not documents:
            documents = api.root.add_resource("documents")
        
        upload = documents.add_resource("upload")
        upload.add_method("POST", upload_integration, api_key_required=True)

        # /documents/upload/batch - Batch upload
        batch = upload.add_resource("batch")
        batch.add_method("POST", upload_integration, api_key_required=True)

        # /documents/upload/{upload_id}/status - Single upload status
        upload_by_id = upload.add_resource("{upload_id}")
        upload_status = upload_by_id.add_resource("status")
        upload_status.add_method("GET", upload_integration, api_key_required=True)

        # /documents/upload/batch/{batch_id}/status - Batch status
        batch_by_id = batch.add_resource("{batch_id}")
        batch_status = batch_by_id.add_resource("status")
        batch_status.add_method("GET", upload_integration, api_key_required=True)

        # ==================== Version Management Routes ====================
        # Implements Requirements 6.1-6.5
        
        # /documents/{document_id}/replace - Replace document with new version
        doc_by_id = documents.add_resource("{document_id}")
        replace = doc_by_id.add_resource("replace")
        replace.add_method("PUT", upload_integration, api_key_required=True)
        
        # /documents/{document_id}/versions - Get version history
        versions = doc_by_id.add_resource("versions")
        versions.add_method("GET", upload_integration, api_key_required=True)
        
        # /documents/{document_id}/versions/{version} - Get specific version
        version_by_num = versions.add_resource("{version}")
        version_by_num.add_method("GET", upload_integration, api_key_required=True)
        
        # /documents/find-matching - Find matching documents for replacement
        find_matching = documents.add_resource("find-matching")
        find_matching.add_method("GET", upload_integration, api_key_required=True)

        # ==================== Outputs ====================

        CfnOutput(
            self,
            "UploadBucketName",
            value=self.upload_bucket.bucket_name,
            description="S3 bucket for document uploads",
        )

        CfnOutput(
            self,
            "UploadStatusTableName",
            value=self.upload_status_table.table_name,
            description="DynamoDB table for upload status tracking",
        )

        CfnOutput(
            self,
            "VersionHistoryTableName",
            value=self.version_history_table.table_name,
            description="DynamoDB table for version history tracking",
        )

        CfnOutput(
            self,
            "UploadQueueUrl",
            value=self.upload_queue.queue_url,
            description="SQS queue URL for upload processing",
        )

        CfnOutput(
            self,
            "UploadDLQUrl",
            value=self.upload_dlq.queue_url,
            description="SQS dead letter queue URL",
        )

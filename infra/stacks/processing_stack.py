"""Processing stack for document processing Lambda functions."""

import os
import subprocess
import shutil

from aws_cdk import (
    Stack,
    Duration,
    aws_lambda as lambda_,
    aws_iam as iam,
    aws_sqs as sqs,
    aws_lambda_event_sources as event_sources,
)
from constructs import Construct

from infra.stacks.storage_stack import StorageStack


def create_lambda_package():
    """Create a Lambda deployment package with dependencies."""
    # Create a temporary directory for the package
    package_dir = os.path.join(os.getcwd(), ".lambda-package")
    
    # Clean up existing package directory
    if os.path.exists(package_dir):
        shutil.rmtree(package_dir)
    os.makedirs(package_dir)
    
    # Install dependencies
    subprocess.run(
        ["pip", "install", "-r", "lambda-requirements.txt", "-t", package_dir, "--quiet"],
        check=True,
    )
    
    # Copy source files
    src_handlers = "src/handlers"
    src_regulatory_kb = "src/regulatory_kb"
    
    if os.path.exists(src_handlers):
        shutil.copytree(src_handlers, os.path.join(package_dir, "handlers"), dirs_exist_ok=True)
    if os.path.exists(src_regulatory_kb):
        shutil.copytree(src_regulatory_kb, os.path.join(package_dir, "regulatory_kb"), dirs_exist_ok=True)
    
    return package_dir


class ProcessingStack(Stack):
    """Stack for document processing infrastructure."""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        storage_stack: StorageStack,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Dead letter queue for failed processing
        self.dlq = sqs.Queue(
            self,
            "ProcessingDLQ",
            queue_name="regulatory-kb-processing-dlq",
            retention_period=Duration.days(14),
        )

        # Main processing queue
        self.processing_queue = sqs.Queue(
            self,
            "ProcessingQueue",
            queue_name="regulatory-kb-processing-queue",
            visibility_timeout=Duration.minutes(15),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=self.dlq,
            ),
        )

        # Lambda execution role
        self.lambda_role = iam.Role(
            self,
            "ProcessingLambdaRole",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AWSLambdaBasicExecutionRole"
                ),
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AWSLambdaVPCAccessExecutionRole"
                ),
            ],
        )

        # Grant S3 access
        storage_stack.document_bucket.grant_read_write(self.lambda_role)

        # Lambda code with bundled dependencies
        lambda_package_dir = create_lambda_package()
        lambda_code = lambda_.Code.from_asset(lambda_package_dir)

        # Document retrieval Lambda
        self.retrieval_lambda = lambda_.Function(
            self,
            "DocumentRetrievalLambda",
            function_name="regulatory-kb-document-retrieval",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="handlers.retrieval.handler",
            code=lambda_code,
            timeout=Duration.minutes(5),
            memory_size=512,
            role=self.lambda_role,
            environment={
                "DOCUMENT_BUCKET": storage_stack.document_bucket.bucket_name,
                "PROCESSING_QUEUE_URL": self.processing_queue.queue_url,
            },
        )

        # Document parser Lambda
        self.parser_lambda = lambda_.Function(
            self,
            "DocumentParserLambda",
            function_name="regulatory-kb-document-parser",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="handlers.parser.handler",
            code=lambda_code,
            timeout=Duration.minutes(10),
            memory_size=1024,
            role=self.lambda_role,
            environment={
                "DOCUMENT_BUCKET": storage_stack.document_bucket.bucket_name,
            },
        )

        # Add SQS trigger to parser Lambda
        self.parser_lambda.add_event_source(
            event_sources.SqsEventSource(
                self.processing_queue,
                batch_size=1,
            )
        )

        # Metadata extractor Lambda
        self.metadata_lambda = lambda_.Function(
            self,
            "MetadataExtractorLambda",
            function_name="regulatory-kb-metadata-extractor",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="handlers.metadata.handler",
            code=lambda_code,
            timeout=Duration.minutes(5),
            memory_size=512,
            role=self.lambda_role,
            environment={
                "DOCUMENT_BUCKET": storage_stack.document_bucket.bucket_name,
            },
        )

        # Grant SQS permissions
        self.processing_queue.grant_send_messages(self.retrieval_lambda)
        self.processing_queue.grant_consume_messages(self.parser_lambda)

#!/usr/bin/env python3
"""CDK application entry point for the regulatory knowledge base."""

import aws_cdk as cdk

from infra.stacks.storage_stack import StorageStack
from infra.stacks.api_stack import ApiStack
from infra.stacks.processing_stack import ProcessingStack
from infra.stacks.upload_stack import UploadStack

app = cdk.App()

env = cdk.Environment(
    account=app.node.try_get_context("account"),
    region=app.node.try_get_context("region") or "us-east-1",
)

# Storage stack (S3, Redis/FalkorDB)
storage_stack = StorageStack(
    app,
    "RegulatoryKBStorageStack",
    env=env,
    description="Storage infrastructure for regulatory knowledge base",
)

# Processing stack (Lambda functions for document processing)
processing_stack = ProcessingStack(
    app,
    "RegulatoryKBProcessingStack",
    storage_stack=storage_stack,
    env=env,
    description="Document processing infrastructure",
)

# API stack (API Gateway, Lambda handlers)
api_stack = ApiStack(
    app,
    "RegulatoryKBApiStack",
    storage_stack=storage_stack,
    env=env,
    description="API infrastructure for regulatory knowledge base",
)

# Upload stack (Document upload infrastructure)
upload_stack = UploadStack(
    app,
    "RegulatoryKBUploadStack",
    storage_stack=storage_stack,
    api=api_stack.api,
    env=env,
    description="Document upload infrastructure",
)

app.synth()

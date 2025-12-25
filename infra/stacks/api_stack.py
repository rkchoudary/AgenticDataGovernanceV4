"""API stack for REST API Gateway and Lambda handlers.

Implements Requirements 13.1-13.4, 13.6:
- REST API endpoints for searching by regulator
- Endpoints for searching by regulatory category
- Endpoints for searching by form type
- Authentication, rate limiting, and audit logging
"""

import os
import subprocess
import shutil
import tempfile

from aws_cdk import (
    Stack,
    Duration,
    CfnOutput,
    aws_lambda as lambda_,
    aws_apigateway as apigw,
    aws_iam as iam,
    aws_logs as logs,
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


class ApiStack(Stack):
    """Stack for API infrastructure.
    
    Creates:
    - REST API Gateway with document search and NL query endpoints
    - Lambda functions for API handlers
    - API key authentication
    - Usage plans with rate limiting
    - CloudWatch logging
    """

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        storage_stack: StorageStack,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Lambda execution role for API handlers
        self.api_lambda_role = iam.Role(
            self,
            "ApiLambdaRole",
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

        # Grant S3 read access
        storage_stack.document_bucket.grant_read(self.api_lambda_role)

        # Add Bedrock permissions
        self.api_lambda_role.add_to_policy(
            iam.PolicyStatement(
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream",
                ],
                resources=["*"],
            )
        )

        # Common Lambda environment variables
        common_env = {
            "DOCUMENT_BUCKET": storage_stack.document_bucket.bucket_name,
            "FALKORDB_HOST": "localhost",  # Will be updated for production
            "FALKORDB_PORT": "6379",
            "RATE_LIMIT_PER_MINUTE": "100",
            "LOG_LEVEL": "INFO",
        }

        # Lambda code with bundled dependencies
        lambda_package_dir = create_lambda_package()
        lambda_code = lambda_.Code.from_asset(lambda_package_dir)

        # Document search Lambda
        self.search_lambda = lambda_.Function(
            self,
            "DocumentSearchLambda",
            function_name="regulatory-kb-document-search",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="handlers.api.search_handler",
            code=lambda_code,
            timeout=Duration.seconds(30),
            memory_size=512,
            role=self.api_lambda_role,
            environment=common_env,
            log_retention=logs.RetentionDays.ONE_MONTH,
        )

        # Natural language query Lambda
        self.query_lambda = lambda_.Function(
            self,
            "NaturalLanguageQueryLambda",
            function_name="regulatory-kb-nl-query",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="handlers.api.query_handler",
            code=lambda_code,
            timeout=Duration.seconds(60),
            memory_size=1024,
            role=self.api_lambda_role,
            environment=common_env,
            log_retention=logs.RetentionDays.ONE_MONTH,
        )

        # GraphQL Lambda
        self.graphql_lambda = lambda_.Function(
            self,
            "GraphQLLambda",
            function_name="regulatory-kb-graphql",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="handlers.graphql.graphql_handler",
            code=lambda_code,
            timeout=Duration.seconds(30),
            memory_size=512,
            role=self.api_lambda_role,
            environment=common_env,
            log_retention=logs.RetentionDays.ONE_MONTH,
        )

        # Webhook subscription Lambda
        self.webhook_subscription_lambda = lambda_.Function(
            self,
            "WebhookSubscriptionLambda",
            function_name="regulatory-kb-webhook-subscriptions",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="handlers.webhooks.subscription_handler",
            code=lambda_code,
            timeout=Duration.seconds(30),
            memory_size=256,
            role=self.api_lambda_role,
            environment={
                **common_env,
                "WEBHOOK_SIGNING_SECRET": "change-in-production",
            },
            log_retention=logs.RetentionDays.ONE_MONTH,
        )

        # Webhook delivery Lambda
        self.webhook_delivery_lambda = lambda_.Function(
            self,
            "WebhookDeliveryLambda",
            function_name="regulatory-kb-webhook-deliveries",
            runtime=lambda_.Runtime.PYTHON_3_11,
            handler="handlers.webhooks.delivery_handler",
            code=lambda_code,
            timeout=Duration.seconds(60),
            memory_size=256,
            role=self.api_lambda_role,
            environment={
                **common_env,
                "WEBHOOK_SIGNING_SECRET": "change-in-production",
                "WEBHOOK_MAX_RETRIES": "5",
                "WEBHOOK_TIMEOUT": "30",
            },
            log_retention=logs.RetentionDays.ONE_MONTH,
        )

        # API Gateway REST API
        self.api = apigw.RestApi(
            self,
            "RegulatoryKBApi",
            rest_api_name="Regulatory Knowledge Base API",
            description="API for regulatory document knowledge base",
            deploy_options=apigw.StageOptions(
                stage_name="v1",
                logging_level=apigw.MethodLoggingLevel.OFF,  # Disabled to avoid CloudWatch role requirement
                data_trace_enabled=False,
                throttling_rate_limit=100,
                throttling_burst_limit=200,
                metrics_enabled=True,
            ),
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,
                allow_methods=apigw.Cors.ALL_METHODS,
                allow_headers=[
                    "Content-Type",
                    "Authorization",
                    "X-API-Key",
                    "X-Amz-Date",
                    "X-Amz-Security-Token",
                ],
            ),
        )

        # API Key for authentication
        api_key = self.api.add_api_key(
            "RegulatoryKBApiKey",
            api_key_name="regulatory-kb-api-key",
            description="API key for Regulatory Knowledge Base",
        )

        # Usage plan with rate limiting
        usage_plan = self.api.add_usage_plan(
            "RegulatoryKBUsagePlan",
            name="regulatory-kb-usage-plan",
            description="Usage plan for Regulatory Knowledge Base API",
            throttle=apigw.ThrottleSettings(
                rate_limit=100,  # requests per second
                burst_limit=200,
            ),
            quota=apigw.QuotaSettings(
                limit=10000,  # requests per day
                period=apigw.Period.DAY,
            ),
        )

        usage_plan.add_api_key(api_key)
        usage_plan.add_api_stage(stage=self.api.deployment_stage)

        # Lambda integrations
        search_integration = apigw.LambdaIntegration(
            self.search_lambda,
            proxy=True,
        )
        query_integration = apigw.LambdaIntegration(
            self.query_lambda,
            proxy=True,
        )
        graphql_integration = apigw.LambdaIntegration(
            self.graphql_lambda,
            proxy=True,
        )
        webhook_subscription_integration = apigw.LambdaIntegration(
            self.webhook_subscription_lambda,
            proxy=True,
        )
        webhook_delivery_integration = apigw.LambdaIntegration(
            self.webhook_delivery_lambda,
            proxy=True,
        )

        # ==================== API Resources ====================

        # /documents - Document listing and search
        documents = self.api.root.add_resource("documents")
        documents.add_method(
            "GET",
            search_integration,
            api_key_required=True,
        )

        # /documents/{id} - Get document by ID
        document_by_id = documents.add_resource("{id}")
        document_by_id.add_method(
            "GET",
            search_integration,
            api_key_required=True,
        )

        # /regulators/{regulator}/documents - Documents by regulator
        regulators = self.api.root.add_resource("regulators")
        regulator_resource = regulators.add_resource("{regulator}")
        regulator_docs = regulator_resource.add_resource("documents")
        regulator_docs.add_method(
            "GET",
            search_integration,
            api_key_required=True,
        )

        # /search - Search endpoint
        search = self.api.root.add_resource("search")
        search.add_method(
            "GET",
            search_integration,
            api_key_required=True,
        )

        # /query/natural-language - Natural language query endpoint
        query = self.api.root.add_resource("query")
        nl_query = query.add_resource("natural-language")
        nl_query.add_method(
            "POST",
            query_integration,
            api_key_required=True,
        )

        # /relationships/{document-id} - Document relationships
        relationships = self.api.root.add_resource("relationships")
        relationship_by_doc = relationships.add_resource("{document-id}")
        relationship_by_doc.add_method(
            "GET",
            search_integration,
            api_key_required=True,
        )

        # /categories - List available categories
        categories = self.api.root.add_resource("categories")
        categories.add_method(
            "GET",
            search_integration,
            api_key_required=True,
        )

        # /forms - Search by form type
        forms = self.api.root.add_resource("forms")
        form_by_number = forms.add_resource("{form-number}")
        form_docs = form_by_number.add_resource("documents")
        form_docs.add_method(
            "GET",
            search_integration,
            api_key_required=True,
        )

        # /graphql - GraphQL endpoint for complex queries
        graphql = self.api.root.add_resource("graphql")
        graphql.add_method(
            "POST",
            graphql_integration,
            api_key_required=True,
        )

        # /webhooks - Webhook management endpoints
        webhooks = self.api.root.add_resource("webhooks")
        
        # /webhooks/subscriptions - Subscription management
        subscriptions = webhooks.add_resource("subscriptions")
        subscriptions.add_method("GET", webhook_subscription_integration, api_key_required=True)
        subscriptions.add_method("POST", webhook_subscription_integration, api_key_required=True)
        
        subscription_by_id = subscriptions.add_resource("{id}")
        subscription_by_id.add_method("GET", webhook_subscription_integration, api_key_required=True)
        subscription_by_id.add_method("PUT", webhook_subscription_integration, api_key_required=True)
        subscription_by_id.add_method("DELETE", webhook_subscription_integration, api_key_required=True)
        
        # /webhooks/deliveries - Delivery management
        deliveries = webhooks.add_resource("deliveries")
        deliveries.add_method("GET", webhook_delivery_integration, api_key_required=True)
        
        delivery_by_id = deliveries.add_resource("{id}")
        delivery_by_id.add_method("GET", webhook_delivery_integration, api_key_required=True)
        
        delivery_retry = delivery_by_id.add_resource("retry")
        delivery_retry.add_method("POST", webhook_delivery_integration, api_key_required=True)
        
        # /webhooks/stats - Delivery statistics
        webhook_stats = webhooks.add_resource("stats")
        webhook_stats.add_method("GET", webhook_delivery_integration, api_key_required=True)
        
        # /webhooks/dead-letter - Dead letter queue
        dead_letter = webhooks.add_resource("dead-letter")
        dead_letter.add_method("GET", webhook_delivery_integration, api_key_required=True)
        
        dead_letter_by_id = dead_letter.add_resource("{id}")
        dead_letter_retry = dead_letter_by_id.add_resource("retry")
        dead_letter_retry.add_method("POST", webhook_delivery_integration, api_key_required=True)

        # ==================== Outputs ====================

        CfnOutput(
            self,
            "ApiEndpoint",
            value=self.api.url,
            description="API Gateway endpoint URL",
        )

        CfnOutput(
            self,
            "ApiKeyId",
            value=api_key.key_id,
            description="API Key ID (retrieve value from AWS Console)",
        )

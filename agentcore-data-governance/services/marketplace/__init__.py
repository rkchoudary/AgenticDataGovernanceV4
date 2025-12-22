"""
Marketplace integration services for the Agentic Data Governance System.

This module provides integrations with AWS Marketplace and Azure Marketplace
for subscription management, provisioning, and usage metering.

Requirements: 37.1, 37.2, 37.3, 38.1, 38.2, 38.3
"""

from services.marketplace.aws_marketplace import (
    AWSMarketplaceService,
    AWSMarketplaceSNSHandler,
    AWSMarketplaceMeteringService,
    get_aws_marketplace_service,
)
from services.marketplace.azure_marketplace import (
    AzureMarketplaceService,
    AzureMarketplaceLandingPage,
    AzureMarketplaceWebhookHandler,
    AzureMarketplaceMeteringService,
    get_azure_marketplace_service,
)

__all__ = [
    # AWS Marketplace
    "AWSMarketplaceService",
    "AWSMarketplaceSNSHandler",
    "AWSMarketplaceMeteringService",
    "get_aws_marketplace_service",
    # Azure Marketplace
    "AzureMarketplaceService",
    "AzureMarketplaceLandingPage",
    "AzureMarketplaceWebhookHandler",
    "AzureMarketplaceMeteringService",
    "get_azure_marketplace_service",
]

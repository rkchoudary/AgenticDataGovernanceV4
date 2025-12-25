"""Metadata extractor Lambda handler."""

import json
import os
from typing import Any

from regulatory_kb.core import get_logger, configure_logging

configure_logging(level="INFO", json_format=True)
logger = get_logger(__name__)


def handler(event: dict, context: Any) -> dict:
    """Handle metadata extraction requests.

    Args:
        event: Lambda event containing document to process
        context: Lambda context

    Returns:
        Response with extraction status
    """
    logger.info("metadata_extraction_started", event=event)

    bucket = os.environ.get("DOCUMENT_BUCKET")

    try:
        document_id = event.get("document_id")
        parsed_text = event.get("parsed_text")

        logger.info(
            "extracting_metadata",
            document_id=document_id,
        )

        # TODO: Implement actual metadata extraction logic
        # This will be implemented in task 3

        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "Metadata extracted successfully",
                "document_id": document_id,
            }),
        }

    except Exception as e:
        logger.error("metadata_extraction_failed", error=str(e))
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }

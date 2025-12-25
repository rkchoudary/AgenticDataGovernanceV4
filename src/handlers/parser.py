"""Document parser Lambda handler."""

import json
import os
from typing import Any

from regulatory_kb.core import get_logger, configure_logging

configure_logging(level="INFO", json_format=True)
logger = get_logger(__name__)


def handler(event: dict, context: Any) -> dict:
    """Handle document parsing requests from SQS.

    Args:
        event: SQS event containing document to parse
        context: Lambda context

    Returns:
        Response with parsing status
    """
    logger.info("document_parser_started", event=event)

    bucket = os.environ.get("DOCUMENT_BUCKET")

    try:
        # Process SQS records
        for record in event.get("Records", []):
            body = json.loads(record.get("body", "{}"))
            document_id = body.get("document_id")
            s3_key = body.get("s3_key")

            logger.info(
                "parsing_document",
                document_id=document_id,
                s3_key=s3_key,
            )

            # TODO: Implement actual document parsing logic
            # This will be implemented in task 3

        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Documents parsed successfully"}),
        }

    except Exception as e:
        logger.error("document_parsing_failed", error=str(e))
        raise  # Re-raise to trigger DLQ

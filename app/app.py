import os
import logging
from flask import Flask, render_template, request, jsonify
import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration — all values can be overridden via environment variables
# ---------------------------------------------------------------------------
KNOWLEDGE_BASE_ID = os.getenv("KNOWLEDGE_BASE_ID", "HGUEY0A2WY")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

# Claude Sonnet 4.5 via the US cross-region inference profile.
# Direct foundation-model invocation is not supported for this model;
# the "us." prefix routes the request through the AWS-managed profile
# that spans us-east-1 / us-east-2 / us-west-2.
MODEL_ARN = os.getenv(
    "MODEL_ARN",
    "arn:aws:bedrock:us-east-1:595944127545:inference-profile/us.anthropic.claude-sonnet-4-6",
)
def _bedrock_client():
    """Return a boto3 bedrock-agent-runtime client.

    When running on EC2 with an IAM instance role the SDK picks up credentials
    automatically.  For local development set AWS_ACCESS_KEY_ID /
    AWS_SECRET_ACCESS_KEY in the .env file.
    """
    return boto3.client(
        service_name="bedrock-agent-runtime",
        region_name=AWS_REGION,
    )


def _extract_sources(citations: list) -> list[dict]:
    """Pull unique S3 URIs and excerpt text out of the Bedrock citation list."""
    seen_uris: set[str] = set()
    sources: list[dict] = []

    for citation in citations:
        for ref in citation.get("retrievedReferences", []):
            uri = (
                ref.get("location", {})
                .get("s3Location", {})
                .get("uri", "")
            )
            if not uri or uri in seen_uris:
                continue

            seen_uris.add(uri)
            raw_excerpt = ref.get("content", {}).get("text", "")
            excerpt = (raw_excerpt[:300] + "…") if len(raw_excerpt) > 300 else raw_excerpt

            # Turn the S3 key path into a human-readable label
            filename = uri.split("/")[-1] if "/" in uri else uri

            sources.append(
                {
                    "uri": uri,
                    "filename": filename,
                    "excerpt": excerpt,
                }
            )

    return sources


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/ask", methods=["POST"])
def ask():
    """Receive a question, call Bedrock RetrieveAndGenerate, return JSON."""
    payload = request.get_json(silent=True) or {}
    question = payload.get("question", "").strip()

    if not question:
        return jsonify({"error": "Please enter a question."}), 400

    if len(question) > 2000:
        return jsonify({"error": "Question is too long (max 2000 characters)."}), 400

    logger.info("Querying Knowledge Base — question: %r", question[:120])

    try:
        client = _bedrock_client()

        response = client.retrieve_and_generate(
            input={"text": question},
            retrieveAndGenerateConfiguration={
                "type": "KNOWLEDGE_BASE",
                "knowledgeBaseConfiguration": {
                    "knowledgeBaseId": KNOWLEDGE_BASE_ID,
                    "modelArn": MODEL_ARN,
                },
            },
        )

        answer = response["output"]["text"]
        sources = _extract_sources(response.get("citations", []))

        logger.info(
            "Response received — answer length: %d chars, sources: %d",
            len(answer),
            len(sources),
        )

        return jsonify({"answer": answer, "sources": sources})

    except NoCredentialsError:
        logger.error("AWS credentials not found")
        return (
            jsonify(
                {
                    "error": (
                        "AWS credentials are not configured. "
                        "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your "
                        "environment, or attach an IAM role to the instance."
                    )
                }
            ),
            500,
        )

    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        message = exc.response["Error"]["Message"]
        logger.error("Bedrock ClientError %s: %s", code, message)

        # Translate common error codes into readable messages
        user_message = {
            "AccessDeniedException": (
                "Access denied. Ensure the IAM principal has "
                "bedrock:RetrieveAndGenerate permission on this Knowledge Base."
            ),
            "ResourceNotFoundException": (
                f"Knowledge Base '{KNOWLEDGE_BASE_ID}' not found in region "
                f"'{AWS_REGION}'. Verify KNOWLEDGE_BASE_ID and AWS_REGION."
            ),
            "ThrottlingException": (
                "Request was throttled by Bedrock. Please wait a moment and try again."
            ),
            "ValidationException": (
                f"Validation error from Bedrock: {message}"
            ),
        }.get(code, f"Bedrock error ({code}): {message}")

        return jsonify({"error": user_message}), 500

    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error while querying Bedrock")
        return jsonify({"error": f"Unexpected error: {exc}"}), 500


@app.route("/health")
def health():
    """Simple health-check endpoint used by load balancers and Docker HEALTHCHECK."""
    return jsonify({"status": "ok", "knowledge_base_id": KNOWLEDGE_BASE_ID})


# ---------------------------------------------------------------------------
# Entry point (local development only — production uses Gunicorn)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=5000, debug=debug)

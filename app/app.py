import os
import re
import json
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask_cors import CORS
from flask import Flask, request, jsonify, send_from_directory
import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

CORS(app)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(name)s  %(message)s",
)

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────
KNOWLEDGE_BASE_ID = os.getenv("KNOWLEDGE_BASE_ID", "HGUEY0A2WY")
AWS_REGION        = os.getenv("AWS_REGION", "us-east-1")
MODEL_ARN         = os.getenv(
    "MODEL_ARN",
    "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0",
)
AGENT_ID       = os.getenv("BEDROCK_AGENT_ID",       "EGWXK2BGD9")
AGENT_ALIAS_ID = os.getenv("BEDROCK_AGENT_ALIAS_ID", "TSTALIASID")


print("=" * 80)

print("MODEL_ARN LOADED:", MODEL_ARN)

print("=" * 80)

# Local persistence files
GAPS_PATH     = Path(__file__).parent / "knowledge_gaps.json"
METADATA_PATH = Path(__file__).parent / "doc_metadata_cache.json"
OWNERS_PATH   = Path(__file__).parent / "owners.json"

# In-process metadata cache (avoids disk reads on every request)
_metadata_cache: dict[str, dict] = {}

# Owner directory (loaded once at startup)
def _load_owners() -> list:
    if OWNERS_PATH.exists():
        try:
            return json.loads(OWNERS_PATH.read_text())
        except Exception:
            return []
    return []

_owners: list = _load_owners()


def _find_owner(question: str, enrichment: dict, team: str | None) -> tuple[str | None, str | None]:
    """Return (name, email) when answer quality is low enough to warrant human escalation."""
    confidence  = enrichment.get("confidence_score")
    has_gap     = enrichment.get("has_documentation_gap", False)
    is_stale    = enrichment.get("is_stale", False)

    # Only surface owner card when there is genuine uncertainty
    threshold = 70
    if confidence is not None and confidence >= threshold and not has_gap and not is_stale:
        return None, None

    # Team-scoped match first
    if team:
        for o in _owners:
            if o.get("team", "").lower() == team.lower():
                return o["name"], o["email"]

    # Topic-keyword match
    q_lower = question.lower()
    for o in _owners:
        if any(topic in q_lower for topic in o.get("topics", [])):
            return o["name"], o["email"]

    # Fallback: first entry
    if _owners:
        return _owners[0]["name"], _owners[0]["email"]

    return None, None


# ── AWS clients ─────────────────────────────────────────────────────────────────
def _agent_client():
    return boto3.client("bedrock-agent-runtime", region_name=AWS_REGION)

def _runtime_client():
    return boto3.client("bedrock-runtime", region_name=AWS_REGION)

def _s3_client():
    return boto3.client("s3", region_name=AWS_REGION)


# ── Knowledge-gaps store ────────────────────────────────────────────────────────
def _load_gaps() -> list:
    if GAPS_PATH.exists():
        try:
            return json.loads(GAPS_PATH.read_text())
        except Exception:
            return []
    return []

def _save_gaps(gaps: list) -> None:
    GAPS_PATH.write_text(json.dumps(gaps, indent=2, ensure_ascii=False))

def _record_gap(topic: str, question: str) -> None:
    try:
        gaps = _load_gaps()
        existing = next((g for g in gaps if g["topic"].lower() == topic.lower()), None)
        now = datetime.now(timezone.utc).isoformat()
        if existing:
            existing["frequency"] += 1
            existing["last_seen"] = now
        else:
            gaps.append({
                "id":         str(uuid.uuid4()),
                "topic":      topic,
                "question":   question,
                "frequency":  1,
                "last_seen":  now,
                "created_at": now,
            })
        _save_gaps(gaps)
    except Exception as exc:
        logger.warning("Failed to record gap: %s", exc)


# ── Document metadata helpers ──────────────────────────────────────────────────
def _team_from_s3_path(key: str) -> str | None:
    k = key.lower()
    # New team-specific folders
    if "/platform/"      in k: return "Platform"
    if "/payments/"      in k: return "Payments"
    if "/data/"          in k: return "Data"
    if "/devops/"        in k: return "DevOps"
    # Legacy category folders
    if "/adrs/"          in k: return "Platform"
    if "/runbooks/"      in k: return "Platform"
    if "/migrations/"    in k: return "Platform"
    if "/incidents/"     in k: return "SRE"
    if "/architecture/"  in k: return "Architecture"
    if "/jira/"          in k: return "Engineering"
    if "/slack/"         in k: return "Engineering"
    if "/retrospectives/" in k: return "Engineering"
    if "/reviews/"       in k: return "Security"
    if "/reports/"       in k: return "Engineering Ops"
    return None

def _parse_doc_header(content: str, s3_key: str) -> dict:
    """Extract structured metadata from document header text via regex."""
    # Author — handles multiple formats
    author = None
    for pat in [
        r"\*\*Postmortem author:\*\*\s*([^\n*]+)",
        r"\*\*Owner:\*\*\s*([^\n,(*)]+)",
        r"\*\*Author:\*\*\s*([^\n*]+)",
        r"\*\*Deciders:\*\*\s*([^\n*]+)",
        r"Author:\s*([^\n,*]+)",
        r"Owner:\s*([^\n,(]+)",
    ]:
        m = re.search(pat, content, re.IGNORECASE)
        if m:
            raw   = m.group(1).strip()
            first = re.split(r"[,(]", raw)[0].strip()
            if first and len(first) < 60 and not first.startswith("**"):
                author = first
                break

    # Last-updated date
    last_updated = None
    for pat in [
        r"\*\*Last [Uu]pdated:\*\*\s*(\d{4}-\d{2}-\d{2})",
        r"\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})",
        r"Last [Uu]pdated:\s*(\d{4}-\d{2}-\d{2})",
        r"Date:\s*(\d{4}-\d{2}-\d{2})",
        r"\*\*Updated:\*\*\s*(\d{4}-\d{2}-\d{2})",
    ]:
        m = re.search(pat, content, re.IGNORECASE)
        if m:
            last_updated = m.group(1)
            break

    # Tags
    tags = []
    for pat in [r"\*\*Tags:\*\*\s*([^\n*]+)", r"Tags:\s*([^\n*]+)"]:
        m = re.search(pat, content, re.IGNORECASE)
        if m:
            raw_tags = m.group(1).strip()
            tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
            break

    # Team — prefer header field, fall back to path heuristic
    team = None
    for pat in [r"\*\*Team:\*\*\s*([^\n*]+)", r"Team:\s*([^\n*]+)"]:
        m = re.search(pat, content, re.IGNORECASE)
        if m:
            team = m.group(1).strip()
            break
    if not team:
        team = _team_from_s3_path(s3_key)

    return {
        "author":       author,
        "email":        None,
        "team":         team,
        "last_updated": last_updated,
        "tags":         tags,
    }

def _fetch_doc_metadata(uri: str) -> dict:
    """Fetch metadata for one S3 object (reads header bytes only, then caches)."""
    filename = uri.split("/")[-1]
    if filename in _metadata_cache:
        return _metadata_cache[filename]

    empty = {"author": None, "email": None, "team": None, "last_updated": None}
    try:
        # Parse s3://bucket/key
        without_scheme = uri[5:]                        # strip "s3://"
        bucket, key    = without_scheme.split("/", 1)

        s3_resp = _s3_client().get_object(
            Bucket=bucket, Key=key,
            Range="bytes=0-1999",                       # header is always in first 2 KB
        )
        header = s3_resp["Body"].read().decode("utf-8", errors="ignore")
        meta   = _parse_doc_header(header, key)
    except Exception as exc:
        logger.debug("Could not fetch metadata for %s: %s", uri, exc)
        meta = empty

    _metadata_cache[filename] = meta
    return meta


# ── Source extraction ──────────────────────────────────────────────────────────
def _extract_sources(citations: list) -> list[dict]:
    seen: set[str] = set()
    sources: list[dict] = []

    for citation in citations:
        for ref in citation.get("retrievedReferences", []):
            uri = ref.get("location", {}).get("s3Location", {}).get("uri", "")
            if not uri or uri in seen:
                continue
            seen.add(uri)

            raw_excerpt = ref.get("content", {}).get("text", "")
            excerpt     = (raw_excerpt[:400] + "…") if len(raw_excerpt) > 400 else raw_excerpt
            filename    = uri.split("/")[-1] if "/" in uri else uri

            sources.append({
                "uri":      uri,
                "filename": filename,
                "excerpt":  excerpt,
                "metadata": {"author": None, "email": None, "team": None, "last_updated": None, "tags": []},
            })

    return sources

def _enrich_sources_metadata(sources: list) -> list:
    """Fetch S3 header metadata for all sources in parallel (cached after first call)."""
    if not sources:
        return sources
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(_fetch_doc_metadata, s["uri"]): i for i, s in enumerate(sources)}
        for future in as_completed(futures):
            idx = futures[future]
            try:
                sources[idx]["metadata"] = future.result()
            except Exception:
                pass
    return sources


# ── Intelligence enrichment via Claude ─────────────────────────────────────────
_ENRICHMENT_SYSTEM = (
    "You are an engineering knowledge intelligence system. "
    "Analyze the provided question, answer, and source documents. "
    "Return ONLY valid JSON. No markdown, no explanations, no preamble."
)

def _build_enrichment_prompt(question: str, answer: str, sources: list) -> str:
    src_text = "\n\n".join(
        f"[{s['filename']}]\n{s['excerpt']}" for s in sources[:4]
    ) or "No sources retrieved."

    return f"""Analyze this engineering knowledge base interaction.

Return a JSON object with EXACTLY this structure (no extra fields, no nulls unless specified):

{{
  "follow_up_questions": ["question 1", "question 2", "question 3"],
  "confidence_score": 85,
  "has_documentation_gap": false,
  "gap_topic": null,
  "freshness_score": 78,
  "freshness_reason": "Documents reference 2025 configurations and recent EKS migration.",
  "is_stale": false,
  "is_incident_related": false,
  "root_cause_tree": null,
  "topic_experts": []
}}

FIELD RULES:
- follow_up_questions: 3–5 specific, actionable follow-up questions a reader would ask next
- confidence_score: integer 0–100 (how completely the sources answered the question; 0=no info, 100=fully answered)
- has_documentation_gap: true only if knowledge base clearly lacks important info needed for this question
- gap_topic: short label for missing topic like "Redis Failover Runbook" (or null if no gap)
- freshness_score: integer 0–100 based on dates/versions found in sources (100=very recent 2025+, 40=2022-ish, 0=very old)
- freshness_reason: one sentence explaining what drove the freshness score
- is_stale: true if freshness_score < 40
- is_incident_related: true if the question is about an incident, outage, postmortem, or root cause
- root_cause_tree: ONLY if is_incident_related=true — a nested tree:
    {{"title": "Root Cause", "detail": "one sentence", "children": [{{"title": "...", "detail": "...", "children": []}}]}}
  Otherwise: null
- topic_experts: list of people extracted from source text who authored or owned the documents:
    [{{"name": "Full Name", "context": "Platform Engineering Lead, authored ADR-001"}}]
  Only include people explicitly named. If none found, use []

QUESTION: {question}

ANSWER (excerpt): {answer[:600]}

SOURCES:
{src_text}"""


def _call_claude(prompt: str, system: str, max_tokens: int = 1200) -> str:
    client = _runtime_client()
    body   = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens":        max_tokens,
        "system":            system,
        "messages": [{"role": "user", "content": prompt}],
    })
    resp   = client.invoke_model(
        modelId=MODEL_ARN,
        body=body,
        contentType="application/json",
        accept="application/json",
    )
    result = json.loads(resp["body"].read())
    return result["content"][0]["text"]


def _parse_json_safe(text: str) -> dict:
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return {}

_ENRICHMENT_DEFAULTS = {
    "follow_up_questions":  [],
    "confidence_score":     None,
    "has_documentation_gap": False,
    "gap_topic":            None,
    "freshness_score":      None,
    "freshness_reason":     None,
    "is_stale":             False,
    "is_incident_related":  False,
    "root_cause_tree":      None,
    "topic_experts":        [],
}

def _run_enrichment(question: str, answer: str, sources: list) -> dict:
    """Call Claude for intelligence enrichment. Returns defaults on any failure."""
    try:
        prompt = _build_enrichment_prompt(question, answer, sources)
        raw    = _call_claude(prompt, _ENRICHMENT_SYSTEM)
        data   = _parse_json_safe(raw)

        if not data:
            logger.warning("Enrichment returned empty JSON")
            return dict(_ENRICHMENT_DEFAULTS)

        result = {**_ENRICHMENT_DEFAULTS, **data}

        if result.get("has_documentation_gap") and result.get("gap_topic"):
            _record_gap(result["gap_topic"], question)

        return result
    except Exception as exc:
        logger.warning("Enrichment failed (non-fatal): %s", exc)
        return dict(_ENRICHMENT_DEFAULTS)


# ── Audience explanation ─────────────────────────────────────────────────────────
_AUDIENCE_DESCRIPTIONS = {
    "intern":  "a first-month software engineering intern — use simple analogies, explain all jargon, no assumed knowledge",
    "junior":  "a junior engineer with 1–2 years experience — explain concepts but assume basic programming knowledge",
    "senior":  "a senior engineer with deep technical expertise — be precise and concise, skip basics",
    "manager": "an engineering manager focused on business impact and risk — emphasise the 'why', business implications, and team decisions; minimise low-level technical detail",
}

def _explain_for_audience(answer: str, question: str, audience: str) -> str:
    desc   = _AUDIENCE_DESCRIPTIONS[audience]
    prompt = (
        f"Transform the following engineering answer for {desc}.\n\n"
        "Preserve all factual accuracy. Adjust vocabulary, assumed knowledge, and depth appropriately.\n"
        "Return only the transformed answer text — no preamble, no explanation.\n\n"
        f"Original question: {question}\n\n"
        f"Original answer:\n{answer}"
    )
    return _call_claude(
        prompt,
        "You are an expert technical communicator. Transform technical content for different audiences accurately.",
        max_tokens=2048,
    )


# ── Routes ─────────────────────────────────────────────────────────────────────
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_spa(path: str):
    dist_dir = os.path.join(os.path.dirname(__file__), "static", "dist")
    if path and os.path.exists(os.path.join(dist_dir, path)):
        return send_from_directory(dist_dir, path)
    return send_from_directory(dist_dir, "index.html")


# Valid team workspace values (must match frontend TeamWorkspace type)
VALID_TEAMS = {"Platform", "Payments", "Data", "DevOps"}


def _build_agent_session_state(team: str | None) -> dict:
    """Build sessionState for invoke_agent, injecting team KB filter when set.

    Uses knowledgeBaseConfigurations to override the agent's KB retrieval config
    for this invocation only — the same team metadata filter that the old
    retrieve_and_generate used, threaded through the agent instead.
    """
    if not team or team not in VALID_TEAMS:
        return {}
    return {
        "knowledgeBaseConfigurations": [
            {
                "knowledgeBaseId": KNOWLEDGE_BASE_ID,
                "retrievalConfiguration": {
                    "vectorSearchConfiguration": {
                        "numberOfResults": 20,
                        "filter": {
                            "equals": {
                                "key":   "team",
                                "value": team,
                            }
                        }
                    }
                }
            }
        ]
    }


def _invoke_bedrock_agent(question: str, team: str | None) -> tuple[str, list]:
    """Call Bedrock Agent via invoke_agent; return (answer_text, citations).

    The agent response is an EventStream.  Each 'chunk' event carries a slice of
    the answer text in chunk['bytes'] and zero or more citations in
    chunk['attribution']['citations'].  Citations have the same
    retrievedReferences structure as retrieve_and_generate, so _extract_sources
    works without modification.
    """
    session_id = str(uuid.uuid4())   # stateless — new session per request

    kwargs: dict = {
        "agentId":      AGENT_ID,
        "agentAliasId": AGENT_ALIAS_ID,
        "sessionId":    session_id,
        "inputText":    question,
    }

    session_state = _build_agent_session_state(team)
    if session_state:
        kwargs["sessionState"] = session_state

    response = _agent_client().invoke_agent(**kwargs)

    answer_parts: list[str] = []
    all_citations: list     = []

    for event in response["completion"]:
        if "chunk" in event:
            chunk = event["chunk"]
            answer_parts.append(chunk["bytes"].decode("utf-8"))
            attribution = chunk.get("attribution", {})
            all_citations.extend(attribution.get("citations", []))
        elif "returnControl" in event:
            # Agent requested user input instead of completing — treat as empty
            logger.warning("Agent returnControl received; no answer produced")
            break

    return "".join(answer_parts), all_citations


@app.route("/ask", methods=["POST"])
def ask():
    """RAG endpoint — enriched with intelligence features.

    Accepts optional ``team`` field to scope retrieval to a specific team workspace.
    Valid values: Platform, Payments, Data, DevOps  (or omit / null for all teams).
    """
    payload  = request.get_json(silent=True) or {}
    question = payload.get("question", "").strip()
    team     = payload.get("team", "").strip() or None
    print("=" * 80)
    print("TEAM RECEIVED:", repr(team))
    print("=" * 80)
    if not question:
        return jsonify({"error": "Please enter a question."}), 400
    if len(question) > 2000:
        return jsonify({"error": "Question is too long (max 2000 characters)."}), 400
    if team and team not in VALID_TEAMS:
        return jsonify({"error": f"Invalid team. Valid values: {sorted(VALID_TEAMS)}"}), 400

    logger.info("Query: %r  team=%s", question[:120], team or "all")

    try:
        # ── Step 1: Agent invocation (retrieve + generate + action groups) ───
        answer, citations = _invoke_bedrock_agent(question, team)
        sources = _extract_sources(citations)

        logger.info("Agent: %d chars answer, %d sources", len(answer), len(sources))

        # ── Step 2: Enrichment — metadata fetch + Claude intelligence in parallel
        with ThreadPoolExecutor(max_workers=2) as pool:
            meta_future   = pool.submit(_enrich_sources_metadata, sources)
            enrich_future = pool.submit(_run_enrichment, question, answer, sources)
            sources    = meta_future.result()
            enrichment = enrich_future.result()

        owner_name, owner_email = _find_owner(question, enrichment, team)
        return jsonify({
            "answer": answer,
            "sources": sources,
            **enrichment,
            "owner": owner_name,
            "owner_email": owner_email,
        })

    except NoCredentialsError:
        logger.error("AWS credentials not found")
        return jsonify({"error": "AWS credentials not configured."}), 500
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        msg  = exc.response["Error"]["Message"]
        logger.error("Bedrock %s: %s", code, msg)
        friendly = {
            "AccessDeniedException":    "Access denied — check IAM bedrock:InvokeAgent permission.",
            "ResourceNotFoundException": f"Agent '{AGENT_ID}' / alias '{AGENT_ALIAS_ID}' not found in '{AWS_REGION}'.",
            "ThrottlingException":      "Throttled by Bedrock — please wait a moment and retry.",
            "ValidationException":      f"Validation error: {msg}",
        }.get(code, f"Bedrock error ({code}): {msg}")
        return jsonify({"error": friendly}), 500
    except Exception as exc:
        logger.exception("Unexpected error")
        return jsonify({"error": f"Unexpected error: {exc}"}), 500


@app.route("/explain", methods=["POST"])
def explain():
    """Transform an existing answer for a specific audience via prompt engineering."""
    payload  = request.get_json(silent=True) or {}
    answer   = payload.get("answer", "").strip()
    question = payload.get("question", "").strip()
    audience = payload.get("audience", "").strip()

    if not answer or not question:
        return jsonify({"error": "'answer' and 'question' are required"}), 400
    if audience not in _AUDIENCE_DESCRIPTIONS:
        return jsonify({"error": f"'audience' must be one of: {list(_AUDIENCE_DESCRIPTIONS)}"}), 400

    try:
        transformed = _explain_for_audience(answer, question, audience)
        return jsonify({"answer": transformed, "audience": audience})
    except Exception as exc:
        logger.exception("Explain failed")
        return jsonify({"error": f"Explanation failed: {exc}"}), 500


@app.route("/gaps", methods=["GET"])
def get_gaps():
    """Return all recorded knowledge gaps sorted by frequency."""
    gaps = _load_gaps()
    gaps.sort(key=lambda g: (-g.get("frequency", 0), g.get("last_seen", "")))
    return jsonify({"gaps": gaps})


@app.route("/gaps/<gap_id>", methods=["DELETE"])
def delete_gap(gap_id: str):
    """Mark a gap as resolved (remove from list)."""
    gaps = [g for g in _load_gaps() if g.get("id") != gap_id]
    _save_gaps(gaps)
    return jsonify({"ok": True})


@app.route("/teams")
def get_teams():
    """Return available team workspaces for the UI workspace selector."""
    return jsonify({
        "teams": [
            {"id": "Platform", "label": "Platform",  "description": "Infrastructure, Kubernetes, Redis, API Gateway"},
            {"id": "Payments", "label": "Payments",  "description": "Stripe, billing, refunds, fraud detection"},
            {"id": "Data",     "label": "Data",       "description": "ETL pipelines, data warehouse, ML models"},
            {"id": "DevOps",   "label": "DevOps",     "description": "CI/CD, incident response, monitoring"},
        ]
    })


@app.route("/health")
def health():
    return jsonify({"status": "ok", "knowledge_base_id": KNOWLEDGE_BASE_ID, "teams": sorted(VALID_TEAMS)})


if __name__ == "__main__":
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=5001, debug=debug)

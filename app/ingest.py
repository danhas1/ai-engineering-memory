"""
Knowledge Base Ingestion Script
--------------------------------
Uploads local knowledge_base/ documents to S3 with companion Bedrock metadata files,
then optionally triggers a Bedrock Knowledge Base sync.

Usage:
    python ingest.py [--dry-run] [--team TEAM] [--sync]

Environment variables (or .env file):
    S3_BUCKET          S3 bucket where the knowledge base source documents live
    S3_PREFIX          Prefix (folder) within the bucket  (default: "knowledge_base")
    KNOWLEDGE_BASE_ID  Bedrock KB ID to sync after upload  (default: from .env)
    AWS_REGION         AWS region                           (default: us-east-1)
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from dotenv import load_dotenv

load_dotenv()

# ── Configuration ──────────────────────────────────────────────────────────────
S3_BUCKET         = os.getenv("S3_BUCKET", "")
S3_PREFIX         = os.getenv("S3_PREFIX", "knowledge_base").rstrip("/")
KNOWLEDGE_BASE_ID = os.getenv("KNOWLEDGE_BASE_ID", "HGUEY0A2WY")
AWS_REGION        = os.getenv("AWS_REGION", "us-east-1")

REPO_ROOT      = Path(__file__).parent.parent
KB_ROOT        = REPO_ROOT / "knowledge_base"

# Map directory name → canonical team label
TEAM_MAP = {
    "platform":  "Platform",
    "payments":  "Payments",
    "data":      "Data",
    "devops":    "DevOps",
    # Legacy folders — map to VALID_TEAMS so filter excludes them correctly.
    # adrs/runbooks/migrations are platform engineering work.
    "adrs":           "Platform",
    "runbooks":       "Platform",
    "migrations":     "Platform",
    # incidents/jira/slack/retros are cross-team operational records — tag Platform
    # so they are excluded from Data/Payments/DevOps filtered searches.
    "incidents":      "Platform",
    "architecture":   "Platform",
    "jira":           "Platform",
    "slack":          "Platform",
    "retrospectives": "Platform",
    "reviews":        "Platform",
    "reports":        "Platform",
}


# ── Metadata parsing ───────────────────────────────────────────────────────────

def _parse_metadata(content: str, s3_key: str) -> dict:
    """Extract Author, Team, Last Updated, and Tags from the document header."""
    author       = None
    team         = None
    last_updated = None
    tags         = []

    # Author
    for pat in [
        r"\*\*Author:\*\*\s*([^\n*]+)",
        r"\*\*Postmortem author:\*\*\s*([^\n*]+)",
        r"\*\*Owner:\*\*\s*([^\n,(*)]+)",
        r"\*\*Deciders:\*\*\s*([^\n*]+)",
        r"Author:\s*([^\n,*]+)",
    ]:
        m = re.search(pat, content, re.IGNORECASE)
        if m:
            raw = m.group(1).strip()
            first = re.split(r"[,(]", raw)[0].strip()
            if first and len(first) < 60 and not first.startswith("**"):
                author = first
                break

    # Team from header, then fall back to path
    for pat in [r"\*\*Team:\*\*\s*([^\n*]+)", r"Team:\s*([^\n*]+)"]:
        m = re.search(pat, content, re.IGNORECASE)
        if m:
            team = m.group(1).strip()
            break
    if not team:
        parts = s3_key.lower().split("/")
        for part in parts:
            if part in TEAM_MAP:
                team = TEAM_MAP[part]
                break

    # Last Updated
    for pat in [
        r"\*\*Last Updated:\*\*\s*(\d{4}-\d{2}-\d{2})",
        r"\*\*Last updated:\*\*\s*(\d{4}-\d{2}-\d{2})",
        r"\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})",
        r"Last [Uu]pdated:\s*(\d{4}-\d{2}-\d{2})",
        r"Date:\s*(\d{4}-\d{2}-\d{2})",
    ]:
        m = re.search(pat, content, re.IGNORECASE)
        if m:
            last_updated = m.group(1)
            break

    # Tags
    for pat in [r"\*\*Tags:\*\*\s*([^\n*]+)", r"Tags:\s*([^\n*]+)"]:
        m = re.search(pat, content, re.IGNORECASE)
        if m:
            raw_tags = m.group(1).strip()
            tags = [t.strip() for t in raw_tags.split(",") if t.strip()]
            break

    return {
        "team":         team or "Unknown",
        "author":       author or "Unknown",
        "last_updated": last_updated or "",
        "tags":         ",".join(tags),
    }


# ── Bedrock metadata file format ───────────────────────────────────────────────

def _metadata_json(meta: dict) -> str:
    """Produce the Bedrock companion metadata JSON for an S3 document."""
    return json.dumps(
        {"metadataAttributes": {k: v for k, v in meta.items() if v}},
        indent=2,
    )


# ── S3 upload helpers ──────────────────────────────────────────────────────────

def _upload(s3, bucket: str, key: str, body: str, dry_run: bool) -> None:
    if dry_run:
        print(f"  [dry-run] would upload: s3://{bucket}/{key}")
        return
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=body.encode("utf-8"),
        ContentType="text/markdown" if key.endswith(".md") else "application/json",
    )
    print(f"  uploaded: s3://{bucket}/{key}")


# ── Main ingestion logic ───────────────────────────────────────────────────────

def ingest(dry_run: bool = False, team_filter: str | None = None, trigger_sync: bool = False):
    if not S3_BUCKET:
        print("ERROR: S3_BUCKET environment variable is not set.", file=sys.stderr)
        print("       Set it in .env or as an environment variable:", file=sys.stderr)
        print("       S3_BUCKET=your-bucket-name", file=sys.stderr)
        sys.exit(1)

    try:
        s3 = boto3.client("s3", region_name=AWS_REGION)
        bedrock_agent = boto3.client("bedrock-agent", region_name=AWS_REGION) if trigger_sync else None
    except NoCredentialsError:
        print("ERROR: AWS credentials not configured.", file=sys.stderr)
        sys.exit(1)

    uploaded = 0
    skipped  = 0

    for md_file in sorted(KB_ROOT.rglob("*.md")):
        # Determine team from parent directory name
        rel_path  = md_file.relative_to(KB_ROOT)
        team_dir  = rel_path.parts[0].lower() if len(rel_path.parts) > 1 else ""
        canonical = TEAM_MAP.get(team_dir)

        # Apply team filter if specified
        if team_filter and canonical and canonical.lower() != team_filter.lower():
            skipped += 1
            continue

        content  = md_file.read_text(encoding="utf-8")
        s3_key   = f"{S3_PREFIX}/{rel_path.as_posix()}"
        meta_key = f"{s3_key}.metadata.json"

        # Parse metadata from document header
        meta = _parse_metadata(content, s3_key)

        print(f"\n{'[DRY] ' if dry_run else ''}Processing: {rel_path}")
        print(f"  team={meta['team']}  author={meta['author']}  "
              f"updated={meta['last_updated']}  tags={meta['tags'][:60]}")

        # Upload document
        _upload(s3, S3_BUCKET, s3_key, content, dry_run)

        # Upload companion metadata file
        _upload(s3, S3_BUCKET, meta_key, _metadata_json(meta), dry_run)

        uploaded += 1

    print(f"\n{'[dry-run] ' if dry_run else ''}Done: {uploaded} documents uploaded"
          f" ({skipped} skipped by team filter).")

    # Trigger Bedrock KB ingestion job
    if trigger_sync and not dry_run:
        _sync_knowledge_base(bedrock_agent)


def _sync_knowledge_base(bedrock_agent):
    """Start a Bedrock KB ingestion job to pick up new/updated documents."""
    print(f"\nStarting Bedrock ingestion job for KB: {KNOWLEDGE_BASE_ID} ...")
    try:
        ds_id = _get_data_source_id(bedrock_agent)
        resp  = bedrock_agent.start_ingestion_job(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            dataSourceId=ds_id,
        )
        job_id = resp["ingestionJob"]["ingestionJobId"]
        print(f"Ingestion job started: {job_id}")
        _wait_for_ingestion(bedrock_agent, job_id, ds_id)
    except ClientError as e:
        print(f"ERROR starting ingestion job: {e}", file=sys.stderr)


def _get_data_source_id(bedrock_agent) -> str:
    """Retrieve the first data source ID for the configured knowledge base."""
    resp = bedrock_agent.list_data_sources(knowledgeBaseId=KNOWLEDGE_BASE_ID)
    sources = resp.get("dataSourceSummaries", [])
    if not sources:
        raise ValueError(f"No data sources found for KB {KNOWLEDGE_BASE_ID}")
    ds_id = sources[0]["dataSourceId"]
    print(f"  Using data source: {ds_id}")
    return ds_id


def _wait_for_ingestion(bedrock_agent, job_id: str, ds_id: str, timeout: int = 600):
    """Poll until the ingestion job completes or times out."""
    print("Waiting for ingestion job to complete...")
    start = time.time()
    while time.time() - start < timeout:
        resp   = bedrock_agent.get_ingestion_job(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            ingestionJobId=job_id,
            dataSourceId=ds_id,
        )
        status = resp["ingestionJob"]["status"]
        print(f"  Status: {status}")
        if status in ("COMPLETE", "FAILED", "STOPPED"):
            stats = resp["ingestionJob"].get("statistics", {})
            print(f"  Documents scanned:  {stats.get('numberOfDocumentsScanned', '?')}")
            print(f"  Documents indexed:  {stats.get('numberOfNewDocumentsIndexed', '?')}")
            print(f"  Documents updated:  {stats.get('numberOfModifiedDocumentsIndexed', '?')}")
            print(f"  Failures:           {stats.get('numberOfDocumentsDeletionFailed', '?')}")
            if status == "FAILED":
                print("ERROR: Ingestion job failed.", file=sys.stderr)
            return
        time.sleep(15)
    print("WARNING: Ingestion job timed out — check the Bedrock console.", file=sys.stderr)


# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Upload knowledge base documents to S3 for Bedrock indexing.")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be uploaded without doing it")
    parser.add_argument("--team", metavar="TEAM", help="Only upload documents for this team (Platform/Payments/Data/DevOps)")
    parser.add_argument("--sync", action="store_true", help="Trigger a Bedrock KB ingestion job after upload")
    args = parser.parse_args()

    ingest(dry_run=args.dry_run, team_filter=args.team, trigger_sync=args.sync)


if __name__ == "__main__":
    main()

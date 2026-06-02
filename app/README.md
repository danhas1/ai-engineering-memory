# Engineering Organizational Memory Assistant

An internal web application that lets engineers query CloudShop's engineering knowledge base using natural language.  
Questions are answered by Amazon Bedrock's **RetrieveAndGenerate** API: relevant documents are retrieved from the Knowledge Base and passed to Claude as grounding context, which generates a cited, human-readable answer.

---

## Project Overview

| Property | Value |
|---|---|
| Knowledge Base ID | `HGUEY0A2WY` |
| AWS Region | `us-east-1` |
| Generation model | Claude 3 Sonnet (configurable) |
| Backend | Python 3.12, Flask 3, Gunicorn |
| Frontend | Server-rendered Jinja2 + vanilla JS, marked.js |
| Container | Docker (multi-stage, non-root user) |
| Port | `5000` |

### What can you ask?

- *"Why did CloudShop migrate from ECS to EKS?"*
- *"What caused the November 2025 payment service outage?"*
- *"What action items came out of the payment outage postmortem?"*
- *"Why was Redis chosen over Memcached?"*
- *"What is the payment-service SLO and who owns it?"*
- *"How should an on-call engineer respond to a high-latency alert?"*

---

## Architecture

```
Browser
  │
  │  HTTP POST /ask  { question: "..." }
  ▼
Flask (app.py)
  │
  │  boto3  bedrock-agent-runtime.retrieve_and_generate()
  ▼
Amazon Bedrock Knowledge Base (HGUEY0A2WY)
  │
  ├── Vector search over S3-backed document corpus
  │       knowledge_base/adrs/*.md
  │       knowledge_base/incidents/*.md
  │       knowledge_base/jira/*.md
  │       knowledge_base/runbooks/*.md
  │       knowledge_base/slack/*.md
  │       knowledge_base/architecture/*.md
  │       knowledge_base/retrospectives/*.md
  │       knowledge_base/reviews/*.md
  │
  └── Claude (foundation model) generates answer from retrieved chunks
          │
          ▼
    { answer: "...", citations: [...] }
          │
          ▼
Flask returns JSON → browser renders answer + source cards
```

### How Bedrock is used

The application calls the `retrieve_and_generate` method on the
`bedrock-agent-runtime` boto3 client.  This single API call:

1. Embeds the question using the Knowledge Base's configured embedding model.
2. Performs a vector similarity search over the indexed document corpus.
3. Passes the top-k retrieved document chunks to Claude as context.
4. Returns Claude's generated answer together with a `citations` list that
   identifies which source documents contributed to the answer.

The application extracts the S3 URIs and text excerpts from `citations` and
displays them as "Retrieved Sources" below the answer.

---

## Running Locally

### Prerequisites

- Python 3.12+
- AWS credentials with the following IAM permissions:
  - `bedrock:RetrieveAndGenerate`
  - `bedrock:Retrieve`
  - Access to Knowledge Base `HGUEY0A2WY`

### Setup

```bash
# 1. Clone the repository and navigate to the app directory
cd app/

# 2. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment variables
cp .env.example .env
# Edit .env and fill in your AWS credentials

# 5. Start the development server
python app.py
```

Open [http://localhost:5000](http://localhost:5000).

The development server reloads automatically when `app.py` or the templates
change.  Set `FLASK_DEBUG=true` in `.env` for verbose debug output.

---

## Building the Docker Image

```bash
# From the app/ directory
docker build -t memory-assistant:latest .
```

The Dockerfile uses a **two-stage build**: Python wheels are compiled in the
first stage and only the final binaries are copied into the runtime image,
keeping the image lean (~180 MB).

Verify the build:

```bash
docker images memory-assistant
```

---

## Running the Container

### Option A — IAM instance role (recommended for EC2)

When the container runs on an EC2 instance with an attached IAM role that
grants Bedrock access, no credential environment variables are needed:

```bash
docker run -d \
  --name memory-assistant \
  --restart unless-stopped \
  -p 5000:5000 \
  -e KNOWLEDGE_BASE_ID=HGUEY0A2WY \
  -e AWS_REGION=us-east-1 \
  memory-assistant:latest
```

### Option B — explicit credentials (local / CI)

```bash
docker run -d \
  --name memory-assistant \
  --restart unless-stopped \
  -p 5000:5000 \
  -e AWS_ACCESS_KEY_ID=YOUR_KEY \
  -e AWS_SECRET_ACCESS_KEY=YOUR_SECRET \
  -e AWS_REGION=us-east-1 \
  -e KNOWLEDGE_BASE_ID=HGUEY0A2WY \
  memory-assistant:latest
```

Open [http://localhost:5000](http://localhost:5000).

### Useful container commands

```bash
# View logs
docker logs -f memory-assistant

# Stop
docker stop memory-assistant

# Remove
docker rm memory-assistant

# Health check
curl http://localhost:5000/health
```

---

## Deploying on EC2

### 1. Launch an EC2 instance

- **AMI:** Amazon Linux 2023 (or Ubuntu 22.04 LTS)
- **Instance type:** `t3.small` or larger
- **Security Group:** allow inbound TCP 22 (SSH) and TCP 5000 (or 80 if using Nginx)
- **IAM Instance Profile:** attach a role with the following inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:RetrieveAndGenerate",
        "bedrock:Retrieve",
        "bedrock:InvokeModel"
      ],
      "Resource": "*"
    }
  ]
}
```

### 2. Install Docker

```bash
# Amazon Linux 2023
sudo dnf update -y
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
# Log out and back in for the group change to take effect
```

```bash
# Ubuntu 22.04
sudo apt-get update -y
sudo apt-get install -y docker.io
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
```

### 3. Copy the application to the instance

```bash
# From your local machine
scp -r ./app/ ec2-user@<EC2-PUBLIC-IP>:~/memory-assistant/
```

Or clone from your git repository:

```bash
git clone https://github.com/your-org/memory-assistant.git
cd memory-assistant/app
```

### 4. Build and run the container

```bash
cd ~/memory-assistant/app
docker build -t memory-assistant:latest .

docker run -d \
  --name memory-assistant \
  --restart unless-stopped \
  -p 5000:5000 \
  -e KNOWLEDGE_BASE_ID=HGUEY0A2WY \
  -e AWS_REGION=us-east-1 \
  memory-assistant:latest
```

### 5. Verify

```bash
curl http://localhost:5000/health
# Expected: {"status": "ok", "knowledge_base_id": "HGUEY0A2WY"}
```

Access the application at `http://<EC2-PUBLIC-IP>:5000`.

### 6. (Optional) Put Nginx in front on port 80

```bash
sudo dnf install -y nginx    # or apt-get install nginx

sudo tee /etc/nginx/conf.d/memory-assistant.conf > /dev/null <<'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass         http://127.0.0.1:5000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }
}
EOF

sudo systemctl enable --now nginx
```

---

## Project Structure

```
app/
├── app.py                # Flask application and Bedrock integration
├── requirements.txt      # Python dependencies
├── Dockerfile            # Multi-stage Docker build
├── .env.example          # Environment variable reference (safe to commit)
├── README.md             # This file
├── templates/
│   └── index.html        # Single-page Jinja2 template
└── static/
    └── style.css         # Engineering portal stylesheet
```

---

## Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `KNOWLEDGE_BASE_ID` | `HGUEY0A2WY` | Amazon Bedrock Knowledge Base ID |
| `AWS_REGION` | `us-east-1` | AWS region |
| `MODEL_ARN` | Claude 3 Sonnet | Bedrock foundation model ARN for generation |
| `AWS_ACCESS_KEY_ID` | — | AWS key (not needed with IAM instance role) |
| `AWS_SECRET_ACCESS_KEY` | — | AWS secret (not needed with IAM instance role) |
| `FLASK_DEBUG` | `false` | Enable Flask debug mode (local dev only) |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `AccessDeniedException` | IAM principal lacks Bedrock permissions | Add `bedrock:RetrieveAndGenerate` to the IAM policy |
| `ResourceNotFoundException` | Wrong KB ID or region | Verify `KNOWLEDGE_BASE_ID` and `AWS_REGION` |
| `NoCredentialsError` | No AWS credentials found | Set env vars or attach an IAM instance role |
| `ThrottlingException` | Bedrock rate limit hit | Wait and retry; consider request throttling in app |
| Container exits immediately | Missing env var or port conflict | Check `docker logs memory-assistant` |

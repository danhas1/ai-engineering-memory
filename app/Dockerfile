# ---------------------------------------------------------------------------
# Stage 1 — dependency installation
# Using a separate stage keeps the final image clean: only compiled wheels
# are copied across, not pip's download cache or build tools.
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build dependencies for any C-extension packages
RUN apt-get update && apt-get install -y --no-install-recommends gcc && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --upgrade pip && \
    pip wheel --no-cache-dir --wheel-dir /build/wheels -r requirements.txt


# ---------------------------------------------------------------------------
# Stage 2 — final runtime image
# ---------------------------------------------------------------------------
FROM python:3.12-slim

# Security: run as a non-root user
RUN useradd --create-home --shell /bin/bash appuser

WORKDIR /app

# Copy pre-built wheels from the builder stage and install them
COPY --from=builder /build/wheels /wheels
RUN pip install --no-cache-dir --no-index --find-links=/wheels /wheels/* && \
    rm -rf /wheels

# Copy application source
COPY app.py .
COPY templates/ templates/
COPY static/ static/
# owners.json is the team contact directory read at startup; must be present in image
COPY owners.json .

# Give the app directory to the non-root user
RUN chown -R appuser:appuser /app

USER appuser

# Expose the Flask / Gunicorn port
EXPOSE 5000

# Health check — Docker will mark the container unhealthy if this fails
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')"

# WEB_CONCURRENCY lets you tune workers at runtime without rebuilding the image.
# AWS credentials come from the EC2 IAM Instance Role via IMDS (169.254.169.254) —
# boto3 resolves them automatically; never bake secrets into the image.
ENV WEB_CONCURRENCY=4

CMD ["sh", "-c", "gunicorn --workers ${WEB_CONCURRENCY} --bind 0.0.0.0:5000 --timeout 120 --access-logfile - --error-logfile - app:app"]

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

# Give the app directory to the non-root user
RUN chown -R appuser:appuser /app

USER appuser

# Expose the Flask / Gunicorn port
EXPOSE 5000

# Health check — Docker will mark the container unhealthy if this fails
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')"

# Production server: 4 Gunicorn workers, bound to all interfaces on port 5000.
# AWS credentials are injected via environment variables or an IAM instance role —
# never bake secrets into the image.
CMD ["gunicorn", \
     "--workers", "4", \
     "--bind", "0.0.0.0:5000", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "app:app"]

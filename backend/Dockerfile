FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/requirements.txt
ENV FASTEMBED_CACHE_PATH=/app/.fastembed
RUN python -c "from fastembed import TextEmbedding; from fastembed.rerank.cross_encoder import TextCrossEncoder; TextEmbedding('sentence-transformers/all-MiniLM-L6-v2'); TextCrossEncoder('Xenova/ms-marco-MiniLM-L-6-v2')"
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ ./backend/

EXPOSE 8000

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
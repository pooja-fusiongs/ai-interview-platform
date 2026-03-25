FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for opencv, mediapipe, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run sets PORT env variable, default to 8080
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn main_final:app --host 0.0.0.0 --port ${PORT} --timeout-keep-alive 120"]
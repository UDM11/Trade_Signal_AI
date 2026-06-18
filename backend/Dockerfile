FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir $(grep -v 'git+' requirements.txt | tr '\n' ' ')
RUN pip install --no-cache-dir --retries 3 \
    git+https://github.com/basic-bgnr/NepseUnofficialApi || \
    pip install --no-cache-dir --retries 3 \
    git+https://github.com/basic-bgnr/NepseUnofficialApi

COPY app/ ./app/

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]

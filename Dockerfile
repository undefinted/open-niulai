FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml README.md LICENSE ./
COPY scripts ./scripts
COPY web ./web
COPY assets/demo ./assets/demo
RUN pip install --no-cache-dir .

ENV HOST=0.0.0.0 PORT=7860 PYTHONUNBUFFERED=1
EXPOSE 7860
CMD ["open-niulai-web"]

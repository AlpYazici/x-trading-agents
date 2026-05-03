FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install the upstream tradingagents package + the api package together.
COPY pyproject.toml /tmp/agents/pyproject.toml
COPY tradingagents /tmp/agents/tradingagents
COPY cli /tmp/agents/cli
COPY README.md /tmp/agents/README.md

COPY apps/api/pyproject.toml /app/pyproject.toml
COPY apps/api/app /app/app

RUN pip install --no-cache-dir /tmp/agents \
 && pip install --no-cache-dir fastapi 'uvicorn[standard]' sse-starlette pydantic pydantic-settings sqlmodel python-dotenv 'alpaca-py>=0.43.4' httpx \
 && pip install --no-cache-dir -e /app --no-deps \
 && rm -rf /tmp/agents

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

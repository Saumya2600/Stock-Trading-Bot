FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl gcc g++ libpq-dev \
    && pip install --no-cache-dir -r requirements.txt \
    && apt-get remove -y gcc g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY . /app
WORKDIR /app

EXPOSE 8001
CMD ["uvicorn", "bot:api", "--host", "0.0.0.0", "--port", "8001"]

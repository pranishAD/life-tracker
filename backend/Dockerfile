# Life Tracker backend — dev image.
# Python 3.12, FastAPI, run with uvicorn --reload (source is bind-mounted
# by docker-compose.yml so edits on the host show up without a rebuild).

FROM python:3.12-slim

WORKDIR /app

# System deps needed to build psycopg2 against the slim base image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Upgrade pip first: the base image's bundled pip has known advisories (SEC-011).
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY flask-backend/ ./flask-backend/
WORKDIR /app/flask-backend

EXPOSE 8080

CMD ["sh", "-c", "gunicorn --worker-class eventlet --workers 1 --bind 0.0.0.0:${PORT:-8080} --timeout 120 --access-logfile - --error-logfile - teste:app"]

FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN python web/build.py
ENV DB_PATH=/data/debugwise.db
CMD ["sh","-c","uvicorn server.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

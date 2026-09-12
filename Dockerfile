# One container, three destinations: a local host, a temporary Cloud Run service,
# and the internal environment. Only the environment variables differ.
FROM python:3.12-slim

WORKDIR /srv
COPY app/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# The page ships inside the same image as the service that answers it, so a
# deployment is one thing to roll out and the browser needs no configuration.
COPY app ./app
COPY renderer ./renderer

# Cloud Run supplies PORT.
ENV PORT=8080 NW_PROVIDER=mock
EXPOSE 8080
CMD ["sh", "-c", "uvicorn app.server:app --host 0.0.0.0 --port ${PORT}"]

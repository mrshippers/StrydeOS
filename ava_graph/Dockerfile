FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy package into /app/ava_graph/ so `from ava_graph.x import y` resolves
COPY . /app/ava_graph/

RUN useradd -m -u 1000 appuser
USER appuser

EXPOSE 8080

CMD ["uvicorn", "ava_graph.main:app", "--host", "0.0.0.0", "--port", "8080"]

FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install flask requests psycopg2-binary minio
COPY . .
EXPOSE 5000
CMD ["python", "app.py"]
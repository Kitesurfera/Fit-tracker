FROM python:3.11-slim

# Instalar dependencias del sistema (FFmpeg)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar las dependencias de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar todo el código del backend
COPY . .

# Comando de inicio (asegúrate de que tu archivo principal de python se llame main.py, si se llama de otra forma cambia 'main' por el nombre de tu archivo sin el .py)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000"]

FROM python:3.11.14-bookworm

# # ONLY IF USING SLIMMER VERSION OF PYTHON MAY NEED TO INSTALL THE FOLLOWING:
# # Install OS-level dependencies for Pillow/image formats
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     build-essential \
#     libjpeg62-turbo-dev \
#     zlib1g-dev \
#     libpng-dev \
#     libfreetype6-dev \
#     libopenjp2-7-dev \
#     libtiff5-dev \
#     libwebp-dev \
#     tk-dev \
#     && rm -rf /var/lib/apt/lists/*

WORKDIR /backend

COPY requirements.txt .

RUN pip install --upgrade pip && \
    pip install -r requirements.txt

COPY . .

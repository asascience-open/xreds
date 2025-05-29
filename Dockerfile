

# Build the react frontend
FROM node:22-alpine

# Create a folder for the app to live in
RUN mkdir -p /opt/viewer
WORKDIR /opt/viewer

COPY viewer/*.json viewer/*.config.cjs viewer/*.config.ts  ./

RUN npm install

COPY viewer/index.html ./index.html
COPY viewer/public ./public
COPY viewer/src ./src

ARG ROOT_PATH
ENV VITE_XREDS_BASE_URL=${ROOT_PATH}
RUN npm run build

# Build the python service layer
FROM public.ecr.aws/b1r9q1p5/rps-matplotlib:latest

# Native dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    build-essential \
    libhdf5-dev \
    libopenblas-dev \
    libgeos-dev \
    libnetcdf-dev \
    libproj-dev \
    libudunits2-dev \
    libeccodes-dev

# Create a folder for the app to live in
RUN mkdir -p /opt/xreds
WORKDIR /opt/xreds

# Holder directory where react app lives in production
RUN mkdir build

# Install rust build tools
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Install python package tools
RUN pip3 install --upgrade pip uv

# Shapely needs to be installed from source to work with the version of GEOS installed https://stackoverflow.com/a/53704107
# RUN uv pip install --python=$(which python3) --no-binary :all: shapely

# Copy over and install dependencies
COPY requirements.txt ./requirements.txt
RUN uv pip install --python=/usr/local/bin/python3 -r requirements.txt

# Configure matplotlib to use Agg backend
RUN mkdir -p /root/.config/matplotlib
RUN echo "backend : Agg" > /root/.config/matplotlib/matplotlibrc

# Copy over python app source code
COPY static ./static
COPY xreds ./xreds
COPY app.py ./app.py

# Copy the frontend build
COPY --from=0 /opt/viewer/dist ./viewer/dist

# Set the port to run the server on
ENV PORT 8090
ARG ROOT_PATH
ENV ROOT_PATH ${ROOT_PATH}

ARG WORKERS=1
ENV WORKERS ${WORKERS}

ARG LOG_LEVEL="debug"
ENV LOG_LEVEL ${LOG_LEVEL}

# Run the webserver
CMD ["sh", "-c", "gunicorn --workers=${WORKERS} --worker-class=uvicorn.workers.UvicornWorker --log-level=${LOG_LEVEL} --bind=0.0.0.0:${PORT} app:app"]

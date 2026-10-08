# syntax=docker/dockerfile:1

ARG PYTHON_IMAGE=python:3.12-slim

FROM ${PYTHON_IMAGE} AS dependencies

# Git is only needed to install the VCS requirements.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --no-cache-dir uv

WORKDIR /opt/xreds

COPY requirements.txt ./requirements.txt
RUN --mount=type=cache,target=/root/.cache/uv \
    uv venv /opt/venv --python /usr/local/bin/python3 \
    && UV_LINK_MODE=copy uv pip install --python=/opt/venv/bin/python -r requirements.txt


FROM ${PYTHON_IMAGE}

RUN apt-get update \
    && apt-get install -y --no-install-recommends libexpat1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/xreds

COPY --from=dependencies /opt/venv /opt/venv
COPY xreds ./xreds
COPY app.py ./app.py

ENV PATH="/opt/venv/bin:${PATH}" \
    MPLBACKEND=Agg \
    PORT=8090

ARG ROOT_PATH
ENV ROOT_PATH=${ROOT_PATH}

ARG WORKERS=1
ENV WORKERS=${WORKERS}

ARG LOG_LEVEL=debug
ENV LOG_LEVEL=${LOG_LEVEL}

CMD ["sh", "-c", "gunicorn --workers=${WORKERS} --worker-class=uvicorn.workers.UvicornWorker --log-level=${LOG_LEVEL} --bind=0.0.0.0:${PORT} app:app"]

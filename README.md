# xreds

XArray Environmental Data Services

## Running Locally

### Installing dependencies

#### System Dependencies

**macOS**

```bash
brew install netcdf4 h5 geos proj eccodes
```

#### Python Dependencies

Then install with `uv` in a virtualenv:

```bash
uv venv
source venv/bin/activate
uv pip install -r requirements.txt
```

Or install with `pip` in a `virtualenv`:

```bash
virtualenv -p python3 env/
source env/bin/activate
pip install -r requirements.txt
```

### Running the server

Build the react app

```bash
cd viewer/
npm run install
npm run build
```

Run the following in the activated `virtualenv`:

```bash
DATASETS_MAPPING_FILE=./test.json python app.py
```

Where `DATASETS_MAPPING_FILE` is the path to the dataset key value store as described [here](./README.md#specifying-datasets). You can now navigate to `http://localhost:8090/docs` to see the supported operations

## Running With Docker

### Building and Running manually

The docker container for the app can be built with:

```bash
docker build -t xreds:latest .
```

There are aso build arguments available when building the docker image:

- `ROOT_PATH`: The root path the app will be served from. Defaults to `/xreds/`.
- `WORKERS`: The number of gunicorn workers to run. Defaults to `1`.

Once built, it requires a few things to be run: The `8090` port to be exposed, and a volume for the datasets to live in, and the environment variable pointing to the dateset json file.

```bash
docker run -p 8090:8090 -e "DATASETS_MAPPING_FILE=/path/to/datasets.json" -v "/path/to/datasets:/opt/xreds/datasets" xreds:latest
```

### Running with `docker compose`

There are a few `docker compose` examples to get started with:

#### Vanilla

```bash
docker compose -d
```

#### With Redis

```bash
docker compose -f docker-compose-redis.yml up -d
```

#### With NGINX Proxy

```bash
docker compose -f docker-compose-nginx.yml up -d
```

## Specifying Datasets

Datasets are specified in a key value manner, where the keys are the dataset ids and the values are objects with the path and access control info for the datasets:

```json
{
    "gfswave_global": {
        "path": "s3://nextgen-dmac/kerchunk/gfswave_global_kerchunk.json",
        "type": "kerchunk",
        "chunks": {},
        "drop_variables": ["orderedSequenceData"]
    },
    "dbofs": {
        "path": "s3://nextgen-dmac/nos/nos.dbofs.fields.best.nc.zarr",
        "type": "kerchunk",
        "chunks": {
            "ocean_time": 1
        },
        "drop_variables": ["dstart"]
    }
}
```

Equivalent yaml is also supported:

```yaml
---

gfswave_global:
  path: s3://nextgen-dmac/kerchunk/gfswave_global_kerchunk.json
  type: kerchunk
  chunks: {}
  drop_variables:
    - orderedSequenceData
```

Currently `zarr`, `netcdf`, and [`kerchunk`](https://github.com/fsspec/kerchunk) dataset types are supported. This information should be saved a file and specified when running.

## Configuration Options

The following environment variables can be set to configure the app:

- `DATASETS_MAPPING_FILE`: The fsspec compatible path to the dataset key value store as described [here](./README.md#specifying-datasets)
- `PORT`: The port the app should run on. Defaults to `8090`
- `ROOT_PATH`: The root path the app will be served from. Defaults to `` to be served from the root.
- `EXPORT_THRESHOLD`: The maximum size file to allow to be exported. Defaults to `500 MB`
- `USE_REDIS_CACHE`: Whether to use a redis cache for the app. Defaults to `False`
- `REDIS_HOST`: [Optional] The host of the redis cache. Defaults to `localhost`
- `REDIS_PORT`: [Optional] The port of the redis cache. Defaults to `6379`

## Building and Deploying Docker Image

First follow instructions above to build the docker image tagged `xreds:latest`. Then the`xreds:latest` image needs to be tagged and deployed to the relevant docker registry.

```bash
# Auth with ECR
aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws/m2c5k9c1

# Tag the image
docker tag xreds:latest public.ecr.aws/m2c5k9c1/nextgen-dmac/xreds:latest

# Push the image
docker push public.ecr.aws/m2c5k9c1/nextgen-dmac/xreds:latest
```

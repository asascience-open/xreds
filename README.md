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
        "drop_variables": ["orderedSequenceData"],
        "target_protocol": "s3",
        "target_options": {
            "anon": false,
            "key": "my aws key"
            "secret": "my aws secret"
        }
    },
    "dbofs": {
        "path": "s3://nextgen-dmac/nos/nos.dbofs.fields.best.nc.zarr",
        "type": "kerchunk",
        "chunks": {
            "ocean_time": 1
        },
        "drop_variables": ["dstart"],
        "mask_variables": {
            "time": "time_mask"
        }
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

Currently `zarr`, `netcdf`, and [`kerchunk`](https://github.com/fsspec/kerchunk) dataset types are supported. This information should be saved in a file and specified when running via environment variable `DATASETS_MAPPING_FILE`.

### Dataset Type Schema

```json
{
    // path to dataset - used in xr.open_dataset(path)
    "path": "s3://nextgen-dmac/kerchunk/gfswave_global_kerchunk.json",
    // type of dataset - supported options: ZARR | KERCHUNK | NETCDF
    "type": "kerchunk",
    // (optional) engine used when opening dataset - only used when type=netcdf
    // [default: None]
    "engine": "netcdf4",
    // (optional) chunking strategy for dataset - see xr.open_dataset docs
    // [default: None]
    "chunks": {},
    // (optional) array of dataset variable names to drop - see xr.open_dataset docs
    // [default: None]
    "drop_variables": ["orderedSequenceData"],
    // (optional) see fsspec ReferenceFileSystem - only used when type=kerchunk|zarr
    // [default: "s3"]
    "remote_protocol": "s3",
    // (optional) see fsspec ReferenceFileSystem - only used when type=kerchunk|zarr
    // [default: {"anon": True}]
    "remote_options": {
        "anon": true,
    },
    // (optional) see fsspec ReferenceFileSystem - only used when type=kerchunk|zarr
    // [default: "s3"]
    "target_protocol": "s3",
    // (optional) see fsspec ReferenceFileSystem - only used when type=kerchunk|zarr
    // [default: {"anon": True}]
    "target_options": {
        "anon": false,
    },
    // (optional) extensions to apply to the dataset - supports "vdatum" & "roms"
    // [default: None]
    "extensions": {
      "vdatum": {
        // fsspec path to vdatum dataset
        "path": "s3://nextgen-dmac-cloud-ingest/nos/vdatums/ngofs2_vdatums.nc.zarr", 
        // variable to use for water level
        "water_level_var": "zeta", 
        // variable mapping to vdatum transformation
        "vdatum_var": "mllwtomsl", 
        // name of the vdatum transformation
        "vdatum_name": "mllw" 
      }
    }
}
```

## Configuration Options

The following environment variables can be set to configure the app:

- `DATASETS_MAPPING_FILE`: The fsspec compatible path to the dataset key value store as described [here](./README.md#specifying-datasets)
- `PORT`: The port the app should run on. Defaults to `8090`.
- `WORKERS`: The number of worker threads handling requests. Defaults to `1`
- `ROOT_PATH`: The root path the app will be served from. Defaults to be served from the root.
- `DATASET_CACHE_TIMEOUT`: The time in seconds to cache the dataset metadata. Defaults to `600` (10 minutes).
- `USE_MEMORY_CACHE`: Whether to save loaded datasets into worker memory. Defaults to `True`
- `MEMORY_CACHE_NUM_DATASETS`: Number of datasets that are concurrently loaded into worker memory, with 0 being unlimited. Defaults to `0`
- `EXPORT_THRESHOLD`: The maximum size file to allow to be exported. Defaults to `500` mb
- `USE_REDIS_CACHE`: Whether to use a redis cache for the app. Defaults to `False`
- `REDIS_HOST`: [Optional] The host of the redis cache. Defaults to `localhost`
- `REDIS_PORT`: [Optional] The port of the redis cache. Defaults to `6379`

## Building and Deploying Public Docker Image

First follow instructions above to build the docker image tagged `xreds:latest`. Then the`xreds:latest` image needs to be tagged and deployed to the relevant docker registry.

```bash
# Auth with ECR
aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws/m2c5k9c1

# Tag the image
docker tag xreds:latest public.ecr.aws/m2c5k9c1/nextgen-dmac/xreds:latest

# Push the image
docker push public.ecr.aws/m2c5k9c1/nextgen-dmac/xreds:latest
```

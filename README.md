# xreds

XArray Environmental Data Services

## Running Locally

### Installing dependencies

**macOS**

```
brew install netcdf4 h5 geos proj eccodes
```

Then install with `pip` in a `virtualenv`:

```bash
virtualenv -p python3 env/ 
source env/bin/activate
pip install -r requirements.txt
```

### Running the server

Build the react app

```bash
cd viewer/
yarn install 
yarn build
```

Run the following in the activated `virtualenv`:

```bash 
datasets_mapping_file=./test.json python app.py
```

Where `datasets_mapping_file` is the path to the dataset key value store specified in the previous section. You can now navigate to http://localhost:8090/docs to see the supported operations 

## Running With Docker

### Running with `docker-compose`

```bash
docker-compose up -d
```

### Building and Running manually 

The docker container for the app can be built with: 

```bash
docker build -t xreds:latest .
```

Once built, it requires a few things to be run: The 8090 port to be exposed, and a volume for the datasets to live in, and the environment variable pointing to the dateset json file.

```bash 
docker run -p 8090:8090 -e "datasets_mapping_file=/path/to/datasets.json" -v "/path/to/datasets:/opt/xreds/datasets" xreds:latest
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

Currently `zarr`, `netcdf`, and [`kerchunk`](https://github.com/fsspec/kerchunk) dataset types are supported. This information should be saved a file and specified when running.

## Deploying with Kubernetes

First follow instructions above to build the docker image tagged `xreds:latest`. Then the`xreds:latest` image needs to be tagged and deployed to the relevant docker registry. 

```bash
# Auth with ECR
aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws/m2c5k9c1

# Tag the image
docker tag xreds:latest public.ecr.aws/m2c5k9c1/nextgen-dmac/xreds:latest

# Push the image
docker push public.ecr.aws/m2c5k9c1/nextgen-dmac/xreds:latest
```

Once pushed, we can deploy it to the cluster with the following command:

```bash
kubectl apply -f deploy.yaml
```
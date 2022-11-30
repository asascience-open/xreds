# xreds

XArray Environmental Data Services

## Running Locally

### Installing dependencies

On `macOS`: 

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
npm run build
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

Datasets are specified in a key value manner, where the keys are the dataset ids and the values are the paths to the datasets: 

```json
{
    "ww3": "/path/to/noaa_wave_watch3.zarr/", 
    "gfs": "/path/to/gfs.nc"
}
```

Currently `zarr` and `netcdf4` datasets are supported. This information should be saved a file and specified when running
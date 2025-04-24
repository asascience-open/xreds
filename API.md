# XREDS API
Alongside the viewer (demo site provided at: https://nextgen-dev.ioos.us/xreds/), XREDS functions as a data API that serves up datasets for use in other products and services. The datasets have been pre-configured within XREDS itself, and combined with multiple caching and workload distribution strategies, XREDS provides a simple and fast way to interact with incredible amounts of data.

To see all of the available API endpoints that XREDS serves, [SwaggerUI](https://swagger.io/tools/swagger-ui/) provides simple documentation at `/docs` (demo site: https://nextgen-dev.ioos.us/xreds/docs). The following sections will break down the each of these endpoints.

1. [Datasets](#datasets)
2. [Subset](#subset)
3. [Export](#export)
4. [OpenDAP](#opendap)
5. [EDR](#edr)
6. [WMS](#wms)
7. [Miscellaneous](#miscellaneous)
   

## Datasets
*These are standard endpoints that give base-level access to the different datasets served through XREDS. In addition to the endpoints specified here, most other services that reference a particular dataset are prepended with the `/datasets/{0}/` syntax*

### **[GET]** `/datasets` (demo: https://nextgen-dev.ioos.us/xreds/datasets)

fetches the list of all available datasets served through XREDS

**Returns**
> JSON list of all datasets

### **[GET]** `/datasets/{0}/` (demo: https://nextgen-dev.ioos.us/xreds/datasets/cbofs/)

loads the XArray definition of the specified dataset in HTML format

**Parameters**

0 | **string** - id
> id of the dataset to fetch

**Returns**
> Interactive Webpage representing the XArray contents of the dataset

### **[GET]** `/datasets/{0}/dict` (demo: https://nextgen-dev.ioos.us/xreds/datasets/cbofs/dict)

fetches the XArray definition of the specified dataset in JSON format

**Parameters**

0 | **string** - id
> id of the dataset to fetch

**Returns**
> JSON dictionary of XArray contents of the dataset

### **[GET]** `/datasets/{0}/keys` (demo: https://nextgen-dev.ioos.us/xreds/datasets/cbofs/keys)

fetches the list of all available variables for the specified dataset

**Parameters**

0 | **string** - id
> id of the dataset to fetch

**Returns**
> JSON list of all dataset variables

### **[GET]** `/datasets/{0}/info` (demo: https://nextgen-dev.ioos.us/xreds/datasets/cbofs/info)

fetches the XPublish info for the specified dataset

**Parameters**

0 | **string** - id
> id of the dataset to fetch

**Returns**
> JSON dictionary of dataset info

### **[GET]** `/datasets/{0}/size/` (demo: https://nextgen-dev.ioos.us/xreds/datasets/cbofs/size/)

provides the size of the dataset in MB

**Parameters**

0 | **string** - id
> id of the dataset to fetch

**Returns**
> JSON response containing the size of the dataset

### **[GET]** `/datasets/{0}/zarr/` (demo: https://nextgen-dev.ioos.us/xreds/datasets/cbofs/zarr/)

provides the Zarr definition of the dataset, which can then be loaded using tools such as XArray's [`open_zarr`](https://docs.xarray.dev/en/stable/generated/xarray.open_zarr.html)

**Parameters**

0 | **string** - id
> id of the dataset to fetch

**Returns**
> Zarr definition of requested dataset

## Subset
*These endpoints allow for only a specified portion of a dataset to be accessed, which can speed up computationally complex functions by limiting the amount of data used in the function. All endpoints that reference a specific dataset (any endpoint that starts with `/datasets/{0}/` syntax) can be used with Subset, including endpoints from [Datasets](#datasets), [Export](#export), [OpenDAP](#opendap), [EDR](#edr), and [WMS](#wms)*

*Subset is commonly used with [Export](#export), as full datasets can be anywhere between gigabytes and terabytes in size, so subsetting allows for only the desired time range and/or geographic region of the dataset to be downloaded, greatly reducing the size of the file.*

### **[GET]** `/datasets/{0}/subset/{1}/` (demo: https://nextgen-dev.ioos.us/xreds/datasets/cbofs/subset/TIME(2025-04-24T17:35:00.000Z,2025-04-24T21:35:00.000Z)/)

provides a subset of the specified dataset using the subset_string, which can be used in any available dataset endpoint by replacing `/datasets/{0}` with `/datasets/{0}/subset/{1}/`

**Parameters**

0 | **string** - id
> id of the dataset to fetch

1 | **string** - subset_string
> string used to subset the dataset, which can be any of the following options, or multiple combined with `&` <br>
> - POLYGON((x1 y1, x2 y2, ..., xn yn))<br>
> - BBOX(minx, miny, maxx, maxy)<br>
> - TIME(start, end)

**Returns**
> the same type as the original request, which in this example is an interactive webpage showing the XArray representation of the dataset subset

## Export
*These endpoints give access to information on how to download a dataset, along with providing the actual download URL. These are usually used together with [Subset](#subset) in order to only download the minimum amount of data required (and to keep the file size under the value provided by `/export/threshold`)*

### **[GET]** `/export/formats` (demo: https://nextgen-dev.ioos.us/xreds/export/formats)

fetches the list of the available formats datasets can be downloaded in

**Returns**
> JSON dictionary of formats with descriptions for each

### **[GET]** `/export/threshold` (demo: https://nextgen-dev.ioos.us/xreds/export/threshold)

fetches the maximum size in MB of a dataset or subset of a dataset that can be downloaded

**Returns**
> JSON dictionary with the maximum download size in MB

### **[GET]** `/export/threshold` (demo: https://nextgen-dev.ioos.us/xreds/export/threshold)

fetches the maximum size in MB of a dataset or subset of a dataset that can be downloaded

**Returns**
> JSON dictionary with the maximum download size in MB

### **[GET]** `/datasets/{0}/export/{1}` (demo: [https://nextgen-dev.ioos.us/xreds/datasets/cbofs/subset/POLYGON((-75.77140353794853%2037.018067456340006,-75.14950773923584%2037.40207090933113,-75.68272377438912%2036.92919074110188,-75.77140353794853%2037.018067456340006))&TIME(2025-04-22T19:00:00.000Z,2025-04-25T19:00:00.000Z)/export/cbofs.nc](https://nextgen-dev.ioos.us/xreds/datasets/cbofs/subset/POLYGON((-75.77140353794853%2037.018067456340006,-75.14950773923584%2037.40207090933113,-75.68272377438912%2036.92919074110188,-75.77140353794853%2037.018067456340006))&TIME(2025-04-22T19:00:00.000Z,2025-04-25T19:00:00.000Z)/export/cbofs.nc))

downloads the requested dataset in the format specified in the request filename (note that the demo URL is showing using Export with [Subset](#subset) for size reasons)

**Parameters**

0 | **string** - id
> id of the dataset to download
 
1 | **string** - filename
> name of the dataset file once downloaded

**Returns**
> Dataset downloaded as a file in the format specified by the filename

## OpenDAP
*These endpoints give access to the datasets following the request and response specifications of [OpenDAP 2.0](https://www.earthdata.nasa.gov/s3fs-public/imported/ESE-RFC-004v1.1.pdf). The following OpenDAP serices are supported: `DDS`, `DAS`, `DODS`.* 

### **[GET]** `/datasets/{0}/opendap.dds` (demo: https://nextgen-dev.ioos.us/xreds/datasets/cbofs/opendap.dds)

fetches the requested dataset in OpenDAP Dataset Descriptor Structure (DDS) format

**Parameters**

0 | **string** - id
> id of the dataset to fetch

**Returns**
> DDS representation of the requested dataset

### **[GET]** `/datasets/{0}/opendap.das` (demo: https://nextgen-dev.ioos.us/xreds/datasets/cbofs/opendap.das)

fetches the requested dataset in OpenDAP Dataset Attribute Structure (DAS) format

**Parameters**

0 | **string** - id
> id of the dataset to fetch

**Returns**
> DAS representation of the requested dataset

### **[GET]** `/datasets/{0}/opendap.dods` (demo: [https://nextgen-dev.ioos.us/xreds/datasets/cbofs/subset/POLYGON((-75.77140353794853%2037.018067456340006,-75.14950773923584%2037.40207090933113,-75.68272377438912%2036.92919074110188,-75.77140353794853%2037.018067456340006))&TIME(2025-04-22T19:00:00.000Z,2025-04-25T19:00:00.000Z)/opendap.dods](https://nextgen-dev.ioos.us/xreds/datasets/cbofs/subset/POLYGON((-75.77140353794853%2037.018067456340006,-75.14950773923584%2037.40207090933113,-75.68272377438912%2036.92919074110188,-75.77140353794853%2037.018067456340006))&TIME(2025-04-22T19:00:00.000Z,2025-04-25T19:00:00.000Z)/opendap.dods))

downloads the requested dataset in OpenDAP Distributed Oceanographic Data Systems (DODS) format (note that the demo URL is showing using OpenDAP with [Subset](#subset) for size reasons)

**Parameters**

0 | **string** - id
> id of the dataset to download

**Returns**
> DODS representation of the requested dataset

## EDR
*These endpoints give access to the datasets following the request and response specifications of [OCR EDR API](https://ogcapi.ogc.org/edr/). More details on the specifics of the implementation can be found [here](https://github.com/xpublish-community/xpublish-edr?tab=readme-ov-file#ogc-edr-spec-compliance)* 

### **[GET]** `/edr/position/formats` (demo: https://nextgen-dev.ioos.us/xreds/edr/position/formats)

fetches the various supported formats for EDR position queries

**Returns**
> JSON dictionary of supported EDR formats

### **[GET]** `/edr/area/formats` (demo: https://nextgen-dev.ioos.us/xreds/edr/area/formats)

fetches the various supported formats for EDR area queries

**Returns**
> JSON dictionary of supported EDR formats

### **[GET]** `/datasets/{0}/edr/` (demo: https://nextgen-dev.ioos.us/xreds/datasets/rtofs_2d/edr/)

fetches the EDR collection metadata of the specified dataset

**Parameters**

0 | **string** - id
> id of the dataset to download

**Returns**
> JSON dictionary of supported EDR formats

### **[GET]** `/datasets/{0}/edr/position`

fetches the EDR data of the specified dataset
<br>
follows the [EDR Position Specifications](https://developer.ogc.org/api/edr/index.html#tag/Collection-data-queries/operation/GetDataForPoint)

### **[GET]** `/datasets/{0}/edr/area`

fetches the EDR data of the specified dataset
<br>
follows the [EDR Area Specifications](https://developer.ogc.org/api/edr/index.html#tag/Collection-data-queries/operation/GetDataForArea)


## WMS
*This endpoint gives access to the datasets following the request and response specifications of [OCR WMS API](https://www.ogc.org/standards/wms/). More details on the specifics of the implementation can be found [here](https://portal.ogc.org/files/?artifact_id=14416)* 

### **[GET]** `/datasets/{0}/wms`

fetches the WMS data of the specified dataset
<br>
follows the [WMS 1.3.0 Specifications](https://portal.ogc.org/files/?artifact_id=14416a)

## Miscellaneous

### **[GET]** `/plugins` (demo: https://nextgen-dev.ioos.us/xreds/plugins)

fetches the list of installed XPublish plugins

**Returns**
> JSON dictionary of installed plugins with version information

### **[GET]** `/versions` (demo: https://nextgen-dev.ioos.us/xreds/versions)

fetches the list of versions for important libraries and OS information

**Returns**
> JSON dictionary of library version information
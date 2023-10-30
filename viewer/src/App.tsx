import { ImageSource, MapMouseEvent, Popup } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { DatasetLayer, fetchDataset, fetchDatasetIds, fetchMetadata, fetchMinMax } from "./dataset";
import { bboxContainsPoint, createImageLayerParams } from "./tools";
import Map from "./components/map";
import MaterialIcon from "./components/material_icon";
import Spinner from "./components/spinner";

const colormaps: Array<{ id: string, name: string }> = [
  { id: 'rainbow', name: 'Rainbow' },
  { id: 'jet', name: 'Jet' },
  { id: 'turbo', name: 'Turbo' },
  { id: 'viridis', name: 'Viridis' },
  { id: 'plasma', name: 'Plasma' },
  { id: 'inferno', name: 'Inferno' },
  { id: 'magma', name: 'Magma' },
  { id: 'Greys', name: 'Greys' },
  { id: 'Blues', name: 'Blues' },
  { id: 'Reds', name: 'Reds' },
  { id: 'cool', name: 'Cool' },
  { id: 'hot', name: 'Hot' },
]

const TILE_SIZE = 512;


function App() {
  const map = useRef<maplibregl.Map | null>(null);
  const lastClickPos = useRef<[number, number] | null>(null);
  
  const [datasets, setDatasets] = useState<{ [k: string]: { [j: string]: string } }>({});
  const [datasetIds, setDatasetIds] = useState<string[]>([]);
  const [datasetMetadata, setDatasetMetadata] = useState<{ [k: string]: { [j: string]: DatasetLayer } }>({});
  
  const [selectedLayer, setSelectedLayer] = useState<{ dataset: string, variable: string } | undefined>(undefined);
  const [selectedLayerMinMax, setSelectedLayerMinMax] = useState<{ min: number, max: number } | undefined>(undefined);
  const [layerOptions, setLayerOptions] = useState<{ date?: string, elevation?: string, colorscaleMin?: number, colorscaleMax?: number, colormap?: string }>({});
  const [layerTiling, setLayerTiling] = useState<boolean>(true);
  const [currentPopupData, setCurrentPopupData] = useState<any>(undefined);

  const [showSidebar, setSidebarShowing] = useState(true);
  const [showColormapPicker, setColorMapPickerShowing] = useState(false);
  const [datasetsCollapsed, setDatasetsCollapsed] = useState<{ [k: string]: boolean }>({});
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [layerLoading, setLayerLoading] = useState(false);

  useEffect(() => {
    setLoadingDatasets(true);
    fetchDatasetIds()
      .then(datasetIds => {
        setDatasetIds(datasetIds);
        setDatasetsCollapsed(datasetIds.reduce((obj: { [k: string]: boolean }, id: string) => {
          obj[id] = true;
          return obj;
        }, {}));
        
        setLoadingDatasets(false);
      })
      .catch(e => {
        console.error(e);
        setLoadingDatasets(false);
      });
  }, []);

  useEffect(() => {
    datasetIds.forEach(async datasetId => {
      const dataset = await fetchDataset(datasetId);
      setDatasets(d => ({ ...d, [datasetId]: dataset }));
    });
  }, [datasetIds]);

  useEffect(() => {
    if (!selectedLayer) {
      return;
    }

    setLoadingMetadata(true);
    if (datasetMetadata[selectedLayer.dataset]?.[selectedLayer.variable]) {
      const metadata = datasetMetadata[selectedLayer.dataset][selectedLayer.variable];
      fetchMinMax(selectedLayer.dataset, selectedLayer.variable, layerOptions.date ?? metadata.defaultTime, layerOptions.elevation ?? metadata.defaultElevation?.toString())
        .then(minmax => {
          setLoadingMetadata(false);
          setSelectedLayerMinMax(minmax);
        })
        .catch(err => {
          console.error(err);
          
          setLoadingMetadata(false);
          setSelectedLayerMinMax(undefined);
        });
    }
    else {
      fetchMetadata(selectedLayer.dataset, selectedLayer.variable)
        .then(metadata => {          
          fetchMinMax(selectedLayer.dataset, selectedLayer.variable, layerOptions.date ?? metadata.defaultTime, layerOptions.elevation ?? metadata.defaultElevation?.toString())
            .then(minmax => {
              setLoadingMetadata(false);
              setSelectedLayerMinMax(minmax);
            });

          setDatasetMetadata(datasetMetadata => ({
            ...datasetMetadata,
            [selectedLayer.dataset]: {
              ...(datasetMetadata[selectedLayer.dataset] ?? {}),
              [selectedLayer.variable]: metadata
            }
          }));
        })
        .catch(err => {
          console.error(err);
          
          setLoadingMetadata(false);
          setSelectedLayerMinMax(undefined);
        });
    }
    
    return () => {
      setLoadingMetadata(false);
      setSelectedLayerMinMax(undefined);
    };
  }, [selectedLayer, layerOptions.date, layerOptions.elevation]);

  useEffect(() => {
    if (!map.current || !selectedLayer || !datasetMetadata[selectedLayer.dataset]?.[selectedLayer.variable] || !selectedLayerMinMax) {
      return;
    }

    const sourceId = `xreds-${selectedLayer.dataset}-${selectedLayer.variable}`;

    console.log(`Adding layer: ${sourceId}`)
    
    let urlOptions: string[] = [];
    if ((layerOptions.colorscaleMin ?? selectedLayerMinMax.min) !== undefined && (layerOptions.colorscaleMax ?? selectedLayerMinMax.max) !== undefined) {
      urlOptions.push(`&colorscalerange=${layerOptions.colorscaleMin ?? selectedLayerMinMax.min},${layerOptions.colorscaleMax ?? selectedLayerMinMax.max}`);
    }
    if ((layerOptions.date ?? datasetMetadata[selectedLayer.dataset][selectedLayer.variable].defaultTime) !== undefined) {
      urlOptions.push(`&time=${layerOptions.date ?? datasetMetadata[selectedLayer.dataset][selectedLayer.variable].defaultTime}`);
    }
    if ((layerOptions.elevation ?? datasetMetadata[selectedLayer.dataset][selectedLayer.variable].defaultElevation) !== undefined) {
      urlOptions.push(`&elevation=${layerOptions.elevation ?? datasetMetadata[selectedLayer.dataset][selectedLayer.variable].defaultElevation}`);
    }
    
    let url = `/datasets/${selectedLayer.dataset}/wms/?service=WMS&version=1.3.0&request=GetMap&layers=${selectedLayer.variable}&crs=EPSG:3857&styles=raster/${layerOptions.colormap ?? 'default'}`;
    if (layerTiling) {
      url += `&width=${TILE_SIZE}&height=${TILE_SIZE}&bbox={bbox-epsg-3857}`;
      urlOptions.forEach(o => url += o);

      map.current.addSource(sourceId, {
        type: 'raster',
        tiles: [url],
        tileSize: TILE_SIZE,
        bounds: datasetMetadata[selectedLayer.dataset][selectedLayer.variable].bbox,
      });
    }
    else {
      const imgParams = createImageLayerParams(map.current);
      if (!imgParams) {
        return;
      }
      
      url += `&width=${imgParams.width}&height=${imgParams.height}&bbox=${[...imgParams.mercator].join(',')}`;
      urlOptions.forEach(o => url += o);
      map.current.addSource(sourceId, {
        type: 'image',
        url: url,
        coordinates: imgParams.coordinates as any,
      });      
    }
    
    map.current.addLayer({
      id: sourceId,
      type: 'raster',
      source: sourceId,
      paint: {
        "raster-opacity": 0.75,
        ...(!layerTiling && { "raster-fade-duration": 0 })
      }
    });

    setLayerLoading(true);

    const onIdle = () => setLayerLoading(false);

    const onClick = async (e: MapMouseEvent) => {
      if (!bboxContainsPoint(datasetMetadata[selectedLayer.dataset][selectedLayer.variable].bbox, e.lngLat)) {
        setCurrentPopupData(undefined);
        return;
      }
      
      setCurrentPopupData({ data: undefined, loading: true, lngLat: e.lngLat });
      lastClickPos.current = [e.lngLat.lng, e.lngLat.lat];
      
      try {
        const bbox = `&bbox=${e.lngLat.lng - 0.1},${e.lngLat.lat - 0.1},${e.lngLat.lng + 0.1},${e.lngLat.lat + 0.1}`;
        const time = ((layerOptions.date ?? datasetMetadata[selectedLayer.dataset][selectedLayer.variable].defaultTime) !== undefined)
            ? `&time=${layerOptions.date ?? datasetMetadata[selectedLayer.dataset][selectedLayer.variable].defaultTime}`
            : "";
        
        const elevation = ((layerOptions.elevation ?? datasetMetadata[selectedLayer.dataset][selectedLayer.variable].defaultElevation) !== undefined)
            ? `&elevation=${layerOptions.elevation ?? datasetMetadata[selectedLayer.dataset][selectedLayer.variable].defaultElevation}`
            : "";        
        
        const response = await fetch(`/datasets/${selectedLayer.dataset}/wms/?service=WMS&REQUEST=GetFeatureInfo&LAYERS=${selectedLayer.variable}&VERSION=1.3.0&EXCEPTIONS=application%2Fvnd.ogc.se_xml&SRS=EPSG%3A4326&QUERY_LAYERS=${selectedLayer.variable}&INFO_FORMAT=text%2Fjson&WIDTH=101&HEIGHT=101&X=50&Y=50${bbox}${time}${elevation}`);
        const data = await response.json();

        if (lastClickPos.current && lastClickPos.current[0] === e.lngLat.lng && lastClickPos.current[1] === e.lngLat.lat) {
          setCurrentPopupData({ data: data, loading: false, lngLat: e.lngLat });
        }
      }
      catch (e) {
        console.error(e);
        
        setCurrentPopupData(undefined);
        lastClickPos.current = null;
      }
    }

    const onMove = () => {
      const currentSource = map.current?.getSource(sourceId) as (ImageSource | undefined);
      if (!map.current || !currentSource) {
        return;
      }

      const imgParams = createImageLayerParams(map.current);
      if (!imgParams) {
        return;
      }

      url += `&width=${imgParams.width}&height=${imgParams.height}&bbox=${[...imgParams.mercator].join(',')}`;
      urlOptions.forEach(o => url += o);

      currentSource.updateImage({
        url: url,
        coordinates: imgParams.coordinates as any
      })
    }

    map.current.on('idle', onIdle);
    map.current.on('click', onClick);
    if (!layerTiling) {
      map.current.on('moveend', onMove)
    }

    return () => {
      console.log(`Removing layer: ${sourceId}`);
      setCurrentPopupData(undefined);
      setLayerLoading(false);
      map.current?.off('click', onClick);
      map.current?.off('idle', onIdle);
      map.current?.off('moveend', onMove);
      map.current?.removeLayer(sourceId);
      map.current?.removeSource(sourceId);
    }
  }, [datasetMetadata, selectedLayerMinMax, layerTiling, layerOptions.colorscaleMin, layerOptions.colorscaleMax, layerOptions.colormap]);

  useEffect(() => {
    if (!map.current || !currentPopupData ||!selectedLayer || !datasetMetadata[selectedLayer.dataset]?.[selectedLayer.variable]) {
      return;
    }

    let popup: Popup;
    try {
      popup = new Popup({ closeOnClick: false })
        .setLngLat(currentPopupData.lngLat)
        .setHTML(`
          <div class="flex flex-col p-1 rounded-md overflow-hidden">
            <span class="font-bold">${selectedLayer.dataset} - ${selectedLayer.variable}</span>
            ${currentPopupData.loading
              ? `
                <div class="flex flex-row flex-grow justify-center items-center">
                  <div class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" role="status">
                    <span class="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">
                      Loading...
                    </span>
                  </div>              
                </div>
              `
              : `
                <span>Latitude: ${currentPopupData.lngLat.lat.toFixed(5)}°</span>
                <span>Longitude: ${currentPopupData.lngLat.lng.toFixed(5)}°</span>
                <span>Date: ${currentPopupData.data.domain.axes.t ? currentPopupData.data.domain.axes.t.values : 'N/A'}</span>
                <span>Value: ${currentPopupData.data.ranges[selectedLayer.variable].values[0]} ${datasetMetadata[selectedLayer.dataset][selectedLayer.variable].units}</span>
              `
            }
          </div>
        `)
        .addTo(map.current);
    }
    catch (e) {
      console.error(e);

      popup = new Popup({ closeOnClick: false })
        .setLngLat(currentPopupData.lngLat)
        .setHTML(`
          <div class="flex flex-col p-1 rounded-md overflow-hidden">
            <span class="font-bold">${selectedLayer.dataset} - ${selectedLayer.variable}</span>
              <span class="text-center">ERROR</span>
          </div>
        `)
        .addTo(map.current);
    }

    return () => { popup.remove() };
  }, [currentPopupData]);

  const selectedLayerMetadata = (selectedLayer) ? datasetMetadata[selectedLayer.dataset]?.[selectedLayer.variable] : undefined;
  
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <nav className="w-full h-8 p-2 flex flex-row items-center content-center justify-between">
        <div className="flex flex-row items-start content-center">
          <MaterialIcon className="pr-4 self-center align-middle transition-all hover:text-blue-600" name={showSidebar ? 'close' : 'menu'} onClick={() => setSidebarShowing(!showSidebar)} />
          <span className="text-xl font-extrabold">xreds viewer</span>
        </div>
        <div className="flex flex-row items-start content-center">
          <a className="text-xl font-extrabold hover:text-blue-600" href={`/docs`}>api</a>
          {/* <MaterialIcon className="px-4 self-center align-middle transition-all hover:text-blue-600" name='settings' title='Configure' onClick={() => { }} /> */}
        </div>
      </nav>
      <main className="flex flex-row flex-1">
        <aside className={`absolute top-8 left-0 bottom-0 z-10 shadow-xl flex bg-white flex-col transition-all overflow-y-auto ${showSidebar ? 'w-full px-4 py-2' : 'w-0 px-0 py-0'} ${showSidebar ? 'md:w-1/3' : 'md:w-0'}`}>
          {loadingDatasets ? (
            <div className="flex-1 flex justify-center items-center">
              <Spinner />
            </div>
          ) : (
            <>
              <div className={"flex flex-row w-full justify-between items-center mb-4 px-1"}>
                <h1 className="text-xl font-bold">Datasets</h1>
                <div className={"flex flex-row items-center"}>
                  <h5 className={"pr-2"}>Layer Tiling</h5>
                  <input 
                      type={"checkbox"} 
                      checked={layerTiling}
                      onChange={(e) => setLayerTiling(e.target.checked)} 
                  />
                </div>
              </div>
              {datasetIds.map(d => (
                <section key={d}>
                  <div className="flex flex-row justify-between items-center content-center">
                    <div 
                      className={"flex flex-row justify-start items-center cursor-pointer"}
                      onClick={() => setDatasetsCollapsed(datasetsCollapsed => ({ ...datasetsCollapsed, [d]: !datasetsCollapsed[d] }))}
                    >
                      <MaterialIcon
                        className="pr-4 self-center align-middle transition-all hover:text-blue-600"
                        name={(!datasetsCollapsed[d]) ? 'remove_circle' : 'add_circle'}
                        title={(!datasetsCollapsed[d]) ? 'Hide Layers' : 'Show Layers'}
                      />

                      <h2 className="text-lg font-bold px-1">{d}</h2>
                    </div>
                    <div className="flex flex-row justify-between items-center content-center">
                      {datasets[d] === undefined &&
                        <div className="flex-1 flex justify-center items-center pr-[1.1rem]">
                          <Spinner />
                        </div>
                      }
                      <MaterialIcon className="pr-4 self-center align-middle transition-all hover:text-blue-600" name='integration_instructions' title='Launch in JupyterHub' onClick={() => { }} />
                      <MaterialIcon className="self-center align-middle transition-all hover:text-blue-600" name='dynamic_form' title='Access via OpenDAP' onClick={() => { }} />
                    </div>
                  </div>
                  {!datasetsCollapsed[d] && Object.keys(datasets[d] ?? {}).map(v => (
                    <div key={d + v} className={`p-1 flex flex-row justify-between items-center ${(selectedLayer?.dataset === d && selectedLayer.variable === v) ? 'bg-blue-100' : ''}`}>
                      <button
                        className={`hover:text-blue-600 text-start`}
                        onClick={() => {
                          if (selectedLayer) {
                            if (selectedLayer.dataset === d && selectedLayer.variable === v) {
                              setLayerOptions({});
                              setSelectedLayer(undefined);
                              return;
                            }
                          }

                          setLayerOptions({});
                          setSelectedLayer({
                            dataset: d,
                            variable: v,
                          });
                        }}>
                        {v} <span className="opacity-30">({datasets[d][v]})</span>
                      </button>
                      {(selectedLayer?.dataset === d && selectedLayer.variable === v && (layerLoading || loadingMetadata)) && (
                        <div className="flex items-center justify-center">
                          <Spinner />
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              ))}
            </>
          )}
        </aside>
        <div className="flex-1">
          <Map
            map={map}
            style='https://api.maptiler.com/maps/basic-v2-light/style.json?key=x5EfXrIDiRScOPCSUPJ6'
            // style='https://api.maptiler.com/maps/ocean/style.json?key=x5EfXrIDiRScOPCSUPJ6'
            viewport={{
              center: [-71, 41],
              zoom: 3,
            }} />
        </div>
        {selectedLayer &&
          <div className="absolute bottom-9 md:bottom-8 right-2 md:right-4 h-40 w-72 md:w-96 bg-white rounded-md bg-opacity-70 flex flex-col items-center content-center">
            <span className="text-center">{selectedLayer.dataset} - {selectedLayer.variable}</span>
            {(loadingMetadata || !selectedLayerMetadata) ? (
              <div className="flex-1 flex justify-center items-center">
                <Spinner />
              </div>
            ) : (
              <>
                <span className="font-bold text-center">{selectedLayerMetadata.title} ({selectedLayerMetadata.units})</span>
                <div className={"flex flex-col w-full justify-around items-center"}>
                  <div className={"flex flex-row items-center"}>
                    <span className={"pl-1"}>Date:</span>
                    <select
                        className="rounded-md p-1 mx-1"
                        value={layerOptions?.date ?? selectedLayerMetadata.defaultTime}
                        onChange={e => setLayerOptions({ ...layerOptions, date: e.target.value })}
                    >
                      {selectedLayerMetadata.times?.map((date: string) =>
                          <option key={date} value={date}>{date}</option>
                      )}
                    </select>
                  </div>
                  {selectedLayerMetadata.defaultElevation !== undefined &&
                      <div className={"flex flex-row items-center pt-1"}>
                        <span className={"pl-1"}>Elevation:</span>
                        <select
                            className="rounded-md p-1 mx-1"
                            value={layerOptions?.elevation ?? selectedLayerMetadata.defaultElevation.toString()}
                            onChange={e => setLayerOptions({ ...layerOptions, elevation: e.target.value })}
                        >
                          {selectedLayerMetadata.elevations?.map((e: number) =>
                              <option key={e.toString()} value={e.toString()}>{+e.toFixed(4)}</option>
                          )}
                        </select>
                      </div>
                  }
                </div>
                <div className="w-full flex-1 flex flex-row items-center content-center justify-around font-bold">
                  <input 
                    className="w-16 mx-1 text-center rounded-md p-1" 
                    defaultValue={layerOptions.colorscaleMin ?? selectedLayerMinMax?.min ?? 0} 
                    type={'number'}
                    onBlur={e => setLayerOptions({ ...layerOptions, colorscaleMin: e.currentTarget.valueAsNumber })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        setLayerOptions({ ...layerOptions, colorscaleMin: e.currentTarget.valueAsNumber })
                      }
                    }} 
                  />
                  <img className="rounded-md overflow-hidden w-64 md:w-80 mx-1 cursor-pointer" src={`/datasets/${selectedLayer.dataset}/wms/?service=WMS&request=GetLegendGraphic&format=image/png&width=200&height=20&layers=${selectedLayer.variable}&styles=raster/${layerOptions.colormap ?? 'default'}&colorscalerange=${layerOptions.colorscaleMin?.toFixed(5) ?? 0},${layerOptions.colorscaleMax?.toFixed(5) ?? 10}`} onClick={() => setColorMapPickerShowing(!showColormapPicker)} />
                  {showColormapPicker &&
                    <div className="absolute bottom-14 md:bottom-12 right-0 h-64 w-72 md:w-96 pt-2 px-2 bg-white overflow-y-scroll">
                      <menu>
                        {colormaps.map(cm => (
                          <li className="w-full h-2 mb-8">
                            <img className="rounded-md overflow-hidden w-full cursor-pointer" src={`/datasets/${selectedLayer.dataset}/wms/?service=WMS&request=GetLegendGraphic&format=image/png&width=200&height=20&layers=${selectedLayer.variable}&styles=raster/${cm.id}&colorscalerange=${layerOptions.colorscaleMin ?? 0},${layerOptions.colorscaleMax ?? 10}`} onClick={() => {
                              setLayerOptions({ ...layerOptions, colormap: cm.id })
                              setColorMapPickerShowing(!showColormapPicker)
                            }} />
                          </li>
                        ))}
                      </menu>
                    </div>
                  }
                  <input 
                    className="w-16 mx-1 text-center rounded-md p-1" 
                    defaultValue={layerOptions.colorscaleMax ?? selectedLayerMinMax?.max ?? 10} 
                    type={'number'}
                    onBlur={e => setLayerOptions({ ...layerOptions, colorscaleMax: e.currentTarget.valueAsNumber })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        setLayerOptions({ ...layerOptions, colorscaleMax: e.currentTarget.valueAsNumber })
                      }
                    }} 
                  />
                </div>
              </>
            )}
          </div>
        }
      </main>
    </div>
  )
}

export default App;

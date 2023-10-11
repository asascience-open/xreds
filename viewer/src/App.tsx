import { MapMouseEvent, Popup } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import Map from "./components/map";
import MaterialIcon from "./components/material_icon";
import Spinner from "./components/spinner";
import { DatasetLayer, fetchDataset, fetchDatasetIds, fetchMetadata, fetchMinMax } from "./dataset";

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
  const [showSidebar, setSidebarShowing] = useState(true);
  const [datasetIds, setDatasetIds] = useState<string[]>([]);
  const [datasetsCollapsed, setDatasetsCollapsed] = useState<{ [k: string]: boolean }>({});
  const [datasets, setDatasets] = useState<{ [k: string]: { [j: string]: string } }>({});
  const [datasetMetadata, setDatasetMetadata] = useState<{ [k: string]: { [j: string]: DatasetLayer } }>({});
  const [selectedLayer, setSelectedLayer] = useState<{ dataset: string, variable: string } | undefined>(undefined);
  const [selectedLayerMinMax, setSelectedLayerMinMax] = useState<{ min: number, max: number } | undefined>(undefined);
  const [layerOptions, setLayerOptions] = useState<{ date?: string, colorscaleMin?: number, colorscaleMax?: number, colormap?: string }>({});
  const [currentPopupData, setCurrentPopupData] = useState<any>(undefined);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [layerLoading, setLayerLoading] = useState(false);

  const [showColormapPicker, setColorMapPickerShowing] = useState(false);

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
      fetchMinMax(selectedLayer.dataset, selectedLayer.variable, layerOptions.date ?? datasetMetadata[selectedLayer.dataset][selectedLayer.variable].defaultTime)
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
          fetchMinMax(selectedLayer.dataset, selectedLayer.variable, layerOptions.date ?? metadata.defaultTime)
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
  }, [selectedLayer, layerOptions.date]);

  useEffect(() => {
    if (!map.current || !selectedLayer || !datasetMetadata[selectedLayer.dataset]?.[selectedLayer.variable] || !selectedLayerMinMax) {
      return;
    }

    const sourceId = `xreds-${selectedLayer.dataset}-${selectedLayer.variable}`;

    console.log(`Adding layer: ${sourceId}`)

    map.current.addSource(sourceId, {
      type: 'raster',
      tiles: [
        `/datasets/${selectedLayer.dataset}/wms/?service=WMS&version=1.3.0&request=GetMap&layers=${selectedLayer.variable}&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=${TILE_SIZE}&height=${TILE_SIZE}&styles=raster/${layerOptions.colormap ?? 'default'}&colorscalerange=${layerOptions.colorscaleMin ?? selectedLayerMinMax.min},${layerOptions.colorscaleMax ?? selectedLayerMinMax.max}&time=${layerOptions.date ?? datasetMetadata[selectedLayer.dataset][selectedLayer.variable].defaultTime}`
      ],
      tileSize: TILE_SIZE,
      bounds: datasetMetadata[selectedLayer.dataset][selectedLayer.variable].bbox,
    });

    map.current.addLayer({
      id: sourceId,
      type: 'raster',
      source: sourceId,
      paint: {
        "raster-opacity": 0.75
      }
    });

    setLayerLoading(true);

    const onClick = async (e: MapMouseEvent) => {
      const response = await fetch(`/datasets/${selectedLayer.dataset}/wms/?service=WMS&REQUEST=GetFeatureInfo&LAYERS=${selectedLayer.variable}&VERSION=1.3.0&EXCEPTIONS=application%2Fvnd.ogc.se_xml&SRS=EPSG%3A4326&QUERY_LAYERS=${selectedLayer.variable}&INFO_FORMAT=text%2Fjson&WIDTH=101&HEIGHT=101&X=50&Y=50&BBOX=${e.lngLat.lng - 0.1},${e.lngLat.lat - 0.1},${e.lngLat.lng + 0.1},${e.lngLat.lat + 0.1}&time=${layerOptions.date ?? datasetMetadata[selectedLayer.dataset][selectedLayer.variable].defaultTime}`);

      const featureData = await response.json();
      setCurrentPopupData({ data: featureData, lngLat: e.lngLat });
    }

    const onIdle = () => setLayerLoading(false);

    map.current.on('click', onClick);
    map.current.on('idle', onIdle)

    return () => {
      console.log(`Removing layer: ${sourceId}`);
      setCurrentPopupData(undefined);
      setLayerLoading(false);
      map.current?.off('click', onClick);
      map.current?.off('idle', onIdle);
      map.current?.removeLayer(sourceId);
      map.current?.removeSource(sourceId);
    }
  }, [datasetMetadata, selectedLayerMinMax, layerOptions.colorscaleMin, layerOptions.colorscaleMax, layerOptions.colormap]);

  useEffect(() => {
    if (!map.current || !currentPopupData || !selectedLayer || !datasetMetadata[selectedLayer.dataset]?.[selectedLayer.variable]) {
      return;
    }

    const popup = new Popup({ closeOnClick: false })
      .setLngLat(currentPopupData.lngLat)
      .setHTML(`
        <div class="flex flex-col p-1 rounded-md overflow-hidden">
          <span class="font-bold">${selectedLayer.dataset} - ${selectedLayer.variable}</span>
          <span>Latitude: ${currentPopupData.lngLat.lat.toFixed(5)}°</span>
          <span>Longitude: ${currentPopupData.lngLat.lng.toFixed(5)}°</span>
          <span>Date: ${currentPopupData.data.domain.axes.t ? currentPopupData.data.domain.axes.t.values : 'N/A'}</span>
          <span>Value: ${currentPopupData.data.ranges[selectedLayer.variable].values[0]} ${datasetMetadata[selectedLayer.dataset][selectedLayer.variable].units}</span>
        </div>
      `)
      .addTo(map.current);

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
              <h1 className="text-xl font-bold mb-4 px-1">Datasets</h1>
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
                              setSelectedLayer(undefined);
                              return;
                            }
                          }

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
                <label>
                  Date:
                  <select
                    className="rounded-md p-1 mx-1"
                    value={layerOptions?.date ?? selectedLayerMetadata.defaultTime}
                    onChange={e => setLayerOptions({ ...layerOptions, date: e.target.value })}
                  >
                    {selectedLayerMetadata.times?.map((date: string) =>
                      <option key={date} value={date}>{date}</option>
                    )}
                  </select>
                </label>
                <div className=" w-full flex-1 flex flex-row items-center content-center justify-around font-bold">
                  <input className="w-16 mx-1 text-center" defaultValue={layerOptions.colorscaleMin ?? selectedLayerMinMax?.min ?? 0} type={'number'} onKeyDown={e => {
                    if (e.key === 'Enter') {
                      setLayerOptions({ ...layerOptions, colorscaleMin: e.currentTarget.valueAsNumber })
                    }
                  }} />
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
                  <input className="w-16 mx-1 text-center" defaultValue={layerOptions.colorscaleMax ?? selectedLayerMinMax?.max ?? 10} type={'number'} onKeyDown={e => {
                    if (e.key === 'Enter') {
                      setLayerOptions({ ...layerOptions, colorscaleMax: e.currentTarget.valueAsNumber })
                    }
                  }} />
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

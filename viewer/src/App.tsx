import { useEffect, useRef, useState } from "react";
import Map from "./components/map";
import MaterialIcon from "./components/material_icon";
import { xmlToJSON } from "./tools";

async function fetchDatasetIds(): Promise<string[]> {
  const response = await fetch('http://localhost:8090/datasets');
  const datasets = await response.json();
  return datasets;
}

async function fetchDatasetVariables(dataset: string): Promise<any> {
  const response = await fetch(`http://localhost:8090/datasets/${dataset}/dict`);
  const info = await response.json();
  return info.data_vars;
}

async function fetchDatasetCapabilities(dataset: string): Promise<any> {
  const response = await fetch(`http://localhost:8090/datasets/${dataset}/wms/?service=WMS&request=GetCapabilities&version=1.3.0`);
  const rawCapabilities = await response.text();
  const capabilities = xmlToJSON(rawCapabilities).WMS_Capabilities.Capability.Layer.Layer;
  return capabilities;
}

async function fetchDatasets(): Promise<{ [k: string]: any }> {
  const datasetIds = await fetchDatasetIds();
  const promises = datasetIds.map(did => fetchDatasetCapabilities(did));
  const datasets = await Promise.all(promises);

  const datasetsRecord: { [k: string]: any } = {};
  datasets.forEach((d, i) => {
    const datasetLayers: { [k: string]: any } = {}
    d.forEach((l: any) => {
      datasetLayers[l.Name] = l;
    });
    datasetsRecord[datasetIds[i]] = datasetLayers;
  });

  console.log(datasetsRecord);

  return datasetsRecord;
}

function App() {
  const map = useRef<maplibregl.Map | null>(null);
  const [showSidebar, setSidebarShowing] = useState(false);
  const [datasets, setDatasets] = useState<{ [k: string]: any }>({});
  const [selectedLayer, setSelectedLayer] = useState<{ dataset: string, variable: string } | undefined>(undefined);

  useEffect(() => {
    fetchDatasets().then(datasets => setDatasets(datasets));
  }, []);

  useEffect(() => {
    if (!map.current || !selectedLayer) {
      return;
    }

    const sourceId = `xreds-${selectedLayer.dataset}-${selectedLayer.variable}`;

    console.log(`Adding layer: ${sourceId}`)
    map.current.addSource(sourceId, {
      type: 'raster',
      tiles: [
        `http://localhost:8090/datasets/${selectedLayer.dataset}/wms/?service=WMS&version=1.3.0&request=GetMap&layers=${selectedLayer.variable}&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512&styles=raster/rainbow&colorscalerange=0,5`
      ],
      tileSize: 512,
    });

    map.current.addLayer({
      id: sourceId, 
      type: 'raster', 
      source: sourceId, 
      paint: {}
    });

    return () => {
      console.log(`Removing layer: ${sourceId}`);
      map.current?.removeLayer(sourceId); 
      map.current?.removeSource(sourceId);
    }
  }, [selectedLayer]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <nav className="w-full h-8 p-2 flex flex-row items-center content-center">
        <MaterialIcon className="pr-4 self-center align-middle transition-all" name={showSidebar ? 'close' : 'menu'} onClick={() => setSidebarShowing(!showSidebar)} />
        <span className="text-xl font-extrabold">xreds</span>
      </nav>
      <main className="flex flex-row flex-1">
        <aside className={`flex flex-col h-full transition-all overflow-y-auto ${showSidebar ? 'w-full px-4 py-2' : 'w-0 px-0 py-0'} ${showSidebar ? 'md:w-1/3' : 'md:w-0'}`}>
          <h1 className="text-xl font-bold mb-4 px-1">Datasets</h1>
          {Object.keys(datasets).map(d => (
            <section key={d}>
              <h2 className="text-lg font-bold px-1">{d}</h2>
              {Object.keys(datasets[d]).map(v => (
                <div key={d + v} className={`p-1 flex flex-row ${(selectedLayer?.dataset === d && selectedLayer.variable === v) ? 'bg-blue-100' : ''}`}>
                  <button
                    className={`hover:text-blue-600 `}
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
                    {v} <span className="opacity-30">({datasets[d][v].Title})</span>
                  </button>
                </div>
              ))}
            </section>
          ))}
        </aside>
        <div className="flex-1">
          <Map
            map={map}
            style='https://api.maptiler.com/maps/ocean/style.json?key=x5EfXrIDiRScOPCSUPJ6'
            viewport={{
              center: [-71, 41],
              zoom: 3,
            }} />
        </div>
      </main>
    </div>
  )
}

export default App;

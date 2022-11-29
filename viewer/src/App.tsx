import { useEffect, useRef, useState } from "react";
import Map from "./components/map";
import MaterialIcon from "./components/material_icon";

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

async function fetchDatasets(): Promise<{ [k: string]: any }> {
  const datasetIds = await fetchDatasetIds();
  const promises = datasetIds.map(did => fetchDatasetVariables(did));
  const datasets = await Promise.all(promises);

  const datasetsRecord: { [k: string]: any } = {};
  datasets.forEach((d, i) => {
    const cleanedDataset: { [k: string]: any } = {};
    Object.keys(d)
      .filter(k => d[k].dims.includes('latitude') && d[k].dims.includes('longitude'))
      .forEach(k => {
        cleanedDataset[k] = d[k];
      });

    datasetsRecord[datasetIds[i]] = cleanedDataset;
  });

  return datasetsRecord;
}

function App() {
  const map = useRef<maplibregl.Map | null>(null);
  const [showSidebar, setSidebarShowing] = useState(false);
  const [datasets, setDatasets] = useState<{ [k: string]: any }>({});

  useEffect(() => {
    fetchDatasets().then(datasets => setDatasets(datasets));
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col">
      <nav className="w-full h-8 p-2 flex flex-row items-center content-center">
        <MaterialIcon className="pr-4 self-center align-middle transition-all" name={showSidebar ? 'close' : 'menu'} onClick={() => setSidebarShowing(!showSidebar)} />
        <span className="text-xl font-extrabold">xreds</span>
      </nav>
      <main className="flex flex-row flex-1">
        <aside className={`flex flex-col h-full transition-all overflow-y-auto ${showSidebar ? 'w-full px-4 py-2' : 'w-0 px-0 py-0'} ${showSidebar ? 'md:w-1/3' : 'md:w-0'}`}>
          <h1 className="text-xl font-bold mb-4">Datasets</h1>
          {Object.keys(datasets).map(d => (
            <section key={d}>
              <h2 className="text-lg font-bold">{d}</h2>
              {Object.keys(datasets[d]).map(v => (
                <div key={d + v} className="py-1 flex flex-row">
                  <button className="hover:text-blue-600">{v} <span className="opacity-30">({datasets[d][v].attrs.name})</span></button>
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

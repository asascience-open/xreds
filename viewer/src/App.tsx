import { useRef } from "react";
import Map from "./components/map";

function App() {
  const map = useRef<maplibregl.Map | null>(null);

  return (
    <div className="h-screen w-screen">
      <Map 
        map={map} 
        style='https://api.maptiler.com/maps/ocean/style.json?key=x5EfXrIDiRScOPCSUPJ6' 
        viewport={{
          center: [-71, 41],
          zoom: 3,
        }}/>
    </div>
  )
}

export default App;

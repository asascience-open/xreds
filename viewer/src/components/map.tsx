import maplibregl from "maplibre-gl";
import { MutableRefObject, useEffect, useRef } from "react";
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapProps {
    map: MutableRefObject<maplibregl.Map | null>,
    style: string,
    viewport: {
        center: [number, number], 
        zoom: number,
    }
}

const Map = ({map, style, viewport: {center, zoom}}: MapProps) => {
    const mapContainer = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (map.current) {
            return;
        }

        map.current = new maplibregl.Map({
            container: mapContainer.current!,
            style, 
            center, 
            zoom,
        });
    }, [map.current]);

    return (
        <div className="w-full h-full" ref={mapContainer} />
    )
}

export default Map;
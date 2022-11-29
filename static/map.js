mapboxgl.accessToken = 'pk.eyJ1IjoibWF0dC1pYW5udWNjaS1ycHMiLCJhIjoiY2wyaHh3cnZsMGk3YzNlcWg3bnFhcG1yZSJ9.L47O4NS5aFlWgCX0uUvgjA';

const map = new mapboxgl.Map({
    container: document.getElementById('map'),
    style: 'mapbox://styles/mapbox/light-v8',
    center: [-71, 41],
    zoom: 3,
});

map.on('load', () => {
    map.addSource('gfswave-wms', {
        type: 'raster',
        tileSize: 512, 
        minzoom: 0, 
        maxzoom: 15,
        tiles: [
            '/datasets/gfswave_global/wms/?service=WMS&version=1.3.0&request=GetMap&layers=swh&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512&styles=raster/rainbow&colorscalerange=0.5,10'
        ]
    });

    map.addLayer({
        id: 'gfswave-wms',
        source: 'gfswave-wms',
        type: 'raster',
        paint: {
            'raster-opacity': 0.75,
            'raster-fade-duration': 0,
        },
    });
});
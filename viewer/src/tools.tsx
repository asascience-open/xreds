import { parse, X2jOptions } from 'fast-xml-parser';
import { Map, LngLat, LngLatBounds } from "maplibre-gl";
import he from 'he';

const XML_PARSER_OPTIONS: Partial<X2jOptions> = {
    ignoreAttributes: false,
    parseAttributeValue: true,
    tagValueProcessor: a => he.decode(a),
    attrValueProcessor: a => he.decode(a, { isAttributeValue: true })
};

/**
 * Parses XML data to a javascript object
 * @param data 
 * @returns a javascript object representation of the xml data tree
 */
export function xmlToJSON(data: any): any {
    return parse(data, XML_PARSER_OPTIONS);
}

/**
 * Checks if the current point is contained within the layer bbox
 * @param bbox
 * @param point
 */
export function bboxContainsPoint(bbox: [number, number, number, number], point: LngLat): boolean {
    try {
        // point is within the longitude range?
        let inLon = point.lng > bbox[0] && point.lng < bbox[2];
        // point is within the latitude range?
        const inLat = point.lat < bbox[3] && point.lat > bbox[1];

        // For the global layers, the longitude range is -180, -180
        // a bit unexpected, not sure if there's some standard I'm missing
        // so for now, we'll say inLon is true if -180 && -180
        if (bbox[0] === -180 && bbox[2] === -180) {
            inLon = true;
        }
        
        return (inLon && inLat);
    } catch (e) {
        console.error(e);
        return false
    }
}

/**
 * checks if bbox1 contains bbox2
 * @param bbox1
 * @param bbox2
 */
export const bboxContainsGeoExtents = (bbox1: LngLatBounds, bbox2: LngLatBounds): boolean => {
    return (bbox1.contains(bbox2.getNorthEast()) && bbox1.contains(bbox2.getNorthWest())
        && bbox1.contains(bbox2.getSouthEast()) && bbox1.contains(bbox2.getSouthWest()));
}

/**
 * checks if the 2 bounding boxes overlap each other
 * @param bbox1
 * @param bbox2
 */
export const bboxOverlapsGeoExtents = (bbox1: LngLatBounds, bbox2: LngLatBounds): boolean => {
    const notLngOverlap = (bbox2.getWest() <= bbox1.getWest() && bbox2.getEast() <= bbox1.getWest())
        || (bbox2.getWest() >= bbox1.getEast() && bbox2.getEast() >= bbox1.getEast());
    const notLatOverlap = (bbox2.getSouth() <= bbox1.getSouth() && bbox2.getNorth() <= bbox1.getSouth())
        || (bbox2.getSouth() >= bbox1.getNorth() && bbox2.getNorth() >= bbox1.getNorth());

    return ((!notLngOverlap && !notLatOverlap) || bboxContainsGeoExtents(bbox1, bbox2) || bboxContainsGeoExtents(bbox2, bbox1));
}

/**
 * Converts a LngLat point into a EPSG 3857 point
 * @param point
 */
export function convertLngLatTo3857(point: number[]): number[] {
    const constant = 20037508.34 / 180;

    if (point[0] % 180 === 0) {
        point[0] = (point[0] > 0) ? point[0] - 0.000001 : point[0] + 0.000001;
    }
    if (point[1] % 90 === 0) {
        point[1] = (point[1] > 0) ? point[1] - 0.000001 : point[1] + 0.000001;
    }

    return [point[0] * constant, (Math.log(Math.tan((90 + point[1]) * Math.PI / 360)) / (Math.PI / 180)) * constant];
}

/**
 * Creates the bbox surrounding a catalogs geometrical extents and coordinates for showing on mapbox map
 * @param bbox
 * @param mapBounds
 */
export function getImageBounds3857(bbox: [number, number, number, number], mapBounds?: LngLatBounds): { mercator: number[][], coordinates: number[][] } {
    let minCoordinate: number[];
    let maxCoordinate: number[];

    if (mapBounds === undefined) {
        minCoordinate = [Math.max(bbox[0], -359.999999), Math.max(bbox[1], -85.051128)];
        maxCoordinate = [Math.min(bbox[2], 359.999999), Math.min(bbox[3], 85.051128)];
    }
    else {
        if (bbox === undefined || (Math.ceil(bbox[0]) === -180 && Math.ceil(bbox[1]) === -90 && Math.ceil(bbox[2]) === 180 && Math.ceil(bbox[3]) === 90)) {
            minCoordinate = [Math.max(mapBounds.getSouthWest().lng, -359.999999), Math.max(mapBounds.getSouthWest().lat, -85.051128)];
            maxCoordinate = [Math.min(mapBounds.getNorthEast().lng, 359.999999), Math.min(mapBounds.getNorthEast().lat, 85.051128)];
        } else {
            minCoordinate = [Math.max(mapBounds.getSouthWest().lng, bbox[0]), Math.max(mapBounds.getSouthWest().lat, bbox[1])];
            maxCoordinate = [Math.min(mapBounds.getNorthEast().lng, bbox[2]), Math.min(mapBounds.getNorthEast().lat, bbox[3])];
        }
    }

    const mercator = [convertLngLatTo3857(minCoordinate), convertLngLatTo3857(maxCoordinate)];

    const coordinates = [
        [minCoordinate[0], maxCoordinate[1]],
        [maxCoordinate[0], maxCoordinate[1]],
        [maxCoordinate[0], minCoordinate[1]],
        [minCoordinate[0], minCoordinate[1]],
    ];

    return {
        mercator,
        coordinates,
    };
}

/**
 * creates the proper parameters for an single image getmap
 * @param map
 * @param bbox
 */
export function createImageLayerParams(map: Map, bbox?: [number, number, number, number] | undefined) {
    const mapBounds = map.getBounds();
    const mapCanvas = map.getCanvas();
    const mapPitch = map.getPitch();

    const mapBoundsHorizontal = Math.abs(mapBounds.getEast() - mapBounds.getWest()) * 0.1;
    const mapBoundsPosVertical = Math.abs(mapBounds.getNorth() - mapBounds.getSouth()) * 0.1;
    const mapBoundsNegVertical = Math.abs(mapBounds.getNorth() - mapBounds.getSouth()) * 0.1;

    const bufferWest = mapBounds.getWest() - mapBoundsHorizontal;
    const bufferEast = mapBounds.getEast() + mapBoundsHorizontal;

    const mapBoundsBuffer = new LngLatBounds([
        [(bufferWest < -180 && bufferEast > 180) ? -180 : bufferWest, Math.max(-85.051128, mapBounds.getSouth() - mapBoundsNegVertical)],
        [(bufferWest < -180 && bufferEast > 180) ? 180 : bufferEast, Math.min(85.051128, mapBounds.getNorth() + mapBoundsPosVertical)]
    ]);

    let bounds;
    if (bbox) {
        if (!bboxOverlapsGeoExtents(mapBounds, LngLatBounds.convert(bbox))) {
            return;
        }

        bounds = getImageBounds3857(bbox, mapBoundsBuffer);
    }
    else {
        bounds = getImageBounds3857([mapBoundsBuffer.getWest(), mapBoundsBuffer.getSouth(), mapBoundsBuffer.getEast(), mapBoundsBuffer.getNorth()]);
    }

    let pixelsPer3857 = (mapCanvas.width > mapCanvas.height)
        ? mapCanvas.width / Math.abs(convertLngLatTo3857([mapBounds.getWest(), mapBounds.getSouth()])[0] - convertLngLatTo3857([mapBounds.getEast(), mapBounds.getNorth()])[0])
        : mapCanvas.height / Math.abs(convertLngLatTo3857([mapBounds.getWest(), mapBounds.getSouth()])[1] - convertLngLatTo3857([mapBounds.getEast(), mapBounds.getNorth()])[1]);

    pixelsPer3857 *= Math.max((3 * (mapPitch / 90)), 1);
    let width = Math.round((Math.abs(bounds.mercator[1][0] - bounds.mercator[0][0]) * pixelsPer3857) / window.devicePixelRatio);
    let height = Math.round((Math.abs(bounds.mercator[1][1] - bounds.mercator[0][1]) * pixelsPer3857) / window.devicePixelRatio);
    if (width > 5000) {
        height = Math.round(height * (5000 / width));
        width = 5000;
    }
    else if (height > 5000) {
        width = Math.round(width * (5000 / height));
        height = 5000;
    }

    return {
        coordinates: bounds.coordinates,
        mercator: bounds.mercator,
        width: width,
        height: height
    }
}

/**
 * Spherical polygon area calculator — dependency-free.
 * Computes the area of a GeoJSON Polygon or MultiPolygon on a sphere
 * (Earth radius ≈ 6371 km) using the spherical excess formula.
 * Handles holes (inner rings subtract from outer ring area).
 */

const EARTH_RADIUS_KM = 6371;

function ringAreaKm2(coords: number[][]): number {
  if (coords.length < 4) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    total += Δλ * (2 + Math.sin(φ1) + Math.sin(φ2));
  }
  const area = Math.abs((total * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
  return area;
}

export function polygonAreaKm2(geometry: {
  type: string;
  coordinates: number[][][] | number[][][][];
}): number {
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates as number[][][];
    if (rings.length === 0) return 0;
    let area = ringAreaKm2(rings[0]);
    for (let i = 1; i < rings.length; i++) {
      area -= ringAreaKm2(rings[i]);
    }
    return Math.abs(area);
  }
  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates as number[][][][];
    let area = 0;
    for (const poly of polys) {
      if (poly.length === 0) continue;
      area += ringAreaKm2(poly[0]);
      for (let i = 1; i < poly.length; i++) {
        area -= ringAreaKm2(poly[i]);
      }
    }
    return Math.abs(area);
  }
  return 0;
}

export type GeoPolygon = { type: 'Polygon'; coordinates: number[][][] };
export type GeoMultiPolygon = { type: 'MultiPolygon'; coordinates: number[][][][] };
export type GeoGeometry = GeoPolygon | GeoMultiPolygon;

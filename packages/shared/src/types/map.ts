export interface TerritoryGeometry {
  id: string;
  name: string;
  nameZh: string;
  countryId: string;
  /** Center point in map-space units (projected from lon/lat) */
  center: [number, number];
  /** Convex polygon points in map-space units, ordered for fan triangulation */
  polygon: [number, number][];
  adjacentTerritoryIds: string[];
}

export interface WorldMapData {
  territories: TerritoryGeometry[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

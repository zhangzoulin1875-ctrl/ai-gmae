import { WWI_COUNTRIES } from './countries';
import type { TerritoryGeometry, WorldMapData } from '../types/map';

/**
 * Approximate historical (lon, lat) centroid for each nation.
 * This is a stylized world map for gameplay purposes, not a
 * geographically precise projection.
 */
export const GEO_CENTROIDS: Record<string, [number, number]> = {
  deu: [10, 51], aut: [15.5, 47.5], tur: [33, 39], bgr: [25, 42.7],
  gbr: [-2, 54], fra: [2, 46.5], rus: [40, 56], ita: [12.5, 42.8],
  usa: [-98, 39], jpn: [138, 36],
  srb: [21, 44], bel: [4.5, 50.7], rou: [25, 45.9], grc: [22, 39],
  mne: [19, 42.7], can: [-106, 56], aus: [134, -25], nzl: [174, -41],
  zaf: [24, -29], ind: [79, 22], prt: [-8, 39.5], chn: [104, 35],
  tha: [101, 15], bra: [-51, -10], cub: [-77, 21.5], hti: [-72.3, 18.9],
  lbr: [-9.4, 6.4], pan: [-80.8, 8.5], cri: [-84, 9.7], gtm: [-90.2, 15.8],
  hnd: [-86.5, 15.2], nic: [-85.2, 12.9], per: [-76, -9.2], ury: [-56, -32.5],
  sau: [40, 24], egy: [30, 27],
  esp: [-3.7, 40.3], nld: [5.3, 52.2], swe: [15, 60], nor: [8.5, 60.5],
  dnk: [9.5, 56], che: [8.2, 46.8], alb: [20, 41.2], irn: [53, 32],
  nej: [46, 24.5], eth: [39, 9], arg: [-64, -34], chl: [-71, -33],
  mex: [-102, 23], col: [-74, 4.5], ven: [-66, 8], bol: [-65, -17],
  pry: [-58, -23.4], afg: [66, 34],
};

const MAJOR_POWERS = new Set(['deu', 'aut', 'tur', 'bgr', 'gbr', 'fra', 'rus', 'ita', 'usa', 'jpn']);

const PROJECTION_SCALE = 6; // map-units per degree
const HEX_RADIUS = 5;
const CLUSTER_RADIUS = 11;
const ADJACENCY_THRESHOLD = 21; // map-units, cross-country border detection

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function project(lon: number, lat: number): [number, number] {
  return [lon * PROJECTION_SCALE, -lat * PROJECTION_SCALE];
}

function hexagon(cx: number, cy: number, radius: number, rotation: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = rotation + (i * Math.PI) / 3;
    pts.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return pts;
}

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Generates a full, stylized world map: every country gets 2-4
 * territories clustered around its historical centroid, hexagonal in
 * shape, with adjacency links both within a country and across
 * neighboring countries (based on proximity).
 */
export function generateWorldMap(): WorldMapData {
  const territories: TerritoryGeometry[] = [];

  for (const country of WWI_COUNTRIES) {
    const geo = GEO_CENTROIDS[country.id];
    if (!geo) continue;

    const [cx, cy] = project(geo[0], geo[1]);
    const count: number = MAJOR_POWERS.has(country.id) ? 4 : 2;
    const rng = mulberry32(hashStr(country.id));
    const baseRotation = rng() * Math.PI * 2;

    const centers: [number, number][] = [];
    if (count === 1) {
      centers.push([cx, cy]);
    } else {
      for (let i = 0; i < count; i++) {
        const angle = baseRotation + (i * (Math.PI * 2)) / count;
        centers.push([cx + CLUSTER_RADIUS * Math.cos(angle), cy + CLUSTER_RADIUS * Math.sin(angle)]);
      }
    }

    centers.forEach((center, i) => {
      const rotJitter = rng() * 0.5;
      const localAdjacent: string[] = [];
      // ring adjacency within the same country's cluster
      if (count > 1) {
        localAdjacent.push(`${country.id}-${((i - 1 + count) % count) + 1}`);
        localAdjacent.push(`${country.id}-${((i + 1) % count) + 1}`);
      }
      territories.push({
        id: `${country.id}-${i + 1}`,
        name: `${country.name} Sector ${i + 1}`,
        nameZh: `${country.nameZh} 第${i + 1}戰區`,
        countryId: country.id,
        center,
        polygon: hexagon(center[0], center[1], HEX_RADIUS, rotJitter),
        adjacentTerritoryIds: localAdjacent,
      });
    });
  }

  // Cross-country adjacency by proximity
  for (let i = 0; i < territories.length; i++) {
    for (let j = i + 1; j < territories.length; j++) {
      const a = territories[i];
      const b = territories[j];
      if (a.countryId === b.countryId) continue;
      if (dist(a.center, b.center) <= ADJACENCY_THRESHOLD) {
        if (!a.adjacentTerritoryIds.includes(b.id)) a.adjacentTerritoryIds.push(b.id);
        if (!b.adjacentTerritoryIds.includes(a.id)) b.adjacentTerritoryIds.push(a.id);
      }
    }
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const t of territories) {
    for (const [x, y] of t.polygon) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return { territories, bounds: { minX, maxX, minY, maxY } };
}

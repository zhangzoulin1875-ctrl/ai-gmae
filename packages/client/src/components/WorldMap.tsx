import { useEffect, useRef, useState, useMemo } from 'react';
import { getScenario } from '@wwi/shared';
import type { CountryDefinition } from '@wwi/shared';

/* eslint-disable @typescript-eslint/no-explicit-any */

const DEFAULT_GEOJSON_URL = '/maps/provinces-1914.geojson';

const OCEAN_COLOR = '#0a2340';
const UNCLAIMED_COLOR = '#6b6358'; // medium warm gray — clearly distinct from ocean
const BORDER_COLOR = '#0c1016';
const HOVER_BORDER_COLOR = '#e8d8b8';
const SELECTED_BORDER_COLOR = '#ffd166';

// MapLibre is loaded via CDN in index.html (window.maplibregl)
declare global {
  interface Window {
    maplibregl: any;
  }
}

interface WorldMapProps {
  countries: CountryDefinition[];
  selectedCountryId?: string | null;
  onSelectCountry?: (country: CountryDefinition | null) => void;
  onSelectProvince?: (provinceId: string, provinceName: string, country: CountryDefinition) => void;
  mapSelectMode?: 'target' | 'from';
  takenCountryIds?: string[]; // countries already taken — shown dimmed, not clickable
  scenarioId?: string; // scenario ID for map bounds + province overrides
}

// Darken a hex color by mixing with black at the given ratio
function dimColor(hex: string, ratio: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.round(r * (1 - ratio));
  const dg = Math.round(g * (1 - ratio));
  const db = Math.round(b * (1 - ratio));
  return `#${dr.toString(16).padStart(2,'0')}${dg.toString(16).padStart(2,'0')}${db.toString(16).padStart(2,'0')}`;
}

const WorldMap: React.FC<WorldMapProps> = ({ countries, selectedCountryId, onSelectCountry, onSelectProvince, mapSelectMode, takenCountryIds, scenarioId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const hoveredIdRef = useRef<string | number | null>(null);
  const countriesRef = useRef(countries);
  const onSelectRef = useRef(onSelectCountry);
  const takenRef = useRef<string[]>(takenCountryIds || []);
  takenRef.current = takenCountryIds || [];
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; color: string } | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  countriesRef.current = countries;
  onSelectRef.current = onSelectCountry;
  const onSelectProvinceRef = useRef(onSelectProvince);
  onSelectProvinceRef.current = onSelectProvince;

  // Compute map center/zoom from scenario bounds
  const scenario = scenarioId ? getScenario(scenarioId) : undefined;
  const mapBounds = scenario?.mapBounds;
  const mapCenter: [number, number] = mapBounds
    ? [(mapBounds[0][0] + mapBounds[1][0]) / 2, (mapBounds[0][1] + mapBounds[1][1]) / 2]
    : [10, 25];
  const mapZoom = mapBounds ? 2.5 : 1.2;
  const provinceOverrides = scenario?.provinceOverrides;
  const territoryMap = scenario?.territoryMap;
  const geojsonUrl = scenario?.geojsonUrl || DEFAULT_GEOJSON_URL;

  // Build MapLibre "match" expression: wwi country id -> hex color
  // Taken countries are dimmed (50% darker)
  const colorExpression = useMemo((): any => {
    const takenSet = new Set(takenCountryIds || []);
    const expr = ['match', ['get', 'wwi']];
    for (const c of countries) {
      // If taken, darken the color by mixing with black
      if (takenSet.has(c.id)) {
        expr.push(c.id, dimColor(c.color, 0.45));
      } else {
        expr.push(c.id, c.color);
      }
    }
    expr.push(UNCLAIMED_COLOR);
    return expr;
  }, [countries, takenCountryIds]);

  // ── Initialize map (once) ──────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    // Wait for CDN script to load
    const ml = (window as any).maplibregl;
    if (!ml) {
      setMapError('MapLibre GL 腳本載入中，請稍候再試。');
      return;
    }

    // Check WebGL support
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
      if (!gl) {
        setMapError('此瀏覽器不支援 WebGL，無法顯示地圖。');
        return;
      }
    } catch {
      setMapError('此瀏覽器不支援 WebGL，無法顯示地圖。');
      return;
    }

    let map: any;

    try {
      map = new ml.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': OCEAN_COLOR },
            },
          ],
        },
        center: mapCenter,
        zoom: mapZoom,
        minZoom: 0.5,
        maxZoom: 8,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        keyboard: false,
      });
    } catch (err) {
      console.error('[WorldMap] MapLibre constructor failed:', err);
      const e = err as Error;
      setMapError(`${e.name}: ${e.message}\n\n${e.stack || '(no stack)'}`);
      return;
    }

    // Capture error events from MapLibre itself
    map.on('error', (e: any) => {
      console.error('[WorldMap] MapLibre error event:', e);
      const detail = e?.error?.message || e?.message || JSON.stringify(e);
      setMapError(`MapLibre error: ${detail}`);
    });

    map.on('load', async () => {
      try {
        map.resize();
        map.jumpTo({ center: mapCenter, zoom: mapZoom });

        // Fetch the GeoJSON ourselves so we can synchronously apply scenario
        // province overrides BEFORE handing data to MapLibre. (MapLibre's
        // internal `_data` for a URL-based geojson source is only populated
        // asynchronously inside its worker — reading it right after
        // addSource() is a race condition and can be non-iterable.)
        const geojsonRes = await fetch(geojsonUrl, { cache: 'no-store' });
        const geojson = await geojsonRes.json();

        // Apply scenario territory mapping:
        // 1. territoryMap: ISO2 code → scenario country ID (e.g. 'AF' → 'gbr')
        // 2. provinceOverrides: feature ID → scenario country ID (e.g. city → warlord faction)
        // Province overrides take precedence over territoryMap.
        if (Array.isArray(geojson?.features)) {
          let tmapModified = 0;
          let povrModified = 0;
          for (const feat of geojson.features) {
            // First: apply territoryMap by ISO2 code
            if (territoryMap && feat.properties?.iso2) {
              const mapped = territoryMap[feat.properties.iso2];
              if (mapped) {
                feat.properties.wwi = mapped;
                tmapModified++;
              }
            }
            // Then: apply provinceOverrides by feature ID (overrides territoryMap)
            const featId = feat.properties?.id ?? feat.id;
            if (provinceOverrides && featId && provinceOverrides[featId]) {
              feat.properties.wwi = provinceOverrides[featId];
              povrModified++;
            }
          }
          if (tmapModified > 0) console.log(`[WorldMap] Applied territoryMap to ${tmapModified} features`);
          if (povrModified > 0) console.log(`[WorldMap] Applied ${povrModified} province overrides from scenario`);
        }

        // GeoJSON source — promoteId lets us use feature-state for hover
        map.addSource('provinces', {
          type: 'geojson',
          data: geojson,
          promoteId: 'id',
        });

        // 1) Province fills — colored by wwi, brightens on hover via feature-state
        map.addLayer({
          id: 'province-fill',
          type: 'fill',
          source: 'provinces',
          paint: {
            'fill-color': colorExpression,
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              1.0,
              0.85,
            ],
          },
        });

        // 2) Province borders — subtle dark lines
        map.addLayer({
          id: 'province-borders',
          type: 'line',
          source: 'provinces',
          paint: {
            'line-color': BORDER_COLOR,
            'line-width': 0.3,
            'line-opacity': 0.5,
          },
        });

        // 3) Hover border — only visible on the hovered province
        map.addLayer({
          id: 'hover-border',
          type: 'line',
          source: 'provinces',
          paint: {
            'line-color': HOVER_BORDER_COLOR,
            'line-width': 1.5,
            'line-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              1.0,
              0.0,
            ],
          },
        });

        // 4) Selected country border — gold outline, filtered by wwi
        map.addLayer({
          id: 'selected-border',
          type: 'line',
          source: 'provinces',
          paint: {
            'line-color': SELECTED_BORDER_COLOR,
            'line-width': 2,
            'line-opacity': 0.9,
          },
          filter: ['==', ['get', 'wwi'], '__none__'],
        });

        // ── Hover (registered after layers exist) ────────────────
        map.on('mousemove', 'province-fill', (e: any) => {
          const features = e.features;
          if (!features || features.length === 0) return;
          const feat = features[0];
          const newId = feat.id;

          if (hoveredIdRef.current !== null && hoveredIdRef.current !== newId) {
            map.setFeatureState(
              { source: 'provinces', id: hoveredIdRef.current },
              { hover: false }
            );
          }

          if (newId !== null && newId !== undefined) {
            map.setFeatureState(
              { source: 'provinces', id: newId },
              { hover: true }
            );
            hoveredIdRef.current = newId;
          }

          const wwi = feat.properties?.wwi;
          const country = wwi ? countriesRef.current.find((c) => c.id === wwi) : null;
          if (country) {
            const provName = feat.properties?.nameZh || feat.properties?.name || '';
            setTooltip({
              x: e.point.x,
              y: e.point.y,
              text: `${country.flagIcon} ${country.nameZh} · ${provName}`,
              color: country.color,
            });
            map.getCanvas().style.cursor = 'pointer';
          } else {
            setTooltip(null);
            map.getCanvas().style.cursor = 'default';
          }
        });

        map.on('mouseleave', 'province-fill', () => {
          if (hoveredIdRef.current !== null) {
            map.setFeatureState(
              { source: 'provinces', id: hoveredIdRef.current },
              { hover: false }
            );
            hoveredIdRef.current = null;
          }
          setTooltip(null);
          map.getCanvas().style.cursor = '';
        });

        // ── Click ──────────────────────────────────────────────
        map.on('click', 'province-fill', (e: any) => {
          const features = e.features;
          if (!features || features.length === 0) return;
          const props = features[0].properties;
          const wwi = props?.wwi;
          const provinceId = props?.id;
          const provinceName = props?.nameZh || props?.name || provinceId;
          const country = wwi ? countriesRef.current.find((c) => c.id === wwi) : null;
          if (country) {
            // Fire province-level callback if provided
            if (onSelectProvinceRef.current && provinceId) {
              onSelectProvinceRef.current(provinceId, provinceName, country);
            }
            // Also fire country-level callback for backward compatibility
            onSelectRef.current?.(country);
          }
        });

        setMapReady(true);
      } catch (err) {
        console.error('[WorldMap] Layer setup failed:', err);
        const e = err as Error;
        setMapError(`Layer setup: ${e.message}\n\n${e.stack || '(no stack)'}`);
      }
    });

    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      try {
        map.resize();
      } catch {
        // ignore
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      try {
        map.remove();
      } catch {
        // ignore
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update fill colors when countries change ──────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer('province-fill')) return;
    map.setPaintProperty('province-fill', 'fill-color', colorExpression);
  }, [colorExpression, mapReady]);

  // ── Re-apply territory mappings when scenario loads (after init) ──
  // The map init effect captures territoryMap/provinceOverrides from the
  // first render. If scenarioId wasn't available yet (e.g. game state still
  // loading), those values were undefined and no mappings were applied.
  // This effect re-applies them once the scenario becomes available.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getSource('provinces')) return;
    if (!territoryMap && !provinceOverrides) return;

    const source = map.getSource('provinces');
    if (!source || !source._data || !Array.isArray(source._data?.features)) return;

    let modified = 0;
    for (const feat of source._data.features) {
      if (territoryMap && feat.properties?.iso2) {
        const mapped = territoryMap[feat.properties.iso2];
        if (mapped && feat.properties.wwi !== mapped) {
          feat.properties.wwi = mapped;
          modified++;
        }
      }
      const featId = feat.properties?.id ?? feat.id;
      if (provinceOverrides && featId && provinceOverrides[featId]) {
        feat.properties.wwi = provinceOverrides[featId];
        modified++;
      }
    }

    if (modified > 0) {
      console.log(`[WorldMap] Re-applied territory mappings to ${modified} features`);
      source.setData(source._data);
      // Also re-apply color expression to be safe
      if (map.getLayer('province-fill')) {
        map.setPaintProperty('province-fill', 'fill-color', colorExpression);
      }
    }
  }, [territoryMap, provinceOverrides, mapReady, colorExpression]);

  // ── Update selected border filter ─────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer('selected-border')) return;
    map.setFilter('selected-border', [
      '==',
      ['get', 'wwi'],
      selectedCountryId || '__none__',
    ]);
  }, [selectedCountryId, mapReady]);

  const selectedCountry = selectedCountryId
    ? countries.find((c) => c.id === selectedCountryId)
    : null;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '600px',
        borderRadius: '6px',
        overflow: 'hidden',
        background: OCEAN_COLOR,
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Map Error Banner */}
      {mapError && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15,20,25,0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            textAlign: 'center',
            zIndex: 100,
          }}
        >
          <div style={{ color: '#ef4444', fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            地圖載入失敗
          </div>
          <pre
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.8rem',
              maxWidth: '90%',
              maxHeight: '200px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'rgba(0,0,0,0.5)',
              padding: '1rem',
              borderRadius: '4px',
            }}
          >
            {mapError}
          </pre>
        </div>
      )}

      {/* Selected Country Banner */}
      {selectedCountry && !mapError && (
        <div
          style={{
            position: 'absolute',
            top: '0.6rem',
            left: '0.6rem',
            background: 'rgba(10,14,20,0.88)',
            border: `1px solid ${SELECTED_BORDER_COLOR}`,
            borderRadius: '4px',
            padding: '0.4rem 0.8rem',
            fontSize: '0.85rem',
            color: '#fff',
            zIndex: 10,
          }}
        >
          已選取: {selectedCountry.flagIcon} {selectedCountry.nameZh}
          {mapSelectMode && (
            <span style={{ color: 'var(--accent-gold)', marginLeft: '0.5rem', fontSize: '0.75rem' }}>
              ({mapSelectMode === 'from' ? '點選設為出發地' : '點選設為目標'})
            </span>
          )}
        </div>
      )}

      {/* Tooltip */}
      {tooltip && !mapError && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x + 12,
            top: tooltip.y + 12,
            background: 'rgba(10,14,20,0.92)',
            border: `1px solid ${tooltip.color}`,
            borderRadius: '4px',
            padding: '0.4rem 0.7rem',
            fontSize: '0.8rem',
            color: '#fff',
            pointerEvents: 'none',
            zIndex: 50,
            whiteSpace: 'nowrap',
          }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Hint */}
      {!mapError && (
        <div
          style={{
            position: 'absolute',
            bottom: '0.5rem',
            right: '0.5rem',
            fontSize: '0.75rem',
            color: 'rgba(255,255,255,0.6)',
            background: 'rgba(0,0,0,0.4)',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            pointerEvents: 'none',
          }}
        >
          拖曳平移 · 滾輪縮放 · 點擊省份選擇國家
        </div>
      )}
    </div>
  );
};

export default WorldMap;

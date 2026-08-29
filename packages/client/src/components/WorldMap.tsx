import { useEffect, useRef, useState, useMemo } from 'react';
import type { CountryDefinition } from '@wwi/shared';

/* eslint-disable @typescript-eslint/no-explicit-any */

const GEOJSON_URL = '/maps/provinces-1914.geojson';

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
}

const WorldMap: React.FC<WorldMapProps> = ({ countries, selectedCountryId, onSelectCountry }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const hoveredIdRef = useRef<string | number | null>(null);
  const countriesRef = useRef(countries);
  const onSelectRef = useRef(onSelectCountry);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; color: string } | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  countriesRef.current = countries;
  onSelectRef.current = onSelectCountry;

  // Build MapLibre "match" expression: wwi country id -> hex color
  const colorExpression = useMemo((): any => {
    const expr = ['match', ['get', 'wwi']];
    for (const c of countries) {
      expr.push(c.id, c.color);
    }
    expr.push(UNCLAIMED_COLOR);
    return expr;
  }, [countries]);

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
        center: [10, 25],
        zoom: 1.2,
        minZoom: 0.5,
        maxZoom: 8,
        // NOTE: maxBounds removed — when the container has zero size at
        // construction time (before layout settles), MapLibre's bounds-fit
        // math divides by a ~0 viewport and clamps zoom to its default max
        // (22) while snapping center to the bound edge (lng 180). That is
        // exactly the corrupted camera we kept seeing. minZoom/maxZoom give
        // similar UX protection without that failure mode.
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

    map.on('load', () => {
      try {
        // Force the correct camera position — if the container had zero
        // size at construction time, MapLibre's internal transform can
        // end up corrupted (we saw zoom snap to 22 / center to the map
        // edge). jumpTo() forces a clean, correct camera regardless.
        map.resize();
        map.jumpTo({ center: [10, 25], zoom: 1.2 });

        // GeoJSON source — promoteId lets us use feature-state for hover
        map.addSource('provinces', {
          type: 'geojson',
          data: GEOJSON_URL,
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
          const wwi = features[0].properties?.wwi;
          const country = wwi ? countriesRef.current.find((c) => c.id === wwi) : null;
          if (country) onSelectRef.current?.(country);
        });

        setMapReady(true);
      } catch (err) {
        console.error('[WorldMap] Layer setup failed:', err);
        const e = err as Error;
        setMapError(`Layer setup: ${e.message}\n\n${e.stack || '(no stack)'}`);
      }
    });

    mapRef.current = map;

    // Keep the canvas correctly sized if the container's dimensions
    // change after mount (flex/grid layouts often settle a frame late).
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
        border: '1px solid var(--border-color)',
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {mapError && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            background: 'rgba(10,14,20,0.95)',
            color: 'var(--text-muted)',
            textAlign: 'center',
            padding: '1.5rem',
            fontSize: '0.85rem',
            whiteSpace: 'pre-wrap',
            overflow: 'auto',
          }}
        >
          <p style={{ color: '#ef4444', fontWeight: 600 }}>⚠️ 地圖無法載入</p>
          <pre style={{ fontSize: '0.75rem', textAlign: 'left', maxWidth: '100%', overflow: 'auto' }}>
            {mapError}
          </pre>
        </div>
      )}

      {/* Vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 120px 40px rgba(0,0,0,0.5)',
        }}
      />

      {/* Selected country badge */}
      {selectedCountry && !mapError && (
        <div
          style={{
            position: 'absolute',
            top: '0.6rem',
            left: '0.6rem',
            background: 'rgba(10,14,20,0.85)',
            border: `1px solid ${SELECTED_BORDER_COLOR}`,
            borderRadius: '4px',
            padding: '0.4rem 0.8rem',
            fontSize: '0.85rem',
            color: '#fff',
          }}
        >
          已選取: {selectedCountry.flagIcon} {selectedCountry.nameZh}
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

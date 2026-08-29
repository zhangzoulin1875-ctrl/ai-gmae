import React, { useState, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';
import type { CountryDefinition } from '@wwi/shared';
import { ISO_NUMERIC_TO_ALPHA3 } from '@wwi/shared';

// Real-world country boundaries (110m resolution), served from a CDN as TopoJSON.
const WORLD_TOPOJSON_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const OCEAN_TOP = '#0a2740';
const OCEAN_BOTTOM = '#04121f';
const UNCLAIMED_FILL = '#2a3140';
const UNCLAIMED_STROKE = '#1a2028';

interface WorldMapProps {
  countries: CountryDefinition[];
  selectedCountryId?: string | null;
  onSelectCountry?: (country: CountryDefinition | null) => void;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const bigint = parseInt(full, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const l = (v: number) => Math.min(255, Math.round(v + (255 - v) * amount));
  return `rgb(${l(r)}, ${l(g)}, ${l(b)})`;
}

const WorldMap: React.FC<WorldMapProps> = ({ countries, selectedCountryId, onSelectCountry }) => {
  const [hoveredAlpha3, setHoveredAlpha3] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; country: CountryDefinition } | null>(null);

  // alpha3 -> country definition (first match wins if duplicated, e.g. SAU used by both sau & nej)
  const byAlpha3 = useMemo(() => {
    const map = new Map<string, CountryDefinition>();
    for (const c of countries) {
      if (!map.has(c.code)) map.set(c.code, c);
    }
    return map;
  }, [countries]);

  const selectedCountry = selectedCountryId ? countries.find((c) => c.id === selectedCountryId) : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '520px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 130, center: [10, 20] }}
        style={{ width: '100%', height: '100%' }}
      >
        <defs>
          <radialGradient id="ocean-gradient" cx="50%" cy="35%" r="75%">
            <stop offset="0%" stopColor={OCEAN_TOP} />
            <stop offset="100%" stopColor={OCEAN_BOTTOM} />
          </radialGradient>
          <filter id="land-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0.6" stdDeviation="0.5" floodColor="#000000" floodOpacity="0.45" />
          </filter>
          {countries.map((c) => (
            <linearGradient id={`grad-${c.id}`} key={c.id} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={lighten(c.color, 0.28)} />
              <stop offset="100%" stopColor={c.color} />
            </linearGradient>
          ))}
        </defs>

        <rect x="-50%" y="-50%" width="200%" height="200%" fill="url(#ocean-gradient)" />

        <ZoomableGroup zoom={1} minZoom={1} maxZoom={8} translateExtent={[[-50, -50], [850, 550]]}>
          <Geographies geography={WORLD_TOPOJSON_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const alpha3 = ISO_NUMERIC_TO_ALPHA3[String(geo.id)];
                const country = alpha3 ? byAlpha3.get(alpha3) : undefined;
                const isHovered = !!country && hoveredAlpha3 === alpha3;
                const isSelected = !!country && country.id === selectedCountryId;

                let fill = UNCLAIMED_FILL;
                if (country) fill = `url(#grad-${country.id})`;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={(evt) => {
                      if (country) {
                        setHoveredAlpha3(alpha3);
                        setTooltip({ x: evt.clientX, y: evt.clientY, country });
                      }
                    }}
                    onMouseMove={(evt) => {
                      if (country) setTooltip({ x: evt.clientX, y: evt.clientY, country });
                    }}
                    onMouseLeave={() => {
                      setHoveredAlpha3(null);
                      setTooltip(null);
                    }}
                    onClick={() => {
                      if (country) onSelectCountry?.(country);
                    }}
                    style={{
                      default: {
                        fill,
                        stroke: isSelected ? '#ffd166' : UNCLAIMED_STROKE,
                        strokeWidth: isSelected ? 1.3 : 0.4,
                        outline: 'none',
                        cursor: country ? 'pointer' : 'default',
                        filter: country ? 'url(#land-shadow)' : 'none',
                        transition: 'stroke 0.15s ease',
                      },
                      hover: {
                        fill: country ? fill : UNCLAIMED_FILL,
                        stroke: isSelected ? '#ffd166' : '#ffffff',
                        strokeWidth: isSelected ? 1.3 : 0.9,
                        outline: 'none',
                        cursor: country ? 'pointer' : 'default',
                        filter: country ? 'url(#land-shadow) brightness(1.15)' : 'none',
                      },
                      pressed: {
                        fill,
                        outline: 'none',
                      },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 12,
            top: tooltip.y + 12,
            background: 'rgba(10, 14, 20, 0.92)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            padding: '0.4rem 0.7rem',
            fontSize: '0.8rem',
            color: '#fff',
            pointerEvents: 'none',
            zIndex: 50,
            whiteSpace: 'nowrap',
          }}
        >
          {tooltip.country.flagIcon} {tooltip.country.nameZh}
        </div>
      )}

      {selectedCountry && (
        <div
          style={{
            position: 'absolute',
            top: '0.6rem',
            left: '0.6rem',
            background: 'rgba(10, 14, 20, 0.85)',
            border: '1px solid var(--accent-gold)',
            borderRadius: '4px',
            padding: '0.4rem 0.8rem',
            fontSize: '0.85rem',
            color: '#fff',
          }}
        >
          已選取: {selectedCountry.flagIcon} {selectedCountry.nameZh}
        </div>
      )}

      <div style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.4)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
        拖曳平移 · 滾輪縮放 · 點擊選擇國家
      </div>
    </div>
  );
};

export default WorldMap;

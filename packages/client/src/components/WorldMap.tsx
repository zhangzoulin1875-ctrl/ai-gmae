import React, { useState, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Graticule,
  ZoomableGroup,
} from 'react-simple-maps';
import type { CountryDefinition } from '@wwi/shared';
import { ISO_NUMERIC_TO_ALPHA3 } from '@wwi/shared';

// Real-world country boundaries (50m resolution = much crisper coastlines
// than the 110m version), served from a CDN as TopoJSON.
const WORLD_TOPOJSON_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json';

const OCEAN_TOP = '#0f3352';
const OCEAN_MID = '#0a2340';
const OCEAN_EDGE = '#030d18';
const UNCLAIMED_TOP = '#3a3f38';
const UNCLAIMED_BOTTOM = '#23261f';
const UNCLAIMED_STROKE = '#14150f';
const INK_STROKE = '#0c1016';

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

function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const adj = (v: number) =>
    amount >= 0 ? Math.min(255, Math.round(v + (255 - v) * amount)) : Math.max(0, Math.round(v * (1 + amount)));
  return `rgb(${adj(r)}, ${adj(g)}, ${adj(b)})`;
}

const WorldMap: React.FC<WorldMapProps> = ({ countries, selectedCountryId, onSelectCountry }) => {
  const [hoveredAlpha3, setHoveredAlpha3] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; country: CountryDefinition } | null>(null);

  const byAlpha3 = useMemo(() => {
    const map = new Map<string, CountryDefinition>();
    for (const c of countries) {
      if (!map.has(c.code)) map.set(c.code, c);
    }
    return map;
  }, [countries]);

  const selectedCountry = selectedCountryId ? countries.find((c) => c.id === selectedCountryId) : null;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '560px',
        borderRadius: '6px',
        overflow: 'hidden',
        border: '1px solid var(--border-color)',
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.55)',
      }}
    >
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 135, center: [10, 20] }}
        style={{ width: '100%', height: '100%', filter: 'saturate(1.2) contrast(1.08)' }}
      >
        <defs>
          <radialGradient id="ocean-gradient" cx="42%" cy="30%" r="85%">
            <stop offset="0%" stopColor={OCEAN_TOP} />
            <stop offset="55%" stopColor={OCEAN_MID} />
            <stop offset="100%" stopColor={OCEAN_EDGE} />
          </radialGradient>

          {/* Paper/canvas grain, purely procedural (no external assets) for a
              hand-painted grand-strategy atlas feel. */}
          <filter id="paper-grain" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
            <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0" />
          </filter>

          <filter id="land-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0.8" stdDeviation="0.9" floodColor="#000000" floodOpacity="0.55" />
          </filter>

          <filter id="select-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.2" floodColor="#ffd166" floodOpacity="0.95" />
          </filter>

          {countries.map((c) => (
            <linearGradient id={`grad-${c.id}`} key={c.id} x1="15%" y1="0%" x2="85%" y2="100%">
              <stop offset="0%" stopColor={shade(c.color, 0.32)} />
              <stop offset="45%" stopColor={c.color} />
              <stop offset="100%" stopColor={shade(c.color, -0.22)} />
            </linearGradient>
          ))}
          <linearGradient id="grad-unclaimed" x1="15%" y1="0%" x2="85%" y2="100%">
            <stop offset="0%" stopColor={UNCLAIMED_TOP} />
            <stop offset="100%" stopColor={UNCLAIMED_BOTTOM} />
          </linearGradient>
        </defs>

        <rect x="-50%" y="-50%" width="200%" height="200%" fill="url(#ocean-gradient)" />

        <ZoomableGroup zoom={1} minZoom={1} maxZoom={9} translateExtent={[[-60, -60], [860, 560]]}>
          <Graticule stroke="rgba(140,180,220,0.10)" strokeWidth={0.4} step={[15, 15]} />

          <Geographies geography={WORLD_TOPOJSON_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const alpha3 = ISO_NUMERIC_TO_ALPHA3[String(geo.id)];
                const country = alpha3 ? byAlpha3.get(alpha3) : undefined;
                const isSelected = !!country && country.id === selectedCountryId;
                const fill = country ? `url(#grad-${country.id})` : 'url(#grad-unclaimed)';

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
                        stroke: isSelected ? '#ffd166' : country ? INK_STROKE : UNCLAIMED_STROKE,
                        strokeWidth: isSelected ? 1.1 : country ? 0.55 : 0.4,
                        outline: 'none',
                        cursor: country ? 'pointer' : 'default',
                        filter: isSelected ? 'url(#select-glow)' : country ? 'url(#land-shadow)' : 'none',
                        transition: 'stroke 0.15s ease',
                      },
                      hover: {
                        fill,
                        stroke: isSelected ? '#ffd166' : country ? '#f4e9d0' : '#555',
                        strokeWidth: isSelected ? 1.1 : country ? 1 : 0.5,
                        outline: 'none',
                        cursor: country ? 'pointer' : 'default',
                        filter: country
                          ? `${isSelected ? 'url(#select-glow)' : 'url(#land-shadow)'} brightness(1.18)`
                          : 'none',
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

        {/* Procedural paper-grain overlay for texture, blended subtly over everything */}
        <rect
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
          filter="url(#paper-grain)"
          style={{ mixBlendMode: 'overlay', pointerEvents: 'none' }}
        />
      </ComposableMap>

      {/* Vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 120px 40px rgba(0,0,0,0.5)',
        }}
      />

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

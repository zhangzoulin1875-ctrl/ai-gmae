import React, { useState, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Graticule,
  ZoomableGroup,
} from 'react-simple-maps';
import type { CountryDefinition } from '@wwi/shared';

// Local TopoJSON: 3240 provinces with 1914-era country mapping
const PROVINCES_TOPO = '/maps/provinces-1914.topojson';

const OCEAN_TOP = '#0f3352';
const OCEAN_MID = '#0a2340';
const OCEAN_EDGE = '#030d18';
const UNCLAIMED_TOP = '#3a3f38';
const UNCLAIMED_BOTTOM = '#23261f';
const UNCLAIMED_STROKE = '#14150f';
const INK_STROKE = '#0c1016';

interface ProvinceMapProps {
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

const ProvinceMap: React.FC<ProvinceMapProps> = ({ countries, selectedCountryId, onSelectCountry }) => {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; color: string } | null>(null);

  // wwi country ID -> CountryDefinition
  const byWwiId = useMemo(() => {
    const map = new Map<string, CountryDefinition>();
    for (const c of countries) {
      map.set(c.id, c);
    }
    return map;
  }, [countries]);

  // Pre-compute gradient IDs
  const gradientIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of countries) ids.add(c.id);
    return ids;
  }, [countries]);

  const handleGeoEnter = (evt: React.MouseEvent, geo: any) => {
    const wwi = geo.properties?.wwi;
    if (!wwi) return;
    const country = byWwiId.get(wwi);
    if (!country) return;
    const provName = geo.properties?.nameZh || geo.properties?.name || '';
    setTooltip({
      x: evt.clientX,
      y: evt.clientY,
      text: `${country.flagIcon} ${country.nameZh} · ${provName}`,
      color: country.color,
    });
  };

  const handleGeoClick = (geo: any) => {
    const wwi = geo.properties?.wwi;
    if (!wwi) return;
    const country = byWwiId.get(wwi);
    if (country) onSelectCountry?.(country);
  };

  const selectedCountry = selectedCountryId ? byWwiId.get(selectedCountryId) : null;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '600px',
        borderRadius: '6px',
        overflow: 'hidden',
        border: '1px solid var(--border-color)',
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.55)',
      }}
    >
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 140, center: [10, 20] }}
        style={{ width: '100%', height: '100%', filter: 'saturate(1.15) contrast(1.06)' }}
      >
        <defs>
          <radialGradient id="ocean-gradient" cx="42%" cy="30%" r="85%">
            <stop offset="0%" stopColor={OCEAN_TOP} />
            <stop offset="55%" stopColor={OCEAN_MID} />
            <stop offset="100%" stopColor={OCEAN_EDGE} />
          </radialGradient>

          <filter id="paper-grain" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
            <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.04 0" />
          </filter>

          <filter id="land-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0.6" stdDeviation="0.6" floodColor="#000000" floodOpacity="0.45" />
          </filter>

          {countries.map((c) => (
            <linearGradient id={`grad-${c.id}`} key={c.id} x1="15%" y1="0%" x2="85%" y2="100%">
              <stop offset="0%" stopColor={shade(c.color, 0.3)} />
              <stop offset="50%" stopColor={c.color} />
              <stop offset="100%" stopColor={shade(c.color, -0.2)} />
            </linearGradient>
          ))}
          <linearGradient id="grad-unclaimed" x1="15%" y1="0%" x2="85%" y2="100%">
            <stop offset="0%" stopColor={UNCLAIMED_TOP} />
            <stop offset="100%" stopColor={UNCLAIMED_BOTTOM} />
          </linearGradient>
        </defs>

        <rect x="-50%" y="-50%" width="200%" height="200%" fill="url(#ocean-gradient)" />

        <ZoomableGroup zoom={1} minZoom={1} maxZoom={12} translateExtent={[[-100, -100], [900, 600]]}>
          <Graticule stroke="rgba(140,180,220,0.08)" strokeWidth={0.4} step={[15, 15]} />

          <Geographies geography={PROVINCES_TOPO}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const wwi = geo.properties?.wwi || '';
                const country = gradientIds.has(wwi) ? byWwiId.get(wwi) : null;
                const isSelected = wwi === selectedCountryId;
                const fill = country ? `url(#grad-${wwi})` : 'url(#grad-unclaimed)';

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={(evt) => handleGeoEnter(evt, geo)}
                    onMouseMove={(evt) => handleGeoEnter(evt, geo)}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => handleGeoClick(geo)}
                    style={{
                      default: {
                        fill,
                        stroke: isSelected ? '#ffd166' : country ? INK_STROKE : UNCLAIMED_STROKE,
                        strokeWidth: isSelected ? 0.8 : country ? 0.3 : 0.25,
                        outline: 'none',
                        cursor: country ? 'pointer' : 'default',
                        filter: country ? 'url(#land-shadow)' : 'none',
                        transition: 'stroke 0.12s ease',
                      },
                      hover: {
                        fill,
                        stroke: isSelected ? '#ffd166' : country ? '#e8d8b8' : '#555',
                        strokeWidth: isSelected ? 0.8 : country ? 0.7 : 0.4,
                        outline: 'none',
                        cursor: country ? 'pointer' : 'default',
                        filter: country
                          ? `${isSelected ? '' : 'url(#land-shadow)'} brightness(1.2)`
                          : 'none',
                      },
                      pressed: { fill, outline: 'none' },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>

        <rect
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
          filter="url(#paper-grain)"
          style={{ mixBlendMode: 'overlay', pointerEvents: 'none' }}
        />
      </ComposableMap>

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
        }}
      >
        拖曳平移 · 滾輪縮放 · 點擊省份選擇國家
      </div>
    </div>
  );
};

export default ProvinceMap;

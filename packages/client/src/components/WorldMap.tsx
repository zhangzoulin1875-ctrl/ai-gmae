import React, { useState, useMemo, useCallback } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';
import type { CountryDefinition } from '@wwi/shared';

// Local TopoJSON: 3240 provinces with 1914-era country mapping
const PROVINCES_TOPO = '/maps/provinces-1914.geojson';

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

// Memoized per-province shape. Only re-renders when ITS OWN selection state
// or fill/stroke actually changes — not on every tooltip/mouse update, which
// is what was murdering performance with 3240 provinces on the map.
interface ProvinceShapeProps {
  geo: any;
  fill: string;
  isSelected: boolean;
  isClaimed: boolean;
  onHover: (evt: React.MouseEvent, geo: any) => void;
  onLeave: () => void;
  onClick: (geo: any) => void;
}

const ProvinceShape = React.memo(
  ({ geo, fill, isSelected, isClaimed, onHover, onLeave, onClick }: ProvinceShapeProps) => {
    return (
      <Geography
        geography={geo}
        onMouseEnter={(evt) => onHover(evt, geo)}
        onMouseLeave={onLeave}
        onClick={() => onClick(geo)}
        style={{
          default: {
            fill,
            stroke: isSelected ? '#ffd166' : isClaimed ? INK_STROKE : UNCLAIMED_STROKE,
            strokeWidth: isSelected ? 0.8 : isClaimed ? 0.3 : 0.25,
            outline: 'none',
            cursor: isClaimed ? 'pointer' : 'default',
            transition: 'none',
          },
          hover: {
            fill,
            stroke: isSelected ? '#ffd166' : isClaimed ? '#e8d8b8' : '#555',
            strokeWidth: isSelected ? 0.8 : isClaimed ? 0.7 : 0.4,
            outline: 'none',
            cursor: isClaimed ? 'pointer' : 'default',
          },
          pressed: { fill, outline: 'none' },
        }}
      />
    );
  },
  (prev, next) =>
    prev.geo === next.geo &&
    prev.fill === next.fill &&
    prev.isSelected === next.isSelected &&
    prev.isClaimed === next.isClaimed
);
ProvinceShape.displayName = 'ProvinceShape';

const ProvinceMap: React.FC<ProvinceMapProps> = ({ countries, selectedCountryId, onSelectCountry }) => {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; color: string } | null>(null);

  const byWwiId = useMemo(() => {
    const map = new Map<string, CountryDefinition>();
    for (const c of countries) map.set(c.id, c);
    return map;
  }, [countries]);

  // onMouseEnter only (not onMouseMove) — fires once per province entry
  // instead of on every pixel of mouse travel, which is what caused the
  // freeze/black-screen: 3240 elements re-rendering on every mouse pixel.
  const handleGeoEnter = useCallback(
    (evt: React.MouseEvent, geo: any) => {
      const wwi = geo.properties?.wwi;
      const country = wwi ? byWwiId.get(wwi) : undefined;
      if (!country) {
        setTooltip(null);
        return;
      }
      const provName = geo.properties?.nameZh || geo.properties?.name || '';
      setTooltip({
        x: evt.clientX,
        y: evt.clientY,
        text: `${country.flagIcon} ${country.nameZh} · ${provName}`,
        color: country.color,
      });
    },
    [byWwiId]
  );

  const handleGeoLeave = useCallback(() => setTooltip(null), []);

  const handleGeoClick = useCallback(
    (geo: any) => {
      const wwi = geo.properties?.wwi;
      const country = wwi ? byWwiId.get(wwi) : undefined;
      if (country) onSelectCountry?.(country);
    },
    [byWwiId, onSelectCountry]
  );

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
        background: `radial-gradient(ellipse at 42% 30%, ${OCEAN_TOP} 0%, ${OCEAN_MID} 55%, ${OCEAN_EDGE} 100%)`,
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.55)',
      }}
    >
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 140, center: [10, 20] }}
        style={{ width: '100%', height: '100%' }}
      >
        <defs>
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

        <ZoomableGroup zoom={1} minZoom={1} maxZoom={12} translateExtent={[[-100, -100], [900, 600]]}>
          <Geographies geography={PROVINCES_TOPO}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const wwi = geo.properties?.wwi || '';
                const country = wwi ? byWwiId.get(wwi) : undefined;
                const isClaimed = !!country;
                const isSelected = wwi === selectedCountryId;
                const fill = country ? `url(#grad-${wwi})` : 'url(#grad-unclaimed)';

                return (
                  <ProvinceShape
                    key={geo.rsmKey}
                    geo={geo}
                    fill={fill}
                    isSelected={isSelected}
                    isClaimed={isClaimed}
                    onHover={handleGeoEnter}
                    onLeave={handleGeoLeave}
                    onClick={handleGeoClick}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
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

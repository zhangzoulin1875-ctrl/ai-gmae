import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { TerritoryGeometry, WorldMapData, CountryDefinition } from '@wwi/shared';
import { WebGPUMapRenderer, type CameraState } from '../webgpu/renderer';

interface GameMapProps {
  worldMap: WorldMapData;
  countries: CountryDefinition[];
  selectedTerritoryId?: string | null;
  onSelectTerritory?: (territory: TerritoryGeometry | null) => void;
}

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;
  return [r, g, b];
}

function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  let inside = false;
  const [px, py] = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const GameMap: React.FC<GameMapProps> = ({ worldMap, countries, selectedTerritoryId, onSelectTerritory }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGPUMapRenderer | null>(null);
  const cameraRef = useRef<CameraState>({ zoom: 4, panX: 0, panY: 0 });
  const draggingRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const [supported, setSupported] = useState<boolean | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const countryById = useCallback(
    (id: string) => countries.find((c) => c.id === id),
    [countries]
  );

  const colorFor = useCallback(
    (t: TerritoryGeometry): [number, number, number] => {
      const country = countryById(t.countryId);
      const base = hexToRgb01(country?.color || '#666666');
      if (t.id === hoveredId) return base.map((c) => Math.min(1, c + 0.25)) as [number, number, number];
      if (t.id === selectedTerritoryId) return [1, 0.84, 0.42]; // gold highlight
      return base;
    },
    [countryById, hoveredId, selectedTerritoryId]
  );

  // Init WebGPU
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!glCanvasRef.current) return;
      const renderer = new WebGPUMapRenderer(glCanvasRef.current);
      const ok = await renderer.init();
      if (!mounted) return;
      setSupported(ok);
      if (ok) rendererRef.current = renderer;
    })();
    return () => {
      mounted = false;
      rendererRef.current?.dispose();
    };
  }, []);

  const resizeAll = useCallback(() => {
    const container = containerRef.current;
    const gl = glCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!container || !gl || !overlay) return;
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    rendererRef.current?.resize(w * dpr, h * dpr);
    overlay.width = w * dpr;
    overlay.height = h * dpr;
    overlay.style.width = `${w}px`;
    overlay.style.height = `${h}px`;
    gl.style.width = `${w}px`;
    gl.style.height = `${h}px`;
  }, []);

  useEffect(() => {
    resizeAll();
    window.addEventListener('resize', resizeAll);
    return () => window.removeEventListener('resize', resizeAll);
  }, [resizeAll]);

  const drawOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    const { zoom, panX, panY } = cameraRef.current;
    const cw = overlay.width;
    const ch = overlay.height;

    ctx.clearRect(0, 0, cw, ch);

    const toScreen = (wx: number, wy: number): [number, number] => [
      cw / 2 + (wx - panX) * zoom,
      ch / 2 + (wy - panY) * zoom,
    ];

    ctx.lineWidth = Math.max(1, zoom * 0.15);
    for (const t of worldMap.territories) {
      const isHovered = t.id === hoveredId;
      const isSelected = t.id === selectedTerritoryId;
      ctx.beginPath();
      t.polygon.forEach(([x, y], i) => {
        const [sx, sy] = toScreen(x, y);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.strokeStyle = isSelected ? '#ffd166' : isHovered ? '#ffffff' : 'rgba(15,20,25,0.85)';
      ctx.stroke();

      if (zoom > 3) {
        const [cx, cy] = toScreen(t.center[0], t.center[1]);
        ctx.font = `${Math.max(10, zoom * 1.6)}px Inter, sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const country = countryById(t.countryId);
        if (country) ctx.fillText(country.flagIcon, cx, cy);
      }
    }
  }, [worldMap, hoveredId, selectedTerritoryId, countryById]);

  const renderFrame = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setTerritories(worldMap.territories, colorFor);
    renderer.setCamera(cameraRef.current);
    renderer.render();
    drawOverlay();
  }, [worldMap, colorFor, drawOverlay]);

  useEffect(() => {
    if (supported) renderFrame();
    else drawOverlay();
  }, [supported, renderFrame, drawOverlay]);

  const screenToWorld = (clientX: number, clientY: number): [number, number] => {
    const overlay = overlayCanvasRef.current!;
    const rect = overlay.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const px = (clientX - rect.left) * dpr;
    const py = (clientY - rect.top) * dpr;
    const { zoom, panX, panY } = cameraRef.current;
    const cw = overlay.width;
    const ch = overlay.height;
    return [panX + (px - cw / 2) / zoom, panY + (py - ch / 2) / zoom];
  };

  const handleWheel: React.WheelEventHandler = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    cameraRef.current.zoom = Math.min(30, Math.max(1.2, cameraRef.current.zoom * factor));
    renderFrame();
  };

  const handleMouseDown: React.MouseEventHandler = (e) => {
    draggingRef.current = { x: e.clientX, y: e.clientY, moved: false };
  };

  const handleMouseMove: React.MouseEventHandler = (e) => {
    if (draggingRef.current) {
      const dx = e.clientX - draggingRef.current.x;
      const dy = e.clientY - draggingRef.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) draggingRef.current.moved = true;
      const dpr = window.devicePixelRatio || 1;
      cameraRef.current.panX -= (dx * dpr) / cameraRef.current.zoom;
      cameraRef.current.panY -= (dy * dpr) / cameraRef.current.zoom;
      draggingRef.current.x = e.clientX;
      draggingRef.current.y = e.clientY;
      renderFrame();
      return;
    }

    const [wx, wy] = screenToWorld(e.clientX, e.clientY);
    const hit = worldMap.territories.find((t) => pointInPolygon([wx, wy], t.polygon));
    const newHoverId = hit?.id || null;
    if (newHoverId !== hoveredId) setHoveredId(newHoverId);
  };

  const handleMouseUp: React.MouseEventHandler = (e) => {
    const wasClick = draggingRef.current && !draggingRef.current.moved;
    draggingRef.current = null;
    if (!wasClick) return;

    const [wx, wy] = screenToWorld(e.clientX, e.clientY);
    const hit = worldMap.territories.find((t) => pointInPolygon([wx, wy], t.polygon));
    onSelectTerritory?.(hit || null);
  };

  useEffect(() => {
    renderFrame();
  }, [renderFrame]);

  if (supported === false) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>
          您的瀏覽器不支援 WebGPU,無法顯示戰略地圖。請使用最新版 Chrome 或 Edge 開啟遊戲。
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '480px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)', cursor: draggingRef.current ? 'grabbing' : 'grab' }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        draggingRef.current = null;
        if (hoveredId) setHoveredId(null);
      }}
    >
      <canvas ref={glCanvasRef} style={{ position: 'absolute', inset: 0 }} />
      <canvas ref={overlayCanvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.4)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
        拖曳平移 · 滾輪縮放 · 點擊選擇戰區
      </div>
    </div>
  );
};

export default GameMap;

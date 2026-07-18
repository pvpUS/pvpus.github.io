import { useEffect, useRef } from 'react';

const FPS = 60;
const SPEED_FACTOR = 5; // simulation runs 5x slower overall
const DECAY_PER_TICK = 4.8;
const NEW_POINTS_PER_TICK = 20;
const PEAK_MIN = 170;
const PEAK_MAX = 255;
const BLOCK_SIZE = 2; // each star renders as a BLOCK_SIZE x BLOCK_SIZE pixel block
const SCAN_SCALE = 5; // edge-scan coordinates are multiplied by this before centering on screen
const CONNECT_STRIDE = 10; // each boundary point is connected to the point this many steps ahead (wrapping)
const EDGE_FADE_TICKS = 25; // ticks for a line to fade in or out
const EDGE_HOLD_TICKS = 8; // ticks a line stays fully bright once lit
const EDGE_VISIBLE_FRACTION = 0.25; // configurable: target fraction of lines visible (any brightness) at any given moment
const DOT_OPACITY = 0.5; // configurable: opacity of the permanent vertex-dot layer

function randomPeak() {
  return PEAK_MIN + Math.floor(Math.random() * (PEAK_MAX - PEAK_MIN + 1));
}

// Fraction (0-1) of an edge's peak brightness at position `t` within its cycle:
// fades in over EDGE_FADE_TICKS, holds at 1 for EDGE_HOLD_TICKS, fades out over
// EDGE_FADE_TICKS, then stays dark for the remainder of `cycleLength`.
function edgeEnvelope(t) {
  if (t < EDGE_FADE_TICKS) return t / EDGE_FADE_TICKS;
  t -= EDGE_FADE_TICKS;
  if (t < EDGE_HOLD_TICKS) return 1;
  t -= EDGE_HOLD_TICKS;
  if (t < EDGE_FADE_TICKS) return 1 - t / EDGE_FADE_TICKS;
  return 0;
}

// Total ticks per edge cycle (fade in + hold + fade out + dark), sized so the
// visible portion (fade in + hold + fade out) makes up EDGE_VISIBLE_FRACTION
// of the whole cycle.
const EDGE_VISIBLE_TICKS = EDGE_FADE_TICKS * 2 + EDGE_HOLD_TICKS;
const EDGE_CYCLE_LENGTH = Math.max(
  EDGE_VISIBLE_TICKS,
  Math.round(EDGE_VISIBLE_TICKS / EDGE_VISIBLE_FRACTION)
);

function bresenhamLine(x0, y0, x1, y1) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  const linePoints = [];
  while (true) {
    linePoints.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return linePoints;
}

export default function RandomVisualizer() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    let width, height, gridWidth, gridHeight, brightness, rising, peakR, peakG, peakB, imageData, data, spawnAccumulator;
    let dots = [];
    let edges = [];
    let edgeMaxFraction;
    let tickCount = 0;

    // The original boundary/hole vertices the lines connect, always drawn (at
    // DOT_OPACITY, alpha-blended over whatever's underneath) so the shape's
    // dot outline stays visible regardless of how many lines are faded in.
    function drawDots() {
      for (const dot of dots) {
        const gx = Math.round(gridWidth / 2 + dot.x);
        const gy = Math.round(gridHeight / 2 + dot.y);
        if (gx < 0 || gx >= gridWidth || gy < 0 || gy >= gridHeight) continue;
        const x0 = gx * BLOCK_SIZE;
        const y0 = gy * BLOCK_SIZE;
        const yMax = Math.min(y0 + BLOCK_SIZE, height);
        const xMax = Math.min(x0 + BLOCK_SIZE, width);
        for (let py = y0; py < yMax; py++) {
          let o = (py * width + x0) * 4;
          for (let px = x0; px < xMax; px++) {
            data[o] = Math.round(dot.r * DOT_OPACITY + data[o] * (1 - DOT_OPACITY));
            data[o + 1] = Math.round(dot.g * DOT_OPACITY + data[o + 1] * (1 - DOT_OPACITY));
            data[o + 2] = Math.round(dot.b * DOT_OPACITY + data[o + 2] * (1 - DOT_OPACITY));
            o += 4;
          }
        }
      }
    }

    function drawEdges() {
      edgeMaxFraction.fill(0);
      for (const edge of edges) {
        const t = (tickCount + edge.phase) % EDGE_CYCLE_LENGTH;
        const fraction = edgeEnvelope(t);
        if (fraction <= 0) continue;
        const r = Math.round(edge.r * fraction);
        const g = Math.round(edge.g * fraction);
        const b = Math.round(edge.b * fraction);
        for (const [ex, ey] of edge.pixels) {
          const gx = Math.round(gridWidth / 2 + ex);
          const gy = Math.round(gridHeight / 2 + ey);
          if (gx < 0 || gx >= gridWidth || gy < 0 || gy >= gridHeight) continue;
          const cellIdx = gy * gridWidth + gx;
          if (fraction <= edgeMaxFraction[cellIdx]) continue; // a brighter line already owns this pixel
          edgeMaxFraction[cellIdx] = fraction;
          const x0 = gx * BLOCK_SIZE;
          const y0 = gy * BLOCK_SIZE;
          const yMax = Math.min(y0 + BLOCK_SIZE, height);
          const xMax = Math.min(x0 + BLOCK_SIZE, width);
          for (let py = y0; py < yMax; py++) {
            let o = (py * width + x0) * 4;
            for (let px = x0; px < xMax; px++) {
              // Add on top of (rather than overwrite) whatever is already there,
              // so an active star underneath a line stays visible.
              data[o] = Math.min(255, data[o] + r);
              data[o + 1] = Math.min(255, data[o + 1] + g);
              data[o + 2] = Math.min(255, data[o + 2] + b);
              o += 4;
            }
          }
        }
      }
    }

    async function loadEdgeScan() {
      try {
        const manifest = await (await fetch('/edgescans/manifest.json')).json();
        const file = manifest[Math.floor(Math.random() * manifest.length)];
        const map = await (await fetch(`/edgescans/${file}`)).json();
        const polygons = [];
        const allPoints = [];
        for (const island of map.islands || []) {
          if (island.boundary && island.boundary.length) {
            polygons.push(island.boundary);
            allPoints.push(...island.boundary);
          }
          for (const hole of island.holes || []) {
            if (hole.boundary && hole.boundary.length) {
              polygons.push(hole.boundary);
              allPoints.push(...hole.boundary);
            }
          }
        }
        if (allPoints.length === 0) return;

        const [cx, cy] = allPoints[Math.floor(Math.random() * allPoints.length)];
        const toScreen = ([x, y]) => [(x - cx) * SCAN_SCALE, (y - cy) * SCAN_SCALE];

        dots = allPoints.map((point) => {
          const [x, y] = toScreen(point);
          return { x, y, r: randomPeak(), g: randomPeak(), b: randomPeak() };
        });

        const newEdges = [];
        for (const polygon of polygons) {
          const len = polygon.length;
          for (let i = 0; i < len; i++) {
            const [ax, ay] = toScreen(polygon[i]);
            const [bx, by] = toScreen(polygon[(i + CONNECT_STRIDE) % len]);
            newEdges.push({
              pixels: bresenhamLine(ax, ay, bx, by),
              r: randomPeak(),
              g: randomPeak(),
              b: randomPeak(),
              phase: Math.floor(Math.random() * EDGE_CYCLE_LENGTH),
            });
          }
        }

        edges = newEdges;
      } catch {
        // decorative overlay only; ignore load failures
      }
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      gridWidth = Math.ceil(width / BLOCK_SIZE);
      gridHeight = Math.ceil(height / BLOCK_SIZE);
      brightness = new Float64Array(gridWidth * gridHeight);
      rising = new Uint8Array(gridWidth * gridHeight);
      peakR = new Uint8ClampedArray(gridWidth * gridHeight);
      peakG = new Uint8ClampedArray(gridWidth * gridHeight);
      peakB = new Uint8ClampedArray(gridWidth * gridHeight);
      edgeMaxFraction = new Float32Array(gridWidth * gridHeight);
      spawnAccumulator = 0;
      imageData = ctx.createImageData(width, height);
      data = imageData.data;
      for (let i = 3; i < data.length; i += 4) {
        data[i] = 255; // alpha
      }
    }

    function tick() {
      tickCount++;
      for (let i = 0, len = brightness.length; i < len; i++) {
        let b = brightness[i];
        if (rising[i]) {
          b += DECAY_PER_TICK;
          if (b >= 255) {
            b = 255;
            rising[i] = 0;
          }
          brightness[i] = b;
        } else if (b > 0) {
          b = Math.max(0, b - DECAY_PER_TICK);
          brightness[i] = b;
        }
        const fraction = b / 255;
        const r = Math.round(peakR[i] * fraction);
        const g = Math.round(peakG[i] * fraction);
        const bl = Math.round(peakB[i] * fraction);

        const gx = i % gridWidth;
        const gy = (i / gridWidth) | 0;
        const x0 = gx * BLOCK_SIZE;
        const y0 = gy * BLOCK_SIZE;
        const yMax = Math.min(y0 + BLOCK_SIZE, height);
        const xMax = Math.min(x0 + BLOCK_SIZE, width);
        for (let py = y0; py < yMax; py++) {
          let o = (py * width + x0) * 4;
          for (let px = x0; px < xMax; px++) {
            data[o] = r;
            data[o + 1] = g;
            data[o + 2] = bl;
            o += 4;
          }
        }
      }

      spawnAccumulator += NEW_POINTS_PER_TICK;
      const spawnCount = Math.floor(spawnAccumulator);
      spawnAccumulator -= spawnCount;
      for (let n = 0; n < spawnCount; n++) {
        const px = Math.floor(Math.random() * gridWidth);
        const py = Math.floor(Math.random() * gridHeight);
        const idx = py * gridWidth + px;
        brightness[idx] = 0;
        rising[idx] = 1;
        peakR[idx] = randomPeak();
        peakG[idx] = randomPeak();
        peakB[idx] = randomPeak();
      }

      drawDots();
      drawEdges();
      ctx.putImageData(imageData, 0, 0);
    }

    resize();
    const edgeScanLoaded = loadEdgeScan();
    window.addEventListener('resize', resize);

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      // Paint one static frame instead of continuously animating, then repaint
      // once the edge-scan overlay finishes loading so it's included too.
      tick();
      edgeScanLoaded.then(() => tick());
      return () => window.removeEventListener('resize', resize);
    }

    const tickMs = Math.round((1000 / FPS) * SPEED_FACTOR);
    let intervalId = setInterval(tick, tickMs);

    // Stop ticking (and blitting the full canvas) while the tab isn't visible,
    // so a backgrounded mobile tab doesn't keep burning CPU/battery.
    function handleVisibility() {
      if (document.hidden) {
        clearInterval(intervalId);
        intervalId = null;
      } else if (!intervalId) {
        intervalId = setInterval(tick, tickMs);
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(intervalId);
    };
  }, []);

  return <canvas ref={canvasRef} className="random-visualizer" />;
}

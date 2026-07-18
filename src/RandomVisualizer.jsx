import { useEffect, useRef } from 'react';

const FPS = 60;
const SPEED_FACTOR = 5; // simulation runs 5x slower overall
const DECAY_PER_TICK = 4.8;
const NEW_POINTS_PER_TICK = 20;
const PEAK_MIN = 170;
const PEAK_MAX = 255;
const BLOCK_SIZE = 2; // each star renders as a BLOCK_SIZE x BLOCK_SIZE pixel block

function randomPeak() {
  return PEAK_MIN + Math.floor(Math.random() * (PEAK_MAX - PEAK_MIN + 1));
}

export default function RandomVisualizer() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    let width, height, gridWidth, gridHeight, brightness, rising, peakR, peakG, peakB, imageData, data, spawnAccumulator;

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
      spawnAccumulator = 0;
      imageData = ctx.createImageData(width, height);
      data = imageData.data;
      for (let i = 3; i < data.length; i += 4) {
        data[i] = 255; // alpha
      }
    }

    function tick() {
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

      ctx.putImageData(imageData, 0, 0);
    }

    resize();
    window.addEventListener('resize', resize);
    const intervalId = setInterval(tick, Math.round((1000 / FPS) * SPEED_FACTOR));

    return () => {
      window.removeEventListener('resize', resize);
      clearInterval(intervalId);
    };
  }, []);

  return <canvas ref={canvasRef} className="random-visualizer" />;
}

import { Component, onMount, createSignal, onCleanup, Accessor, Show, createEffect } from 'solid-js';
import { Note } from '../state';
import FFT from 'fft.js'; // Make sure you've installed fft.js

// Define the types for our internal state
type ViewMode = 'OSCILLOSCOPE' | 'FFT';

interface OscilloscopeProps {
  id?: string;
  value?: Accessor<Float32Array | null>;
  notes?: Accessor<Note[]>;
  sampleRate: Accessor<number>;
  width?: number;
  height?: number;
}

// --- Helper functions (unchanged) ---
const midiNoteToFreq = (noteNumber: number): number => {
  return 440 * Math.pow(2, (noteNumber - 69) / 12);
};

const findTriggerIndex = (buffer: Float32Array, searchEnd: number): number => {
  for (let i = 1; i < searchEnd; i++) {
    if (buffer[i - 1] < 0 && buffer[i] >= 0) {
      return i;
    }
  }
  return -1;
};

// --- The Component ---
const Oscilloscope: Component<OscilloscopeProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let gridCanvas: HTMLCanvasElement | undefined; // Offscreen canvas for the grid

  // --- Internal State Management (Signals) ---
  const [viewMode, setViewMode] = createSignal<ViewMode>('OSCILLOSCOPE');
  const [isLocked, setIsLocked] = createSignal(true);
  const [scrollingSamples, setScrollingSamples] = createSignal(2048);

  // --- Persistent State for Locking Logic ---
  // These are 'let' variables, not signals, because they don't drive rendering
  // directly. They are state that persists across `createEffect` runs.
  let lockedNoteNumber: number | null = null;
  let lastKnownTriggerIndex: number | null = null;

  // --- FFT Specific Setup ---
  const fftSize = 4096;
  let fft: FFT | null = null;
  let freqDomainData: Float32Array | null = null;
  let hanningWindow: Float32Array | null = null;

  // `onMount` is now only for one-time setup that requires the DOM element.
  onMount(() => {
    // Initialize FFT-related resources
    fft = new FFT(fftSize);
    freqDomainData = fft.createComplexArray();
    hanningWindow = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      hanningWindow[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
    }

    // Initialize the offscreen grid canvas
    if (!canvasRef) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = { width: props.width || 400, height: props.height || 150 };
    gridCanvas = document.createElement('canvas');
    gridCanvas.width = rect.width * dpr;
    gridCanvas.height = rect.height * dpr;
    const gridCtx = gridCanvas.getContext('2d');
    if (gridCtx) {
      gridCtx.scale(dpr, dpr);
      drawGrid(gridCtx, rect.width, rect.height);
    }
  });

  const drawGrid = (context: CanvasRenderingContext2D, width: number, height: number) => {
    const computedStyle = getComputedStyle(document.documentElement);
    const backgroundColor = computedStyle.getPropertyValue('--dark-purple').trim() || '#2c2a4a';
    const gridSize = 20;
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, width, height);
    context.beginPath();
    context.strokeStyle = '#606CAE';
    context.lineWidth = 0.5;
    for (let x = gridSize; x < width; x += gridSize) {
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    for (let y = gridSize; y < height; y += gridSize) {
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.stroke();
  };

  // `createEffect` replaces the `requestAnimationFrame` loop.
  // It will automatically re-run whenever a tracked signal (`props.value`, `viewMode`, etc.) changes.
  createEffect(() => {
    // 1. Track all dependencies
    const buffer = props.value?.();
    const currentViewMode = viewMode();
    const isCurrentlyLocked = isLocked(); // Important to get the value here

    // 2. Guard clauses for setup
    if (!canvasRef) return;
    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;

    // 3. Canvas setup (ensures it's correct on every draw)
    const dpr = window.devicePixelRatio || 1;
    const rect = { width: props.width || 400, height: props.height || 150 };
    if (canvasRef.width !== rect.width * dpr || canvasRef.height !== rect.height * dpr) {
      canvasRef.width = rect.width * dpr;
      canvasRef.height = rect.height * dpr;
      canvasRef.style.width = `${rect.width}px`;
      canvasRef.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);
    }

    // 4. Clear and draw the grid from the offscreen canvas
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (gridCanvas) {
      ctx.drawImage(gridCanvas, 0, 0, rect.width, rect.height);
    } else {
      // Fallback if offscreen canvas wasn't ready
      drawGrid(ctx, rect.width, rect.height);
    }


    // 5. Handle no-data case
    if (!buffer || buffer.length === 0) {
      ctx.beginPath();
      ctx.moveTo(0, rect.height / 2);
      ctx.lineTo(rect.width, rect.height / 2);
      ctx.strokeStyle = "#888";
      ctx.lineWidth = 1;
      ctx.stroke();
      return;
    }

    // 6. Route to the correct drawing function
    if (currentViewMode === 'OSCILLOSCOPE') {
      drawOscilloscope(ctx, buffer, isCurrentlyLocked, rect.width, rect.height);
    } else {
      drawFFT(ctx, buffer, rect.width, rect.height);
    }
  });

  const drawOscilloscope = (ctx: CanvasRenderingContext2D, buffer: Float32Array, isLocked: boolean, width: number, height: number) => {
    const notes = props.notes?.() ?? [];
    let view: Float32Array;
    const bufferLength = buffer.length;

    // Locked Mode
    if (isLocked && notes.length > 0) {
      const lowestNote = notes.reduce((min, n) => (n.noteNumber < min ? n.noteNumber : min), notes[0].noteNumber);
      const freq = midiNoteToFreq(lowestNote);
      const periodSamples = props.sampleRate() / freq;
      const displayLength = Math.min(Math.floor(periodSamples * 2), bufferLength);

      let displayStartIndex: number;

      // CASE 1: New Lock or Re-Lock
      if (lowestNote !== lockedNoteNumber) {
        lockedNoteNumber = lowestNote;
        const searchEnd = bufferLength > displayLength ? bufferLength - displayLength : 1;
        const initialTrigger = findTriggerIndex(buffer, searchEnd);
        displayStartIndex = (initialTrigger !== -1) ? initialTrigger : 0;
        lastKnownTriggerIndex = displayStartIndex;

        // CASE 2: Steady-State Lock (Your correct logic)
      } else if (lastKnownTriggerIndex !== null) {
        let nextTrigger = lastKnownTriggerIndex;
        while (nextTrigger < bufferLength) {
          nextTrigger += periodSamples;
        }
        lastKnownTriggerIndex = nextTrigger - bufferLength;
        displayStartIndex = Math.round(lastKnownTriggerIndex);
      } else {
        displayStartIndex = 0;
        lastKnownTriggerIndex = 0;
      }

      if (displayStartIndex + displayLength > bufferLength || displayStartIndex < 0) {
        view = buffer.subarray(0, displayLength);
      } else {
        view = buffer.subarray(displayStartIndex, displayStartIndex + displayLength);
      }

      // Scrolling (Unlocked) Mode
    } else {
      if (lockedNoteNumber !== null) {
        lockedNoteNumber = null;
        lastKnownTriggerIndex = null;
      }
      const displayLength = Math.min(scrollingSamples(), buffer.length);
      const startIndex = buffer.length - displayLength;
      view = buffer.subarray(startIndex);
    }

    // Drawing Logic (unchanged)
    if (view && view.length > 0) {
      const scaleY = height / 2;
      const mid = height / 2;
      const scaleX = width / view.length;
      ctx.beginPath();
      ctx.moveTo(0, mid - view[0] * scaleY);
      for (let i = 1; i < view.length; i++) {
        ctx.lineTo(i * scaleX, mid - view[i] * scaleY);
      }
      ctx.strokeStyle = "#f506f7";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };

  const drawFFT = (ctx: CanvasRenderingContext2D, buffer: Float32Array, width: number, height: number) => {
    if (!fft || !freqDomainData || !hanningWindow) return;
    const timeDomainData = buffer.slice(0, fftSize);
    for (let i = 0; i < fftSize; i++) {
      timeDomainData[i] *= hanningWindow[i];
    }
    fft.realTransform(freqDomainData, timeDomainData);
    const numBins = fftSize / 2;
    const normalizationFactor = fftSize / 2;
    const minDb = -100;
    const maxDb = 0;

    ctx.fillStyle = "#f506f7";
    let lastX = 0;
    for (let i = 0; i < numBins; i++) {
      const real = freqDomainData[i * 2];
      const imag = freqDomainData[i * 2 + 1];
      const magnitude = Math.sqrt(real * real + imag * imag);
      const normalizedMagnitude = magnitude / normalizationFactor;
      const db = 20 * Math.log10(normalizedMagnitude + 1e-9);
      const freq = (i * props.sampleRate()) / fftSize;
      const minFreq = 20;
      const maxFreq = props.sampleRate() / 2;
      let currentX = width * (Math.log(freq / minFreq) / Math.log(maxFreq / minFreq));
      let yFraction = (db - minDb) / (maxDb - minDb);
      yFraction = Math.max(0, Math.min(1, yFraction));
      const y = (1 - yFraction) * height;
      if (isFinite(currentX) && isFinite(y)) {
        const barWidth = Math.max(1, currentX - lastX);
        const barHeight = height - y;
        ctx.fillRect(lastX, y, barWidth, barHeight);
        lastX = currentX;
      }
    }
  };

  return (
    <div style={{ "display": "flex", "flex-direction": "column", "align-items": "center", "gap": "8px" }}>
      <canvas
        ref={canvasRef} // Simpler ref assignment
        id={props.id || 'oscilloscope'}
        style={{
          "border-radius": "10px",
          border: "1px solid var(--teal)",
        }}
      />
      <div style={{ "display": "flex", "gap": "10px" }}>
        <button onClick={() => setViewMode(vm => vm === 'OSCILLOSCOPE' ? 'FFT' : 'OSCILLOSCOPE')}>
          View: {viewMode()}
        </button>
        <Show when={viewMode() === 'OSCILLOSCOPE'}>
          <button onClick={() => setIsLocked(!isLocked())}>
            Lock: {isLocked() ? 'On' : 'Off'}
          </button>
        </Show>
      </div>
    </div>
  );
};

export default Oscilloscope;

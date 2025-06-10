import { Component, onMount, createSignal, onCleanup, Accessor, Show } from 'solid-js';
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

  // --- Internal State Management ---
  const [viewMode, setViewMode] = createSignal<ViewMode>('OSCILLOSCOPE');
  const [isLocked, setIsLocked] = createSignal(true);
  const [scrollingSamples, setScrollingSamples] = createSignal(2048); // Internal "zoom" for scrolling mode

  // --- FFT Specific Setup ---
  const fftSize = 4096;
  let fft: FFT | null = null;
  let freqDomainData: Float32Array | null = null;
  let hanningWindow: Float32Array | null = null;

  onMount(() => {
    if (!canvasRef) return;
    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;

    fft = new FFT(fftSize);
    freqDomainData = fft.createComplexArray();
    hanningWindow = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      hanningWindow[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
    }
    let animationId: number;

    // *** NEW: Helper function to draw the background grid ***
    const drawGrid = (ctx: CanvasRenderingContext2D) => {
      const width = ctx.canvas.width;
      const height = ctx.canvas.height;
      const gridSize = 20; // The spacing for the grid lines in pixels

      ctx.beginPath();
      ctx.strokeStyle = '#475569'; // A nice slate/gray-blue color for the grid
      ctx.lineWidth = 0.5; // Use thin lines for the grid

      // Draw vertical lines
      for (let x = gridSize; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }

      // Draw horizontal lines
      for (let y = gridSize; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }

      ctx.stroke();
    };


    const draw = () => {
      animationId = requestAnimationFrame(draw);
      const buffer = props.value?.();

      if (!canvasRef) return;
      const ctx = canvasRef.getContext('2d');
      if (!ctx) return;

      // 1. Clear the entire canvas
      ctx.clearRect(0, 0, canvasRef.width, canvasRef.height);

      // 2. Draw the background grid first
      drawGrid(ctx);

      // 3. Check for data and draw accordingly
      if (!buffer || buffer.length === 0) {
        // Draw a flat line if there's no data
        ctx.beginPath();
        ctx.moveTo(0, canvasRef.height / 2);
        ctx.lineTo(canvasRef.width, canvasRef.height / 2);
        ctx.strokeStyle = "#888";
        ctx.lineWidth = 1;
        ctx.stroke();
        return; // Exit after drawing the flat line
      }

      // 4. Draw the appropriate view on top of the grid
      if (viewMode() === 'OSCILLOSCOPE') {
        drawOscilloscope(ctx, buffer);
      } else {
        drawFFT(ctx, buffer);
      }
    };

    const drawOscilloscope = (ctx: CanvasRenderingContext2D, buffer: Float32Array) => {
      const width = ctx.canvas.width;
      const height = ctx.canvas.height;
      const notes = props.notes?.() ?? [];

      let view: Float32Array;

      // Locked Mode
      if (isLocked() && notes.length > 0) {
        const lowestNote = notes.reduce((min, n) => (n.noteNumber < min ? n.noteNumber : min), notes[0].noteNumber);
        const freq = midiNoteToFreq(lowestNote);
        const periodSamples = props.sampleRate() / freq;
        const desiredDisplayLength = Math.floor(periodSamples * 2);
        const displayLength = Math.min(desiredDisplayLength, buffer.length);

        const searchEnd = buffer.length - displayLength;
        let triggerIndex = findTriggerIndex(buffer, searchEnd > 0 ? searchEnd : 1);
        if (triggerIndex === -1) triggerIndex = 0;

        view = buffer.subarray(triggerIndex, triggerIndex + displayLength);

        // Scrolling (Unlocked) Mode
      } else {
        const displayLength = Math.min(scrollingSamples(), buffer.length);
        const startIndex = buffer.length - displayLength;
        view = buffer.subarray(startIndex);
      }

      // Drawing Logic
      if (view && view.length > 0) {
        const scaleY = height / 2;
        const mid = height / 2;
        const scaleX = width / view.length;
        ctx.beginPath();
        ctx.moveTo(0, mid - view[0] * scaleY);
        for (let i = 1; i < view.length; i++) {
          ctx.lineTo(i * scaleX, mid - view[i] * scaleY);
        }
        if (notes.length > 0) {
          ctx.strokeStyle = "#f506f7";
        } else {
          ctx.strokeStyle = "#a5e3ff";
        }
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    const drawFFT = (ctx: CanvasRenderingContext2D, buffer: Float32Array) => {
      if (!fft || !freqDomainData) return;

      const width = ctx.canvas.width;
      const height = ctx.canvas.height;

      // Data processing part remains identical
      const timeDomainData = buffer.slice(0, fftSize);
      if (!hanningWindow) return;
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

    animationId = requestAnimationFrame(draw);
    onCleanup(() => cancelAnimationFrame(animationId));
  });

  return (
    <div style={{ "display": "flex", "flex-direction": "column", "align-items": "center", "gap": "8px" }}>
      <canvas
        ref={(el) => (canvasRef = el)}
        id={props.id || 'oscilloscope'}
        width={props.width || 400}
        height={props.height || 150}
        style={{
          "background-color": "var(--dark-purple)",
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

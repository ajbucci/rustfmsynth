import { AppState, EnvelopeState, OperatorState } from './state';
import { NUM_OPERATORS } from './config';

export const DEFAULT_ENVELOPE_STATE: EnvelopeState = {
  attack: 0.001,
  decay: 1.0,
  sustain: 0.6,
  release: 0.1,
};


function createDefaultOperatorState(): OperatorState {
  return {
    ratio: 1.0,
    fixedFrequency: 0.0,
    detune: 0.0,
    modulationIndex: 10.0,
    waveform: 0,
    envelope: { ...DEFAULT_ENVELOPE_STATE },
    filters: [],
  };
}

/**
 * Creates the default algorithm matrix state.
 * Generates a NUM_OPERATORS x (NUM_OPERATORS + 1) matrix.
 * Sets only the element at row 0, last column (output) to 1.
 * All other elements are 0.
 *
 * @returns {number[][]} The default algorithm matrix.
 */
function createDefaultAlgorithmMatrixState(): number[][] {
  const rows = NUM_OPERATORS;
  const cols = NUM_OPERATORS + 1; // Add the output column
  const matrix: number[][] = [];

  for (let r = 0; r < rows; r++) {
    // Create a new row filled with zeros
    const row = Array(cols).fill(0);

    // Check if this is the first row (index 0)
    if (r === 0) {
      // Set the last element (output column) of the first row to 1
      row[cols - 1] = 1; // cols - 1 is the index of the last column
    }
    matrix.push(row);
  }
  return matrix;
}

// --- Main Default App State Factory ---

export function createDefaultAppState(): AppState {
  console.log("Creating default app state...");
  return {
    algorithm: createDefaultAlgorithmMatrixState(),
    operators: Array(NUM_OPERATORS).fill(null).map(() => createDefaultOperatorState()),
    masterVolume: 80.00,
  };
}

export function fillMissingAppState(partial: Partial<AppState>): AppState {
  const defaultState = createDefaultAppState();

  return {
    algorithm: fillMatrix(partial.algorithm, defaultState.algorithm),
    operators: fillOperators(partial.operators, defaultState.operators),
    masterVolume: partial.masterVolume ?? defaultState.masterVolume,
  };
}

function fillMatrix(
  partialMatrix: number[][] | undefined,
  defaultMatrix: number[][]
): number[][] {
  if (!Array.isArray(partialMatrix)) return defaultMatrix;

  const filled: number[][] = [];
  for (let r = 0; r < NUM_OPERATORS; r++) {
    const defaultRow = defaultMatrix[r];
    const row = partialMatrix[r] || [];
    const filledRow = defaultRow.map((val, i) => row[i] ?? val);
    filled.push(filledRow);
  }
  return filled;
}

function fillOperators(
  partialOps: Partial<OperatorState>[] | undefined,
  defaultOps: OperatorState[]
): OperatorState[] {
  const ops: OperatorState[] = [];
  for (let i = 0; i < NUM_OPERATORS; i++) {
    const partialOp = partialOps?.[i] ?? {};
    const defaultOp = defaultOps[i];
    ops.push({
      ratio: partialOp.ratio ?? defaultOp.ratio,
      fixedFrequency: partialOp.fixedFrequency ?? defaultOp.fixedFrequency,
      detune: partialOp.detune ?? defaultOp.detune,
      modulationIndex: partialOp.modulationIndex ?? defaultOp.modulationIndex,
      waveform: partialOp.waveform ?? defaultOp.waveform,
      filters: partialOp.filters ?? defaultOp.filters,
      envelope: {
        attack: partialOp.envelope?.attack ?? DEFAULT_ENVELOPE_STATE.attack,
        decay: partialOp.envelope?.decay ?? DEFAULT_ENVELOPE_STATE.decay,
        sustain: partialOp.envelope?.sustain ?? DEFAULT_ENVELOPE_STATE.sustain,
        release: partialOp.envelope?.release ?? DEFAULT_ENVELOPE_STATE.release,
      },
    });
  }
  return ops;
}

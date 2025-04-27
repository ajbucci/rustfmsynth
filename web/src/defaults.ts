import { AppState, EnvelopeState, OperatorState } from './state';
import { NUM_OPERATORS } from './config';

export const DEFAULT_ENVELOPE_STATE: EnvelopeState = {
  attack: 0.01,
  decay: 0.1,
  sustain: 0.8,
  release: 0.5,
};


function createDefaultOperatorState(): OperatorState {
  return {
    ratio: 1.0,
    fixedFrequency: 0.0,
    modulationIndex: 1.0,
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
  };
}

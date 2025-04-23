export interface EnvelopeState {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}
export interface LowPassFilterParams {
  cutoff: number;
  q: number;
}
export interface CombFilterParams {
  alpha: number;
  k: number;
}
export interface PitchedCombFilterParams {
  alpha: number;
}
export interface LowPassFilterState {
  type: "LowPass"; // The discriminator
  params: LowPassFilterParams;
}
export interface CombFilterState {
  type: "Comb";
  params: CombFilterParams;
}
export interface PitchedCombFilterState {
  type: "PitchedComb";
  params: PitchedCombFilterParams;
}
export type FilterState =
  | LowPassFilterState
  | CombFilterState
  | PitchedCombFilterState;
export interface OperatorState {
  ratio: number;
  modulationIndex: number;
  waveform: WaveformId;
  envelope: EnvelopeState;
  filters: FilterState[];
}
export interface Note {
  noteNumber: number;
  velocity: number;
  source: 'keyboard' | 'pointer' | 'midi' | string;
}
export interface AppState {
  algorithm: number[][];
  operators: OperatorState[];
}
export type WaveformName = 'sine' | 'saw' | 'square' | 'triangle' | 'noise' | 'input';
export const WAVEFORM_NAMES: ReadonlyArray<WaveformName> = ['sine', 'saw', 'square', 'triangle', 'noise', 'input'] as const;
export const WAVEFORM_IDS = {
  SINE: 0,
  TRIANGLE: 1,
  SQUARE: 2,
  SAW: 3,
  NOISE: 4,
  INPUT: 5
} as const;
export type WaveformId = typeof WAVEFORM_IDS[keyof typeof WAVEFORM_IDS];
export const WAVEFORM_ID_TO_NAME: { [key in WaveformId]: WaveformName } = {
  [WAVEFORM_IDS.SINE]: 'sine',
  [WAVEFORM_IDS.SAW]: 'saw',
  [WAVEFORM_IDS.SQUARE]: 'square',
  [WAVEFORM_IDS.TRIANGLE]: 'triangle',
  [WAVEFORM_IDS.NOISE]: 'noise',
  [WAVEFORM_IDS.INPUT]: 'input',
};

// Map string name to ID (useful when setting state from UI)
export const WAVEFORM_NAME_TO_ID: { [key in WaveformName]: WaveformId } = {
  sine: WAVEFORM_IDS.SINE,
  saw: WAVEFORM_IDS.SAW,
  square: WAVEFORM_IDS.SQUARE,
  triangle: WAVEFORM_IDS.TRIANGLE,
  noise: WAVEFORM_IDS.NOISE,
  input: WAVEFORM_IDS.INPUT,
};
export type EnvelopeParamInfo = {
  key: keyof EnvelopeState; // The property name in EnvelopeState ('attack', 'decay', etc.)
  label: string;            // Text for the <label> (e.g., "Attack:")
  min: number;              // Minimum allowed value for the input
  max: number;              // Maximum allowed value for the input
  step: number;             // Step increment for the input spinner
};
export const envelopeParamsInfo: ReadonlyArray<EnvelopeParamInfo> = [
  // Each object matches the EnvelopeParamInfo structure:
  { key: 'attack', label: 'Attack:', min: 0, max: 10, step: .001 },
  { key: 'decay', label: 'Decay:', min: 0, max: 10, step: .001 },
  { key: 'sustain', label: 'Sustain:', min: 0, max: 1, step: .001 },
  { key: 'release', label: 'Release:', min: 0, max: 10, step: .001 },
] as const;

export type FilterParamInfo = {
  name: string;      // UI Label: "Cutoff", "Alpha"
  id: string;        // Key in the corresponding FilterState['params'] object: "cutoff", "alpha"
  default: number;   // Default numeric value for adder/initial state
  min: number;       // Min value for input/clamping
  max: number;       // Max value for input/clamping
  step?: number;     // Input step suggestion
  unit?: string;     // UI Unit display: "Hz", "samples"
};
// Define structure for the main filter configuration object
export type FilterConfig = {
  name: string;       // Human-readable name for UI (e.g., dropdown)
  type: FilterState['type'];    // Unique identifier string matching FilterState['typeTag'] (e.g., "LowPass", "Comb")
  value: number | string; // A simple value potentially used for select dropdowns or simple backend messages (optional).
  params: ReadonlyArray<FilterParamInfo>; // Array defining the parameters for this filter type
};
export const FILTERS: ReadonlyArray<FilterConfig> = [
  {
    name: "Low Pass",
    type: "LowPass", // Matches LowPassFilterState['typeTag']
    value: 0, params: [
      { name: "Cutoff", id: "cutoff", default: 20000.0, min: 20.0, max: 20000.0, step: 1.0, unit: "Hz" },
      { name: "Q", id: "q", default: 0.707, min: 0.1, max: 10.0, step: 0.01, unit: "" }
    ]
  },
  {
    name: "Comb",
    type: "Comb", // Matches CombFilterState['typeTag']
    value: 1,
    params: [
      { name: "Alpha", id: "alpha", default: 0.5, min: -1.0, max: 1.0, step: 0.01, unit: "" },
      { name: "K", id: "k", default: 100, min: 1, max: 4096, step: 1, unit: "samples" }
    ]
  },
  {
    name: "Pitched Comb",
    type: "PitchedComb", // Matches PitchedCombFilterState['typeTag']
    value: 2,
    params: [
      { name: "Alpha", id: "alpha", default: 0.95, min: -1.0, max: 1.0, step: 0.01, unit: "" }
    ]
  },
] as const;

export function getFilterConfigByType(type: string): FilterConfig | undefined {
  return FILTERS.find(f => f.type === type);
}

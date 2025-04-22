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
  typeTag: "LowPass"; // The discriminator
  params: LowPassFilterParams;
}
export interface CombFilterState {
  typeTag: "Comb";
  params: CombFilterParams;
}
export interface PitchedCombFilterState {
  typeTag: "PitchedComb";
  params: PitchedCombFilterParams;
}
export type FilterState =
  | LowPassFilterState
  | CombFilterState
  | PitchedCombFilterState;
export interface OperatorState {
  ratio: number;
  modulationIndex: number;
  waveform: string;
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
  notesHeld: Note[];
}

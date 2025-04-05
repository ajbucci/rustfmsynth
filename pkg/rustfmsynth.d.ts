/* tslint:disable */
/* eslint-disable */
/**
 * WASM Synth runtime (no threads, no channels, direct API)
 */
export class WasmSynth {
  free(): void;
  constructor();
  /**
   * Render audio buffer into a JS-friendly Float32Array
   */
  render(length: number, sample_rate: number): Float32Array;
  note_on(note: number, velocity: number): void;
  note_off(note: number): void;
  set_operator_ratio(operator_index: number, ratio: number): void;
  /**
   * Set the waveform for a specific operator using an integer code from JS.
   * Mapping: 0: Sine, 1: Triangle, 2: Square, 3: Sawtooth, 4: Noise
   */
  set_operator_waveform(operator_index: number, waveform_value: number): void;
  set_operator_modulation_index(operator_index: number, modulation_index: number): void;
  set_buffer_size(buffer_size: number): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_wasmsynth_free: (a: number, b: number) => void;
  readonly wasmsynth_new: () => number;
  readonly wasmsynth_render: (a: number, b: number, c: number) => any;
  readonly wasmsynth_note_on: (a: number, b: number, c: number) => void;
  readonly wasmsynth_note_off: (a: number, b: number) => void;
  readonly wasmsynth_set_operator_ratio: (a: number, b: number, c: number) => void;
  readonly wasmsynth_set_operator_waveform: (a: number, b: number, c: number) => void;
  readonly wasmsynth_set_operator_modulation_index: (a: number, b: number, c: number) => void;
  readonly wasmsynth_set_buffer_size: (a: number, b: number) => void;
  readonly __wbindgen_export_0: WebAssembly.Table;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

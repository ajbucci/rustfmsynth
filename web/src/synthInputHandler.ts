import { resumeAudioContext } from './audio'; // We'll put resumeAudioContext in App.tsx initially
import { Note, WaveformId, AppState, FILTERS, ReverbParams, EffectSlot } from './state';
import { objToJsonBytes, stringToBytes } from './utils';
import { fillMissingAppState } from './defaults';

let processorPort: MessagePort | null = null;

export function initializeSynthInputHandler(port: MessagePort | null): void {
  if (!port) {
    console.error("SynthInputHandler: Received invalid port.");
    processorPort = null;
    return;
  }
  console.log("SynthInputHandler: Port connected.");
  processorPort = port;
}

// Simple fire-and-forget note on
export function noteOn(note: Note): void {
  if (!processorPort) {
    console.warn("SynthInputHandler: Port not connected, cannot send note_on.");
    return;
  }
  resumeAudioContext();
  try {
    processorPort.postMessage({ type: 'note_on', note: note.noteNumber, velocity: note.velocity });
  } catch (e) {
    console.error("SynthInputHandler: Error sending note_on:", e);
  }
}

// Simple fire-and-forget note off
export function noteOff(note: Note): void {
  if (!processorPort) {
    console.warn("SynthInputHandler: Port not connected, cannot send note_off.");
    return;
  }
  try {
    processorPort.postMessage({ type: 'note_off', note: note.noteNumber });
  } catch (e) {
    console.error("SynthInputHandler: Error sending note_off:", e);
  }
}

export function setAlgorithm(matrix: number[][]): void {
  if (!processorPort) {
    console.warn("SynthInputHandler: Port not connected, cannot set algorithm.");
    return;
  }
  try {
    processorPort.postMessage({ type: 'set_algorithm', matrix });
  } catch (e) {
    console.error("SynthInputHandler: Error setting algorithm:", e);
  }
}
export function setEffectReverb(reverbParams: ReverbParams, effectSlot: EffectSlot): void {
  if (!processorPort) {
    console.warn("SynthInputHandler: Port not connected, cannot set reverb.");
    return;
  }
  try {
    let encodedParams = objToJsonBytes(reverbParams);
    processorPort.postMessage({ type: 'set_effect_reverb', reverbParams: encodedParams, effectSlot: effectSlot });
  } catch (e) {
    console.error("SynthInputHandler: Error setting reverb:", e);
  }
}

export function setOperatorRatio(operatorIndex: number, ratio: number): void {
  if (!processorPort) {
    console.warn("SynthInputHandler: Port not connected, cannot set ratio.");
    return;
  }
  try {
    processorPort.postMessage({ type: 'set_operator_ratio', operatorIndex, ratio });
  } catch (e) {
    console.error("SynthInputHandler: Error setting ratio:", e);
  }
}
export function setOperatorFixedFrequency(operatorIndex: number, frequency: number): void {
  if (!processorPort) {
    console.warn("SynthInputHandler: Port not connected, cannot set fixed frequency.");
    return;
  }
  try {
    processorPort.postMessage({ type: 'set_operator_fixed_frequency', operatorIndex, frequency });
  } catch (e) {
    console.error("SynthInputHandler: Error setting fixed frequency:", e);
  }
}
export function setOperatorDetune(operatorIndex: number, detune: number): void {
  if (!processorPort) {
    console.warn("SynthInputHandler: Port not connected, cannot set detune.");
    return;
  }
  try {
    processorPort.postMessage({ type: 'set_operator_detune', operatorIndex, detune });
  } catch (e) {
    console.error("SynthInputHandler: Error setting fixed frequency:", e);
  }
}
export function setOperatorModIndex(operatorIndex: number, modIndex: number): void {
  if (!processorPort) {
    console.warn("SynthInputHandler: Port not connected, cannot set modulation index.");
    return;
  }
  try {
    // lets try scaling modIndex to make the knob more musical
    let modScaler = 2.0;
    let modScaled = 10.0 * Math.pow(modIndex / 10.0, modScaler);
    processorPort.postMessage({ type: 'set_operator_modulation_index', operatorIndex, modIndex: modScaled });
  } catch (e) {
    console.error("SynthInputHandler: Error setting modulation index:", e);
  }
}
export function setOperatorWaveform(operatorIndex: number, waveformId: WaveformId): void {
  if (!processorPort) {
    console.warn("SynthInputHandler: Port not connected, cannot set waveform.");
    return;
  }
  try {
    processorPort.postMessage({ type: 'set_operator_waveform', operatorIndex, waveformId });
  } catch (e) {
    console.error("SynthInputHandler: Error setting waveform:", e);
  }
}
export function setOperatorEnvelope(operatorIndex: number, attack: number, decay: number, sustain: number, release: number): void {
  if (!processorPort) {
    console.warn("SynthInputHandler: Port not connected, cannot set envelope.");
    return;
  }
  try {
    processorPort.postMessage({ type: 'set_operator_envelope', operatorIndex, attack, decay, sustain, release });
  } catch (e) {
    console.error("SynthInputHandler: Error setting envelope:", e);
  }
}

export function setOperatorFilter(operatorIndex: number, filterParams: Uint8Array): void {
  if (!processorPort) {
    console.warn("SynthInputHandler: Port not connected, cannot set filter.");
    return;
  }
  try {
    processorPort.postMessage({ type: 'set_operator_filter', operatorIndex, filterParams });
  } catch (e) {
    console.error("SynthInputHandler: Error setting filter:", e);
  }
}
export function removeOperatorFilter(operatorIndex: number, filterType: Uint8Array): void {
  if (!processorPort) {
    console.warn("SynthInputHandler: Port not connected, cannot set filter.");
    return;
  }
  try {
    processorPort.postMessage({ type: 'remove_operator_filter', operatorIndex, filterType });
  } catch (e) {
    console.error("SynthInputHandler: Error removing filter:", e);
  }
}
export function setMasterVolume(volume: number): void {
  if (!processorPort) {
    console.warn("SynthInputHandler: Port not connected, cannot set volume.");
    return;
  }
  try {
    const rangeDb = -60;
    const gainDb = rangeDb * (1 - volume / 100);
    const scaledVolume = Math.pow(10, gainDb / 20);
    processorPort.postMessage({ type: 'set_master_volume', volume: scaledVolume });
  } catch (e) {
    console.error("SynthInputHandler: Error setting volume:", e);
  }
}
/**
 * Sends the entire application state to the synth worklet.
 * Assumes the synth worklet is ready and connected.
 * @param appState The complete state of the synthesizer.
 */
export function setSynthState(appState: AppState): void {
  console.log("SynthInputHandler: Setting full synth state...");

  if (!processorPort) {
    console.error("SynthInputHandler: Cannot set full state, port not connected.");
    return;
  }
  appState = fillMissingAppState(appState);

  // 0. Set Master Volume
  setMasterVolume(appState.masterVolume);
  // 1. Set Algorithm
  setAlgorithm(appState.algorithm);

  // 2. Set Operator States
  appState.operators.forEach((opState, index) => {
    console.log(`SynthInputHandler: Setting state for Operator ${index}`);

    // Set basic parameters
    setOperatorRatio(index, opState.ratio);
    if (opState.fixedFrequency !== 0) {
      setOperatorFixedFrequency(index, opState.fixedFrequency);
    }
    setOperatorModIndex(index, opState.modulationIndex);
    setOperatorWaveform(index, opState.waveform);

    // Set envelope
    setOperatorEnvelope(index, opState.envelope.attack, opState.envelope.decay, opState.envelope.sustain, opState.envelope.release); // Use the state object directly

    // --- Filter Synchronization ---
    // a) Remove all known filter types for this operator first
    //    This ensures a clean slate before adding the current ones.
    FILTERS.forEach(filterConfig => {
      const encodedType = stringToBytes(filterConfig.type);
      if (encodedType) {
        removeOperatorFilter(index, encodedType);
      }
    });

    // b) Add/Set the filters defined in the current state
    opState.filters.forEach(filterState => {
      const encodedParams = objToJsonBytes(filterState);
      if (encodedParams) {
        setOperatorFilter(index, encodedParams);
      } else {
        console.warn(`SynthInputHandler: Failed to encode parameters for filter type ${filterState.type} on operator ${index}`);
      }
    });
  });

  console.log("SynthInputHandler: Full synth state update complete.");
}

import init, { WasmSynth } from "./pkg/rustfmsynth.js";

let synth = null;
let ready = false;
let sampleRate = 44100;
const SCOPE_DATA_CHUNK_SIZE = 4096;
class SynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._scope_accumulator = new Float32Array(0);
    this.port.onmessage = async (event) => {
      const data = event.data;

      if (data.type === "init" && data.wasmBinary) {
        sampleRate = data.sampleRate;

        try {
          console.log("SynthProcessor: Received Wasm binary, initializing...");
          // Initialize Wasm *inside* the worklet using the received ArrayBuffer
          // Wrap the buffer in a plain object to satisfy the init function's check
          await init({ module_or_path: data.wasmBinary });
          console.log("SynthProcessor: Wasm initialized successfully.");

          synth = new WasmSynth(sampleRate);
          ready = true;
          console.log("SynthProcessor: WasmSynth instance created.");

          this.port.postMessage({ type: 'initialized' });
        } catch (e) {
          console.error("SynthProcessor: Error initializing Wasm or creating WasmSynth instance:", e);
          ready = false;
          this.port.postMessage({ type: 'init_error', error: e.message })
        }
        return
      }

      if (!synth || !ready) {
        console.warn(`SynthProcessor: Received message but synth is not ready or does not exist. Ignoring: `, data);
        return;
      }
      try {
        // console.log(data);
        switch (data.type) {
          case "note_on":
            synth.note_on(data.note, data.velocity);
            break;
          case "note_off":
            synth.note_off(data.note);
            break;
          case "set_master_volume":
            synth.set_master_volume(data.volume);
            break;
          case "set_effect_reverb":
            synth.set_effect_reverb(data.reverbParams, data.effectSlot);
            break;
          case "set_operator_ratio":
            synth.set_operator_ratio(data.operatorIndex, data.ratio);
            break;
          case "set_operator_fixed_frequency":
            synth.set_operator_fixed_frequency(data.operatorIndex, data.frequency);
            break;
          case "set_operator_detune":
            synth.set_operator_detune(data.operatorIndex, data.detune);
            break;
          case "set_operator_waveform":
            synth.set_operator_waveform(data.operatorIndex, data.waveformId);
            break;
          case "set_operator_modulation_index":
            synth.set_operator_modulation_index(data.operatorIndex, data.modIndex);
            break;
          case "set_operator_envelope":
            synth.set_operator_envelope(data.operatorIndex, data.attack, data.decay, data.sustain, data.release);
            break;
          case "set_operator_filter":
            // Assuming filterParams is directly on data, not nested payload? Adjust if needed.
            synth.set_operator_filter(data.operatorIndex, data.filterParams);
            break;
          case "remove_operator_filter":
            // Assuming filterType is directly on data? Adjust if needed.
            synth.remove_operator_filter(data.operatorIndex, data.filterType);
            break;
          case "set_algorithm":
            synth.set_algorithm(data.matrix);
            break;
          default:
            console.warn("SynthProcessor: Received unknown message type: ", data.type, data)
        }
      } catch (e) {
        console.error(`SynthProcessor: Error processing message type '${data.type}':`, e, "Data:", data);
        this.port.postMessage({ type: 'processing_error', messageType: data.type, error: e.message });
      }
    };
    this.port.onmessageerror = (event) => {
      console.error("SynthProcessor: Error deserializing message:", event);
    };
  }

  process(inputs, outputs, parameters) {
    if (!ready || !synth) return true;

    const outputChannel = outputs[0][0];
    const bufferLength = outputChannel.length;

    const rendered = synth.render(bufferLength, sampleRate);

    outputChannel.set(rendered);

    const newAccumulator = new Float32Array(this._scope_accumulator.length + rendered.length);
    newAccumulator.set(this._scope_accumulator, 0);
    newAccumulator.set(rendered, this._scope_accumulator.length);
    this._scope_accumulator = newAccumulator;
    if (this._scope_accumulator.length >= SCOPE_DATA_CHUNK_SIZE) {
      this.port.postMessage({ type: 'output', data: this._scope_accumulator });
      this._scope_accumulator = new Float32Array(0);
    }

    return true;
  }
}

registerProcessor("synth-processor", SynthProcessor);

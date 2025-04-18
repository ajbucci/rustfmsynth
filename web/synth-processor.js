import init, { WasmSynth } from "./pkg/rustfmsynth.js";

let synth = null;
let ready = false;
let sampleRate = 44100;

// TODO: clean this up. remove redundant checks
class SynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = async (event) => {
      const data = event.data;
      const payload = data.payload; // Often data is nested under payload

      if (data.type === "init" && data.wasmBinary) {
        sampleRate = data.sampleRate;

        try {
          console.log("SynthProcessor: Received Wasm binary, initializing...");
          // Initialize Wasm *inside* the worklet using the received ArrayBuffer
          // Wrap the buffer in a plain object to satisfy the init function's check
          await init({ module_or_path: data.wasmBinary });
          console.log("SynthProcessor: Wasm initialized successfully.");

          // Now create the synth instance
          synth = new WasmSynth();
          ready = true;
          console.log("SynthProcessor: WasmSynth instance created.");

          // Send confirmation back to the main thread
          this.port.postMessage({ type: 'initialized' });

        } catch (e) {
          console.error("SynthProcessor: Error initializing Wasm or creating WasmSynth instance:", e);
          ready = false;
        }
        return
      }

      if (!synth || !ready) {
        console.warn(`SynthProcessor: Received message but synth is not ready or does not exist. Message not sent.`, data);
      }
      if (data.type === "note_on") {
        synth.note_on(data.note, data.velocity);
      } else if (data.type === "note_off") {
        synth.note_off(data.note);
      } else if (data.type === "set_operator_ratio") {
        // Validate inputs slightly before sending to Wasm? (Optional)
        const opIndex = parseInt(payload?.operator_index ?? data.operator_index);
        const ratio = parseFloat(payload?.ratio ?? data.ratio);
        if (!isNaN(opIndex) && isFinite(ratio) && opIndex >= 0 && opIndex < 6) { // Basic check
          console.log(`SynthProcessor: Setting operator ${opIndex} ratio to ${ratio}`);
          synth.set_operator_ratio(opIndex, ratio);
        } else {
          console.warn(`SynthProcessor: Invalid set_operator_ratio data received:`, data);
        }
      } else if (data.type === "set_operator_waveform") {
        const opIndex = parseInt(payload?.operator_index ?? data.operator_index);
        const waveformInt = parseInt(payload?.waveform_value ?? data.waveform_value);

        if (!isNaN(opIndex) && !isNaN(waveformInt) && opIndex >= 0 && opIndex < 6 && waveformInt >= 0 && waveformInt <= 4) {
          console.log(`SynthProcessor: Setting operator ${opIndex} waveform to ${waveformInt}`);
          try {
            synth.set_operator_waveform(opIndex, waveformInt);
          } catch (e) {
            console.error(`SynthProcessor: Error calling synth.set_operator_waveform(${opIndex}, ${waveformInt})`, e);
          }
        } else {
          console.warn(`SynthProcessor: Invalid set_operator_waveform data received:`, data);
        }
      } else if (data.type === "set_operator_modulation_index") {
        const opIndex = parseInt(payload?.operator_index ?? data.operator_index);
        const modIndex = parseFloat(payload?.modulation_index ?? data.modulation_index);

        // Basic validation
        if (!isNaN(opIndex) && isFinite(modIndex) && opIndex >= 0 && opIndex < 6) { // Assuming 4 operators
          console.log(`SynthProcessor: Setting operator ${opIndex} modulation index to ${modIndex}`);
          try {
            synth.set_operator_modulation_index(opIndex, modIndex);
          } catch (e) {
            console.error(`SynthProcessor: Error calling synth.set_operator_modulation_index(${opIndex}, ${modIndex})`, e);
          }
        } else {
          console.warn(`SynthProcessor: Invalid set_operator_modulation_index data received:`, data);
        }
      } else if (data.type === "set_operator_envelope") {
        const opIndex = parseInt(payload?.operator_index ?? data.operator_index);
        const a = parseFloat(payload?.attack ?? data.attack);
        const d = parseFloat(payload?.decay ?? data.decay);
        const s = parseFloat(payload?.sustain ?? data.sustain);
        const r = parseFloat(payload?.release ?? data.release);
        try {
          synth.set_operator_envelope(opIndex, a, d, s, r);
        } catch (e) {
          console.error(`SynthProcessor: Error calling synth.set_operator_envelope`)
        }
      } else if (data.type === "set-algorithm") {
        const combinedMatrix = data.matrix; // Payload is the combined matrix
        if (Array.isArray(combinedMatrix)) {
          console.log("SynthProcessor: Received set-algorithm combined matrix:", combinedMatrix);
          try {
            // Pass the combined matrix directly to the Wasm function
            // NOTE: Assumes Wasm binding accepts this structure (likely via JsValue)
            synth.set_algorithm(combinedMatrix);
            console.log("SynthProcessor: Algorithm updated successfully via combined matrix.");
          } catch (e) {
            console.error("SynthProcessor: Error calling synth.set_algorithm:", e, "with matrix:", combinedMatrix);
          }
        } else {
          console.warn("SynthProcessor: Received set-algorithm but synth not ready or payload is not a valid matrix.", { ready, synthExists: !!synth, payloadExists: !!combinedMatrix });
        }
      } else {
        console.warn("SynthProcessor: Received unknown message type:", data.type, data);
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!ready || !synth) return true;

    const outputChannel = outputs[0][0];
    const bufferLength = outputChannel.length;

    const rendered = synth.render(bufferLength, sampleRate);

    outputChannel.set(rendered);

    return true;
  }
}

registerProcessor("synth-processor", SynthProcessor);

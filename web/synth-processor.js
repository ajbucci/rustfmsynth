import init, { WasmSynth } from "./pkg/rustfmsynth.js";

let synth = null;
let ready = false;
let sampleRate = 44100;

class SynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
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

      } else if (data.type === "note_on") {
        if (synth && ready) {
          synth.note_on(data.note, data.velocity);
        } else {
          console.warn("SynthProcessor: Note_on ignored - synth not ready.");
        }
      } else if (data.type === "note_off") {
        if (synth && ready) {
          synth.note_off(data.note);
        } else {
           console.warn("SynthProcessor: Note_off ignored - synth not ready.");
        }
      } else if (data.type === "set_operator_ratio") {
        if (synth && ready) {
          // Validate inputs slightly before sending to Wasm? (Optional)
          const opIndex = parseInt(data.operator_index);
          const ratio = parseFloat(data.ratio);
          if (!isNaN(opIndex) && isFinite(ratio) && opIndex >= 0 && opIndex < 4) { // Basic check
             console.log(`SynthProcessor: Setting operator ${opIndex} ratio to ${ratio}`);
             synth.set_operator_ratio(opIndex, ratio);
          } else {
             console.warn(`SynthProcessor: Invalid set_operator_ratio data received:`, data);
          }
        } else {
          console.warn("SynthProcessor: Received set_operator_ratio but synth not ready.");
        }
      } else if (data.type === "set_operator_waveform") {
        if (synth && ready) {
          const opIndex = parseInt(data.operator_index);
          const waveformInt = parseInt(data.waveform_value);

          if (!isNaN(opIndex) && !isNaN(waveformInt) && opIndex >= 0 && opIndex < 4 && waveformInt >= 0 && waveformInt <= 4) {
             console.log(`SynthProcessor: Setting operator ${opIndex} waveform to ${waveformInt}`);
             try {
                 synth.set_operator_waveform(opIndex, waveformInt);
             } catch (e) {
                 console.error(`SynthProcessor: Error calling synth.set_operator_waveform(${opIndex}, ${waveformInt})`, e);
             }
          } else {
             console.warn(`SynthProcessor: Invalid set_operator_waveform data received:`, data);
          }
        } else {
          console.warn("SynthProcessor: Received set_operator_waveform but synth not ready.");
        }
      } else if (data.type === "set_operator_modulation_index") {
        if (synth && ready) {
          const opIndex = parseInt(data.operator_index);
          const modIndex = parseFloat(data.modulation_index);

          // Basic validation
          if (!isNaN(opIndex) && isFinite(modIndex) && opIndex >= 0 && opIndex < 4) { // Assuming 4 operators
             console.log(`SynthProcessor: Setting operator ${opIndex} modulation index to ${modIndex}`);
             try {
                 synth.set_operator_modulation_index(opIndex, modIndex);
             } catch (e) {
                 console.error(`SynthProcessor: Error calling synth.set_operator_modulation_index(${opIndex}, ${modIndex})`, e);
             }
          } else {
             console.warn(`SynthProcessor: Invalid set_operator_modulation_index data received:`, data);
          }
        } else {
          console.warn("SynthProcessor: Received set_operator_modulation_index but synth not ready.");
        }
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

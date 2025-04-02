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
        if (synth) {
          synth.note_on(data.note, data.velocity);
        } else {
          console.warn("SynthProcessor: Received note_on but synth not ready.");
        }
      } else if (data.type === "note_off") {
        if (synth) {
          synth.note_off(data.note);
        } else {
           console.warn("SynthProcessor: Received note_off but synth not ready.");
        }
      } else if (data.type === "cycle_waveform") {
        if (synth) {
          // Ensure direction_code is either 0 or 1, matching Rust expectation
          const event_code = data.direction_code === 0 ? 0 : 1;
          console.log(`SynthProcessor: Received cycle_waveform, direction code: ${event_code}`);
          synth.process_operator_event(event_code);
        } else {
           console.warn("SynthProcessor: Received cycle_waveform but synth not ready.");
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

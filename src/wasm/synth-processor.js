import init, { WasmSynth } from "./pkg/rustfmsynth.js";

let synth = null;
let ready = false;
let tempBuffer = [];
let samplesPerRender = 128;
let samplesPerBatch = 512;
let sampleRate = 44100;

class SynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = async (event) => {
      const data = event.data;
      if (data.type === "init") {
        sampleRate = data.sampleRate;
        samplesPerBatch = data.bufferSize || 512;
        samplesPerRender = 128;

        await init();
        synth = new WasmSynth();
        synth.set_buffer_size(samplesPerBatch);
        ready = true;
      } else if (data.type === "note_on") {
        synth.note_on(data.note, data.velocity);
      } else if (data.type === "note_off") {
        synth.note_off(data.note);
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!ready) return true;

    const output = outputs[0][0]; // mono for now
    if (tempBuffer.length === 0) {
      // Request next batch from synth
      const rendered = synth.render(samplesPerBatch, sampleRate);
      tempBuffer = Array.from(rendered); // copy out of wasm memory
    }

    for (let i = 0; i < samplesPerRender; i++) {
      output[i] = tempBuffer.shift() || 0.0;
    }

    return true;
  }
}

registerProcessor("synth-processor", SynthProcessor);

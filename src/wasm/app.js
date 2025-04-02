import init, { WasmSynth } from "./pkg/rustfmsynth.js";

let synth;
let audioContext;
let processorNode;

async function startSynth() {
  await init();
  synth = new WasmSynth();

  audioContext = new AudioContext();
  await audioContext.audioWorklet.addModule("synth-processor.js");

  processorNode = new AudioWorkletNode(audioContext, "synth-processor");
  processorNode.port.onmessage = (event) => {
    if (event.data.type === "request") {
      const buffer = synth.render(event.data.bufferSize, event.data.sampleRate);
      processorNode.port.postMessage({
        type: "buffer",
        buffer,
      });
    }
  };

  processorNode.connect(audioContext.destination);
}

document.getElementById("note-on").addEventListener("click", () => {
  if (!synth) startSynth().then(() => synth.note_on(63, 100));
  else synth.note_on(63, 100);
});

document.getElementById("note-off").addEventListener("click", () => {
  if (synth) synth.note_off(63);
});

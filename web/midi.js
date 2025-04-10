import { tryEnsureSynthAndSendMessage } from "./keyboard-input.js";
const noteOnStart = 144;
const noteOnEnd = 159;
const noteOffStart = 128;
const noteOffEnd = 143;
const eventCode = 'MIDI';
// TODO: add midi selector that resumes audio context when device selected
export class MidiInputHandler {
  constructor(processorPort) {
    this.midiAccess = null;
    this.input = null;
    this.processorPort = processorPort;
    this.init();
  }

  async init() {
    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      console.log("MIDI access granted.");
      this.setupMidiInput();
    } catch (error) {
      console.error("Failed to get MIDI access:", error);
    }
  }

  setupMidiInput() {
    const inputs = this.midiAccess.inputs;
    inputs.forEach((input) => {
      input.onmidimessage = this.handleMidiMessage.bind(this);
      console.log(`MIDI input connected: ${input.name}`);
    });
  }

  handleMidiMessage(event) {
    console.log("MIDI message received:", event.data);
    const [midiCode, noteCode, velocity] = event.data;
    if (midiCode >= noteOffStart && midiCode <= noteOffEnd) {
      tryEnsureSynthAndSendMessage(eventCode, { type: "note_off", note: noteCode, velocity: velocity });
    } else if (midiCode >= noteOnStart && midiCode <= noteOnEnd) {
      tryEnsureSynthAndSendMessage(eventCode, { type: "note_on", note: noteCode, velocity: velocity });
    }
    // Process the MIDI message here
  }
}

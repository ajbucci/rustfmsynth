import * as SynthInputHandler from './synthInputHandler';
import { Note } from './state'; // Import Note type

// Standard MIDI Command Nibbles (Upper 4 bits)
const NOTE_OFF_COMMAND = 0x80; // 128
const NOTE_ON_COMMAND = 0x90;  // 144
// const CC_COMMAND = 0xB0; // Example for later: Control Change

export class MidiInputHandler {
  private midiAccess: MIDIAccess | null = null;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    if (!navigator.requestMIDIAccess) {
      console.warn("Web MIDI API not supported.");
      return;
    }
    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      console.log("MIDI access granted.");
      this.setupMidiInput();
    } catch (error) {
      console.error("Failed to get MIDI access:", error);
    }
  }

  private setupMidiInput(): void {
    if (!this.midiAccess) return;
    const inputs: MIDIInputMap = this.midiAccess.inputs;
    if (inputs.size === 0) {
      console.log("No MIDI input devices found.");
      return;
    }
    inputs.forEach((input: MIDIInput) => {
      input.onmidimessage = this.handleMidiMessage.bind(this);
      console.log(`MIDI input connected: ${input.name}`);
    });
  }

  private handleMidiMessage(event: MIDIMessageEvent): void {
    if (!event.data || event.data.length < 3) {
      return;
    }

    const [statusByte, noteNumber, velocity] = event.data;
    // Extract the command (upper 4 bits)
    const command = statusByte & 0xF0;
    // Optional: Extract channel (lower 4 bits)
    // const channel = statusByte & 0x0F;

    if (command === NOTE_OFF_COMMAND || (command === NOTE_ON_COMMAND && velocity === 0)) {
      const noteOffEvent: Note = { noteNumber: noteNumber, velocity: 0, source: 'midi' };
      SynthInputHandler.noteOff(noteOffEvent);

    } else if (command === NOTE_ON_COMMAND) {
      const noteOnEvent: Note = { noteNumber: noteNumber, velocity: velocity, source: 'midi' };
      SynthInputHandler.noteOn(noteOnEvent);
    }
    // else if (command === CC_COMMAND) {
    //    // Handle Control Change later if needed
    // }
    // else {
    //    console.log(`Ignoring MIDI command: ${command.toString(16)}`);
    // }
  }
}

import { resumeAudioContext } from './audio'; // We'll put resumeAudioContext in App.tsx initially
import { Note } from './state';

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

import { pressKey, releaseKey } from './keyboard-ui.js'; // Import UI functions
import { ensureSynthStarted } from './app.js'; // Import synth starter

// Map JavaScript event.code to MIDI note numbers (similar to Rust key_to_note)
const keyToNoteMap = new Map([
  // Bottom row - natural notes (A3 to C5)
  ['KeyA', 57], // A3
  ['KeyS', 59], // B3
  ['KeyD', 60], // C4
  ['KeyF', 62], // D4
  ['KeyG', 64], // E4
  ['KeyH', 65], // F4
  ['KeyJ', 67], // G4
  ['KeyK', 69], // A4
  ['KeyL', 71], // B4
  ['Semicolon', 72], // C5
  // Top row - sharp/flat notes (A#3/Bb3 to C#5/Db5)
  ['KeyW', 58], // A#3/Bb3
  ['KeyR', 61], // C#4/Db4
  ['KeyT', 63], // D#4/Eb4
  ['KeyU', 66], // F#4/Gb4
  ['KeyI', 68], // G#4/Ab4
  ['KeyO', 70], // A#4/Bb4
  ['BracketLeft', 73], // C#5/Db5 - Note: Rust uses LeftBracket, JS maps this too
]);

// Keep track of currently pressed keys to prevent repeats from OS auto-repeat
const pressedKeys = new Set();

let processorPort = null; // Will be set by setupKeyboardInput

// Helper function to ensure synth is ready and send a message - Exported
export async function tryEnsureSynthAndSendMessage(eventCode, message) { 
  try {
    await ensureSynthStarted();
    if (!processorPort) {
      console.error(`tryEnsureSynthAndSendMessage (${eventCode}): processorPort not available after ensureSynthStarted.`);
      return false; // Indicate failure
    }
    processorPort.postMessage(message);
    console.log(`Sent message for ${eventCode}:`, message); // Log message on success
    return true; // Indicate success
  } catch (error) {
    console.error(`Error during ensureSynthStarted or postMessage for ${eventCode}:`, error);
    return false; // Indicate failure
  }
}

// Export the handler to be attached in app.js
export async function handleKeyDown(event) {
  if (event.repeat) {
    return; // Still ignore OS auto-repeat events
  }

  const eventCode = event.code;

  const note = keyToNoteMap.get(eventCode);
  if (note !== undefined) {
    event.preventDefault(); // Prevent default immediately for mapped note keys
    if (!pressedKeys.has(eventCode)) {
        pressedKeys.add(eventCode);
        pressKey(eventCode); // Apply visual feedback immediately
        const message = { type: 'note_on', note: note, velocity: 100 };
        const success = await tryEnsureSynthAndSendMessage(eventCode, message);
        if (!success) {
          // If sending failed, revert state
          pressedKeys.delete(eventCode);
          releaseKey(eventCode);
          console.warn(`Failed to send note_on for ${eventCode}`);
        }
    }
    return; // Don't process as control key if it was a note key
  }

  if (eventCode === 'Comma') {
    event.preventDefault(); // Prevent default immediately
    if (!pressedKeys.has(eventCode)){
        pressedKeys.add(eventCode);
        pressKey(eventCode);
        const message = { type: 'cycle_waveform', direction_code: 0 };
        const success = await tryEnsureSynthAndSendMessage(eventCode, message);
        if (!success) {
          pressedKeys.delete(eventCode);
          releaseKey(eventCode);
          console.warn(`Failed to send cycle_waveform (0) for ${eventCode}`);
        }
    }
    return; // Don't process as Period key
  }
  
  if (eventCode === 'Period') {
    event.preventDefault(); // Prevent default immediately
    if (!pressedKeys.has(eventCode)) {
        pressedKeys.add(eventCode);
        pressKey(eventCode);
        const message = { type: 'cycle_waveform', direction_code: 1 };
        const success = await tryEnsureSynthAndSendMessage(eventCode, message);
        if (!success) {
          pressedKeys.delete(eventCode);
          releaseKey(eventCode);
          console.warn(`Failed to send cycle_waveform (1) for ${eventCode}`);
        }
    }
  }
}

// Export the handler to be attached in app.js
export async function handleKeyUp(event) {
  const eventCode = event.code;
  
  // Handle Note Keys Release
  const note = keyToNoteMap.get(eventCode);
  if (note !== undefined) {
    event.preventDefault(); // Prevent default immediately for mapped note keys
    if (pressedKeys.has(eventCode)) {
        pressedKeys.delete(eventCode);
        releaseKey(eventCode);
        
        // Use the helper function to ensure synth is ready and send note_off
        const message = { type: 'note_off', note: note };
        const success = await tryEnsureSynthAndSendMessage(eventCode, message);
        if (!success) {
            // Log error if ensureSynthStarted fails or sending fails
            console.warn(`handleKeyUp ${eventCode}: Failed attempt to send note_off.`);
        }
    }
    return; // Don't process as control key if it was a note key
  }

   if (eventCode === 'Comma' || eventCode === 'Period') {
       event.preventDefault(); // Prevent default immediately
       if (pressedKeys.has(eventCode)) {
            pressedKeys.delete(eventCode);
            releaseKey(eventCode);
       }
    }
}

/**
 * Sets up the keyboard event listeners and stores the processor port.
 * @param {MessagePort} port - The MessagePort of the AudioWorkletNode.
 */
export function setupKeyboardInput(port) {
  if (!port) {
    console.error("Keyboard Input: Processor port is required for setup.");
    return;
  }
  processorPort = port;
  console.log("Keyboard input port stored.");
}

/**
 * Removes the keyboard event listeners.
 */
export function removeKeyboardInput() {
    processorPort = null; // Clear the port
    pressedKeys.clear(); // Clear pressed keys state
    console.log("Keyboard input port cleared and state reset.");
}
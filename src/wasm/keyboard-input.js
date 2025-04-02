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

function handleKeyDown(event) {
  if (!processorPort || event.repeat) {
    return; // Ignore if port not set or if it's an OS auto-repeat event
  }

  const note = keyToNoteMap.get(event.code);
  if (note !== undefined && !pressedKeys.has(event.code)) {
    pressedKeys.add(event.code);
    console.log(`Key '${event.code}' down, sending note_on: ${note}`);
    processorPort.postMessage({ type: 'note_on', note: note, velocity: 100 }); // Using fixed velocity 100
    event.preventDefault(); // Prevent default browser action for mapped keys
  }

  // Handle control keys (waveform cycle)
  if (event.code === 'Comma' && !pressedKeys.has(event.code)) {
      pressedKeys.add(event.code);
      console.log("Key 'Comma' down, sending cycle_waveform backward");
      // Send event code 0 for backward, matching WasmSynth::process_operator_event
      processorPort.postMessage({ type: 'cycle_waveform', direction_code: 0 });
      event.preventDefault();
  } else if (event.code === 'Period' && !pressedKeys.has(event.code)) { // Note: JS uses 'Period' for '.'
      pressedKeys.add(event.code);
      console.log("Key 'Period' down, sending cycle_waveform forward");
      // Send event code 1 for forward
      processorPort.postMessage({ type: 'cycle_waveform', direction_code: 1 });
      event.preventDefault();
  }
}

function handleKeyUp(event) {
  if (!processorPort) {
    return;
  }

  const note = keyToNoteMap.get(event.code);
  if (note !== undefined && pressedKeys.has(event.code)) {
    pressedKeys.delete(event.code);
    console.log(`Key '${event.code}' up, sending note_off: ${note}`);
    processorPort.postMessage({ type: 'note_off', note: note });
     event.preventDefault();
  }

   // Handle control keys release
   if ((event.code === 'Comma' || event.code === 'Period') && pressedKeys.has(event.code)) {
        pressedKeys.delete(event.code);
        event.preventDefault();
    }
}

/**
 * Sets up the keyboard event listeners and stores the processor port.
 * @param {MessagePort} port - The MessagePort of the AudioWorkletNode.
 */
export function setupKeyboardInput(port) {
  if (!port) {
    console.error("Keyboard Input: Processor port is required.");
    return;
  }
  processorPort = port;
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  console.log("Keyboard input listeners added.");
}

/**
 * Removes the keyboard event listeners.
 */
export function removeKeyboardInput() {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    processorPort = null; // Clear the port
    pressedKeys.clear(); // Clear pressed keys state
    console.log("Keyboard input listeners removed.");
}
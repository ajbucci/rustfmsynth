import { pressKey, releaseKey, keyboardLayout } from './keyboard-ui.js'; // Import UI functions
import { ensureSynthStarted } from './app.js'; // Import synth starter

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

  const note = keyboardLayout[eventCode].note;

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
}

// Export the handler to be attached in app.js
export async function handleKeyUp(event) {
  const eventCode = event.code;

  const note = keyboardLayout[eventCode].note;
  if (note !== undefined) {
    event.preventDefault(); // Prevent default immediately for mapped note keys
    // Check if we were tracking this key as pressed
    if (pressedKeys.has(eventCode)) {
      // Prepare the message first
      const message = { type: 'note_off', note: note };

      // Attempt to ensure synth is ready and send the message
      const success = await tryEnsureSynthAndSendMessage(eventCode, message);

      // --- Update state and UI AFTER the async operation ---
      pressedKeys.delete(eventCode); // Remove from tracking regardless of success
      releaseKey(eventCode);      // Update UI regardless of success

      if (!success) {
        // Log error if ensureSynthStarted fails or sending fails
        console.warn(`handleKeyUp ${eventCode}: Failed attempt to send note_off.`);
      }
    }
    return; // Don't process as control key if it was a note key
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

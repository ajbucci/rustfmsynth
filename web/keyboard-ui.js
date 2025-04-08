import { resumeAudioContext } from './app.js'; // Import synth starter and resumeAudioContext
// Import the shared helper function
import { tryEnsureSynthAndSendMessage } from './keyboard-input.js';

// Define the keyboard layout, notes, and key codes
// Matches the mapping in keyboard-input.js
function getNoteNameFromNote(noteNumber) {
  if (noteNumber < 0 || noteNumber > 127) {
    return ""
  }
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return noteNames[noteNumber % 12] + (Math.floor(noteNumber / 12) - 1);
}
function getKeyboardLayout(noteNumberStart = 48) {

  const keysSharps = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft'];
  const keysNatural = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'];

  let keyboardLayout = {};

  let sharpIndex = 0;
  let naturalIndex = 0;

  while (
    (!getNoteNameFromNote(noteNumberStart).includes("#") && naturalIndex < keysNatural.length) ||
    (getNoteNameFromNote(noteNumberStart).includes("#") && sharpIndex < keysSharps.length)
  ) {
    const noteName = getNoteNameFromNote(noteNumberStart);
    if (noteName.includes("#")) {
      const keyCode = keysSharps[sharpIndex++];
      const entry = { note: noteNumberStart, noteName, type: "black" };
      keyboardLayout[keyCode] = entry;
    } else {
      const keyCode = keysNatural[naturalIndex++];
      const entry = { note: noteNumberStart, noteName, type: "white" };
      keyboardLayout[keyCode] = entry;
      sharpIndex = naturalIndex;
    }
    noteNumberStart++;
  }
  return keyboardLayout;
}

export let keyboardLayout = getKeyboardLayout(); // Default layout
const keyboardContainer = document.getElementById('keyboard-container');
let processorPort = null; // Set by connectKeyboardUIPort
let noteNumberStart = 48;
const activeMouseKeys = new Set(); // Track keys pressed by mouse
// Function to generate keyboard HTML - Export this
export function generateKeyboard() {
  if (!keyboardContainer) {
    console.error("Keyboard UI: Container element not found.");
    return;
  }
  keyboardContainer.innerHTML = ''; // Clear previous content

  // Pull key widths directly from CSS
  const whiteKeyWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--white-key-width')) || 50; // Fallback to 50 if not found
  const blackKeyWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--black-key-width')) || 30; // Fallback to 30 if not found

  let whiteKeyIndex = 0; // Track only the index of white keys

  // Piano Keys
  // clamp noteNumberStart to 0-127
  noteNumberStart = Math.max(0, Math.min(127, noteNumberStart));
  keyboardLayout = getKeyboardLayout(noteNumberStart);
  // Must start on sharp if able:
  // check if Q is in mapping, if it isn't check if (KeyA.note - 1) is sharp
  // if it is, decrement noteNumberStart and call generateKeyboard again
  if (keyboardLayout['KeyQ'] === undefined && getNoteNameFromNote(keyboardLayout['KeyA'].note - 1).includes("#")) {
    noteNumberStart--;
    noteNumberStart = Math.max(0, Math.min(127, noteNumberStart));
    keyboardLayout = getKeyboardLayout(noteNumberStart);
  }

  const shiftKeysWidth = whiteKeyWidth;
  const shiftKeysLeft = document.createElement('button');
  shiftKeysLeft.classList.add('shift-keys');
  shiftKeysLeft.innerText = '←';
  shiftKeysLeft.addEventListener('click', () => {
    noteNumberStart--;
    generateKeyboard();
  });
  const shiftKeysRight = document.createElement('button');
  shiftKeysRight.classList.add('shift-keys');
  shiftKeysRight.innerText = '→';
  shiftKeysRight.addEventListener('click', () => {
    // when traveling up the keyboard increment by 2 to counteract the 'must start on sharp' rule
    noteNumberStart = noteNumberStart + 2;
    generateKeyboard();
  });

  keyboardContainer.appendChild(shiftKeysLeft);
  Object.entries(keyboardLayout)
    .sort((a, b) => a[1].note - b[1].note)  // Sort by note number
    .forEach(([keyCode, keyData]) => {
      const keyElement = document.createElement('div');
      keyElement.classList.add('key', keyData.type);
      keyElement.dataset.code = keyCode;
      keyElement.dataset.note = keyData.note;

      // Add labels
      const labelElement = document.createElement('div');
      labelElement.classList.add('key-label');
      labelElement.innerHTML = `<span class="note-name">${keyData.noteName}</span><span class="key-code">${keyCode.replace('Key', '').replace('Digit', '')}</span>`;
      keyElement.appendChild(labelElement);

      // Positioning
      if (keyData.type === 'white') {
        // White keys are positioned by flexbox, track their index
        keyboardContainer.appendChild(keyElement);
        whiteKeyIndex++;
      } else { // Black key
        // Calculate left position directly based on the preceding white key's position
        // Start position = (start of preceding white key) + (width of white key - overlap)
        // Note: whiteKeyIndex is 1-based relative to the start here.
        const precedingWhiteKeyStart = (whiteKeyIndex - 1) * whiteKeyWidth + shiftKeysWidth;
        const leftPosition = precedingWhiteKeyStart + (whiteKeyWidth - blackKeyWidth / 2);
        keyElement.style.left = `${leftPosition}px`;
        keyboardContainer.appendChild(keyElement);
        // DO NOT increment whiteKeyIndex here
      }

      // Mouse interaction listeners
      keyElement.addEventListener('mousedown', handleMouseDown);
      keyElement.addEventListener('mouseup', handleMouseUp);
      keyElement.addEventListener('mouseleave', handleMouseLeave);

      // Touch interaction listeners
      keyElement.addEventListener('touchstart', handleMouseDown);
      keyElement.addEventListener('touchend', handleMouseUp);
      keyElement.addEventListener('touchcancel', handleMouseUp);
      keyElement.addEventListener('touchleave', handleMouseUp);
    });
  keyboardContainer.appendChild(shiftKeysRight);

  console.log("Keyboard UI generated.");
}


// Mouse event handlers
async function handleMouseDown(event) {
  resumeAudioContext(); // Call resume early
  event.preventDefault();
  const keyElement = event.currentTarget;
  const note = parseInt(keyElement.dataset.note);
  const code = keyElement.dataset.code;

  if (!isNaN(note) && !activeMouseKeys.has(code)) {
    activeMouseKeys.add(code); // Update internal state
    keyElement.classList.add('active'); // Immediate visual feedback

    const message = { type: 'note_on', note: note, velocity: 100 };
    const success = await tryEnsureSynthAndSendMessage(code, message);

    if (!success) {
      keyElement.classList.remove('active');
      activeMouseKeys.delete(code);
      console.warn(`Failed to send note_on for mouse event ${code}`);
    }
  }
}

function handleMouseUp(event) {
  const keyElement = event.currentTarget;
  const note = parseInt(keyElement.dataset.note);
  const code = keyElement.dataset.code;

  if (!isNaN(note) && activeMouseKeys.has(code)) {
    activeMouseKeys.delete(code);
    if (processorPort) { // Only send if port exists
      processorPort.postMessage({ type: 'note_off', note: note });
    }

    // Handle visual state removal
    if (!keyElement.classList.contains('physical-press')) {
      keyElement.classList.remove('active');
    }
  }
}

// Handle case where mouse is dragged off the key while pressed down
function handleMouseLeave(event) {
  const keyElement = event.currentTarget;
  const code = keyElement.dataset.code;

  if (activeMouseKeys.has(code)) {
    handleMouseUp(event);
  }
}


// --- Functions for external control (from keyboard-input.js) ---

/**
 * Visually presses a key on the UI.
 * @param {string} keyCode The event.code of the key pressed.
 */
export function pressKey(keyCode) {
  const keyElement = document.querySelector(`.key[data-code="${keyCode}"]`);
  if (keyElement) {
    keyElement.classList.add('active');
    keyElement.classList.add('physical-press'); // Mark as physically pressed
  }
}

/**
 * Visually releases a key on the UI.
 * @param {string} keyCode The event.code of the key released.
 */
export function releaseKey(keyCode) {
  const keyElement = document.querySelector(`.key[data-code="${keyCode}"]`);
  if (keyElement) {
    keyElement.classList.remove('physical-press');
    // Only remove active class if not still held by mouse
    if (!activeMouseKeys.has(keyCode)) {
      keyElement.classList.remove('active');
    }
  }
}

/**
 * Stores the processor port to enable UI interactions.
 * @param {MessagePort} port - The MessagePort of the AudioWorkletNode.
 */
export function connectKeyboardUIPort(port) {
  if (!port) {
    console.error("Keyboard UI Connect: Processor port is required.");
    return;
  }
  processorPort = port;
  console.log("Keyboard UI port connected.");
}

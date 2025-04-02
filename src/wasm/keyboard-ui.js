// Define the keyboard layout, notes, and key codes
// Matches the mapping in keyboard-input.js
const keyboardLayout = [
  { code: 'KeyA', note: 57, noteName: 'A3', type: 'white' },
  { code: 'KeyW', note: 58, noteName: 'A#3', type: 'black' },
  { code: 'KeyS', note: 59, noteName: 'B3', type: 'white' },
  { code: 'KeyD', note: 60, noteName: 'C4', type: 'white' },
  { code: 'KeyR', note: 61, noteName: 'C#4', type: 'black' },
  { code: 'KeyF', note: 62, noteName: 'D4', type: 'white' },
  { code: 'KeyT', note: 63, noteName: 'D#4', type: 'black' },
  { code: 'KeyG', note: 64, noteName: 'E4', type: 'white' },
  { code: 'KeyH', note: 65, noteName: 'F4', type: 'white' },
  { code: 'KeyU', note: 66, noteName: 'F#4', type: 'black' },
  { code: 'KeyJ', note: 67, noteName: 'G4', type: 'white' },
  { code: 'KeyI', note: 68, noteName: 'G#4', type: 'black' },
  { code: 'KeyK', note: 69, noteName: 'A4', type: 'white' },
  { code: 'KeyO', note: 70, noteName: 'A#4', type: 'black' },
  { code: 'KeyL', note: 71, noteName: 'B4', type: 'white' },
  { code: 'Semicolon', note: 72, noteName: 'C5', type: 'white' },
  { code: 'BracketLeft', note: 73, noteName: 'C#5', type: 'black' },
];

const controlKeyLayout = [
  { code: 'Comma', label: 'Prev', type: 'control', direction_code: 0 },
  { code: 'Period', label: 'Next', type: 'control', direction_code: 1 },
];

const keyboardContainer = document.getElementById('keyboard-container');
let processorPort = null; // Set by connectKeyboardUIPort
const activeMouseKeys = new Set(); // Track keys pressed by mouse

// Function to generate keyboard HTML - Export this
export function generateKeyboard() {
  if (!keyboardContainer) {
      console.error("Keyboard UI: Container element not found.");
      return;
  }
  keyboardContainer.innerHTML = ''; // Clear previous content

  // TODO: pull from css or set directly
  const whiteKeyWidth = 50; // px - match CSS
  const blackKeyWidth = 30; // px - match CSS, need to pull from css directly

  let whiteKeyIndex = 0; // Track only the index of white keys

  // Piano Keys
  keyboardLayout.forEach((keyData) => {
    const keyElement = document.createElement('div');
    keyElement.classList.add('key', keyData.type);
    keyElement.dataset.code = keyData.code;
    keyElement.dataset.note = keyData.note;

    // Add labels
    const labelElement = document.createElement('div');
    labelElement.classList.add('key-label');
    labelElement.innerHTML = `<span class="note-name">${keyData.noteName}</span><span class="key-code">${keyData.code.replace('Key', '').replace('Digit', '')}</span>`;
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
      const precedingWhiteKeyStart = (whiteKeyIndex - 1) * whiteKeyWidth;
      const leftPosition = precedingWhiteKeyStart + (whiteKeyWidth - blackKeyWidth / 2);
      keyElement.style.left = `${leftPosition}px`;
      keyboardContainer.appendChild(keyElement);
      // DO NOT increment whiteKeyIndex here
    }

    // Mouse interaction listeners (Attached now, but handlers check for port)
    keyElement.addEventListener('mousedown', handleMouseDown);
    keyElement.addEventListener('mouseup', handleMouseUp);
    keyElement.addEventListener('mouseleave', handleMouseLeave);
  });

  // Control Keys (Waveform Cycle) - Append after piano keys
  controlKeyLayout.forEach(keyData => {
    const keyElement = document.createElement('div');
    keyElement.classList.add('key', 'white'); // Style as white key for simplicity
    keyElement.dataset.code = keyData.code;
    keyElement.dataset.direction_code = keyData.direction_code;
    keyElement.style.width = '60px';

    const labelElement = document.createElement('div');
    labelElement.classList.add('key-label');
    labelElement.innerHTML = `<span class="note-name">${keyData.label}</span><span class="key-code">${keyData.code === 'Comma' ? ',' : '.'}</span>`;
    keyElement.appendChild(labelElement);

    // Mouse interaction for control keys (Attached now)
    keyElement.addEventListener('mousedown', (e) => {
      if (!processorPort) return; // <-- Check if port is set
      const direction_code = parseInt(e.currentTarget.dataset.direction_code);
      console.log(`Control Key '${keyData.code}' clicked, sending cycle_waveform: ${direction_code}`);
      processorPort.postMessage({ type: 'cycle_waveform', direction_code: direction_code });
      e.currentTarget.classList.add('active');
    });
    keyElement.addEventListener('mouseup', (e) => {
      e.currentTarget.classList.remove('active');
    });
    keyElement.addEventListener('mouseleave', (e) => {
      e.currentTarget.classList.remove('active');
    });

    keyboardContainer.appendChild(keyElement);
  });
  console.log("Keyboard UI generated.");
}


// Mouse event handlers
function handleMouseDown(event) {
  if (!processorPort) return; // <-- Check if port is set
  const keyElement = event.currentTarget;
  const note = parseInt(keyElement.dataset.note);
  const code = keyElement.dataset.code;

  if (!isNaN(note) && !activeMouseKeys.has(code)) {
    activeMouseKeys.add(code);
    console.log(`Mouse down on key '${code}', sending note_on: ${note}`);
    processorPort.postMessage({ type: 'note_on', note: note, velocity: 100 });
    keyElement.classList.add('active'); // Also activate visual state
  }
}

function handleMouseUp(event) {
  if (!processorPort) return; // <-- Check if port is set
  const keyElement = event.currentTarget;
  const note = parseInt(keyElement.dataset.note);
  const code = keyElement.dataset.code;

  if (!isNaN(note) && activeMouseKeys.has(code)) {
    activeMouseKeys.delete(code);
    console.log(`Mouse up on key '${code}', sending note_off: ${note}`);
    processorPort.postMessage({ type: 'note_off', note: note });
    // Visual state updated by pressKey/releaseKey called from keyboard-input.js
    // We remove active class here only if the mouse up happens *before* keyboard release calls releaseKey
    if (!document.querySelector(`.key[data-code="${code}"]`).classList.contains('physical-press')) {
      keyElement.classList.remove('active');
    }
  }
}

// Handle case where mouse is dragged off the key while pressed down
function handleMouseLeave(event) {
  handleMouseUp(event); // Treat leaving the key same as mouse up
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
  console.log("Keyboard UI port connected, interactions enabled.");
}

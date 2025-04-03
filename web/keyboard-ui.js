import { ensureSynthStarted, resumeAudioContext } from './app.js'; // Import synth starter and resumeAudioContext
// Import the shared helper function
import { tryEnsureSynthAndSendMessage } from './keyboard-input.js'; 

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

  // Pull key widths directly from CSS
  const whiteKeyWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--white-key-width')) || 50; // Fallback to 50 if not found
  const blackKeyWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--black-key-width')) || 30; // Fallback to 30 if not found

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

  // Control Keys (Waveform Cycle)
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

    // Mouse interaction for control keys
    keyElement.addEventListener('mousedown', async (e) => {
      resumeAudioContext(); // Call resume early
      const targetElement = e.currentTarget;
      const eventCode = targetElement.dataset.code;
      const direction_code = parseInt(targetElement.dataset.direction_code);
      
      targetElement.classList.add('active'); // Immediate visual feedback

      const message = { type: 'cycle_waveform', direction_code: direction_code };
      const success = await tryEnsureSynthAndSendMessage(eventCode, message);

      if (!success) {
        targetElement.classList.remove('active');
        console.warn(`Failed to send cycle_waveform for mouse event ${eventCode}`);
      }
    });
    keyElement.addEventListener('mouseup', (e) => {
      e.currentTarget.classList.remove('active');
    });
    keyElement.addEventListener('mouseleave', (e) => {
      if (e.currentTarget.classList.contains('active')) {
          e.currentTarget.classList.remove('active');
      }
    });

    keyboardContainer.appendChild(keyElement);
  });
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
  console.log("Keyboard UI port connected."); // Changed log message
}

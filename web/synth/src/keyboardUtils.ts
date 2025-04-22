export interface KeyData {
  keyCode: string; // The keyboard event code (e.g., 'KeyA')
  note: number;
  noteName: string;
  type: 'white' | 'black';
}

// The main structure returned - includes the calculated keys and the *actual* start note used
export interface KeyboardLayout {
  keys: KeyData[];        // Array of key data objects, sorted by note
  actualStartNote: number; // The potentially adjusted start note used for generation
}

const NOTE_NAMES: ReadonlyArray<string> = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const KEYS_SHARPS: ReadonlyArray<string> = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft'];
const KEYS_NATURAL: ReadonlyArray<string> = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'];

export function getNoteNameFromNote(noteNumber: number): string {
  if (noteNumber < 0 || noteNumber > 127) return "";
  return NOTE_NAMES[noteNumber % 12] + (Math.floor(noteNumber / 12) - 1);
}

/**
 * Generates the keyboard layout data based on a starting note
 * @param requestedStartNote The desired starting MIDI note number (default 48).
 * @returns {KeyboardLayout} An object containing the array of keys and the actual start note used.
 */
export function getKeyboardLayoutData(requestedStartNote: number = 48): KeyboardLayout {

  let noteNumberToUse = Math.max(0, Math.min(127, requestedStartNote)); // Clamp initial request

  // First, generate a temporary layout to check the condition
  let tempLayoutCheck: { [key: string]: { note: number } } = {};
  let tempNoteCheck = noteNumberToUse;
  let tempSharpIndexCheck = 0;
  let tempNaturalIndexCheck = 0;
  while (
    (!getNoteNameFromNote(tempNoteCheck).includes("#") && tempNaturalIndexCheck < KEYS_NATURAL.length) ||
    (getNoteNameFromNote(tempNoteCheck).includes("#") && tempSharpIndexCheck < KEYS_SHARPS.length)
  ) {
    const noteName = getNoteNameFromNote(tempNoteCheck);
    if (noteName.includes("#")) {
      tempLayoutCheck[KEYS_SHARPS[tempSharpIndexCheck++]] = { note: tempNoteCheck };
    } else {
      tempLayoutCheck[KEYS_NATURAL[tempNaturalIndexCheck++]] = { note: tempNoteCheck };
      tempSharpIndexCheck = tempNaturalIndexCheck; // Original logic's index alignment
    }
    tempNoteCheck++;
  }

  const keyADataCheck = tempLayoutCheck['KeyA'];
  if (tempLayoutCheck['KeyQ'] === undefined && keyADataCheck && getNoteNameFromNote(keyADataCheck.note - 1).includes("#")) {
    noteNumberToUse--; // Adjust down by 1
    noteNumberToUse = Math.max(0, Math.min(127, noteNumberToUse)); // Re-clamp after adjustment
  }

  const actualStartNote = noteNumberToUse; // Store the final start note used
  const finalLayoutMap: { [key: string]: KeyData } = {}; // Build map first
  let currentNote = actualStartNote;
  let sharpIndex = 0;
  let naturalIndex = 0;

  // Generate the final layout using the adjusted start note
  while (
    (!getNoteNameFromNote(currentNote).includes("#") && naturalIndex < KEYS_NATURAL.length) ||
    (getNoteNameFromNote(currentNote).includes("#") && sharpIndex < KEYS_SHARPS.length)
  ) {
    const noteName = getNoteNameFromNote(currentNote);
    let keyCode: string = '';
    let type: 'white' | 'black' = 'white'; // Default required by TS

    if (noteName.includes("#")) {
      keyCode = KEYS_SHARPS[sharpIndex++];
      type = "black";
    } else {
      keyCode = KEYS_NATURAL[naturalIndex++];
      type = "white";
      sharpIndex = naturalIndex; // Original logic's index alignment
    }

    if (keyCode) { // Only add if a key code was assigned
      finalLayoutMap[keyCode] = {
        keyCode: keyCode,
        note: currentNote,
        noteName: noteName,
        type: type,
      };
    }
    currentNote++;
  }

  const keyDataArray = Object.entries(finalLayoutMap)
    .map(([keyCode, keyData]) => keyData) // Get just the KeyData objects
    .sort((a, b) => a.note - b.note);     // Sort by note number

  return { keys: keyDataArray, actualStartNote: actualStartNote };
}

import { Component, createSignal, createMemo, untrack, createEffect, For, onMount, onCleanup, JSX } from 'solid-js';
import { KeyData, KeyboardLayout, getKeyboardLayoutData } from '../keyboardUtils';
import * as SynthInputHandler from '../synthInputHandler';
import { Note } from '../state';

import '../style.css'; // Ensure path is correct

interface KeyboardUIProps {
  initialStartNote?: number;
}


// --- Component ---
const KeyboardUI: Component<KeyboardUIProps> = (props) => {
  const [activeNotes, setActiveNotes] = createSignal<Note[]>([]);
  const [startNote, setStartNote] = createSignal<number>(props.initialStartNote ?? 48);
  // Layout now includes the actualStartNote used for generation
  const [layoutData, setLayoutData] = createSignal<KeyboardLayout>({ keys: [], actualStartNote: props.initialStartNote ?? 48 });
  const [keyDimensions, setKeyDimensions] = createSignal({ whiteWidth: 10, blackWidth: 6 });

  // Effect to recalculate layout when startNote signal changes
  createEffect(() => {
    const data = getKeyboardLayoutData(startNote());
    const notesToStop: Note[] = untrack(() => activeNotes());

    if (notesToStop.length > 0) {
      console.log("Keyboard Shift: Stopping UI notes:", notesToStop);
      notesToStop.forEach(note => {
        SynthInputHandler.noteOff(note);
      });
      setActiveNotes([]);
    }

    setLayoutData(data);
    if (data.actualStartNote !== startNote()) {
      untrack(() => setStartNote(data.actualStartNote))
    }
  });


  onMount(() => {
    // Read CSS variables
    try {
      const computedStyle = getComputedStyle(document.documentElement);
      // Use parseFloat for potentially non-integer values (though unlikely for %)
      const whiteWidth = parseFloat(computedStyle.getPropertyValue('--white-key-width')) || 10;
      const blackWidth = parseFloat(computedStyle.getPropertyValue('--black-key-width')) || 6;
      setKeyDimensions({ whiteWidth, blackWidth });
    } catch (e) {
      console.error("Could not read key dimensions from CSS.", e)
    }
    // Add Physical Key Listeners
    window.addEventListener('keydown', handlePhysicalKeyDown);
    window.addEventListener('keyup', handlePhysicalKeyUp);
  });

  onCleanup(() => {
    // Remove Physical Key Listeners
    window.removeEventListener('keydown', handlePhysicalKeyDown);
    window.removeEventListener('keyup', handlePhysicalKeyUp);
    const notesToStop: Note[] = activeNotes();
    if (notesToStop.length > 0) {
      console.log("Keyboard Cleanup: Stopping UI notes:", notesToStop);
      notesToStop.forEach(note => {
        SynthInputHandler.noteOff(note);
      });
    }
  });
  const isNoteActive = (noteNum: number, source: Note['source']): boolean => {
    return activeNotes().some(n => n.noteNumber === noteNum && n.source === source);
  };

  // --- Event Handlers (Pointer/Touch/Physical - logic unchanged) ---
  const handlePointerDown = (keyData: KeyData, event: MouseEvent | TouchEvent): void => { /* ... as before ... */
    event.preventDefault();
    const { note, keyCode } = keyData;
    const velocity = 100;
    const source: Note['source'] = 'pointer';
    if (!isNoteActive(note, source)) {
      const newNote: Note = { noteNumber: note, velocity: velocity, source: source };
      // Add to notes store
      setActiveNotes([...activeNotes(), newNote]);
      // Send note on via handler
      SynthInputHandler.noteOn(newNote);
    }
  };
  const handlePointerUpOrLeave = (keyData: KeyData, event: MouseEvent | TouchEvent): void => { /* ... as before ... */
    const { note, keyCode } = keyData;
    const source: Note['source'] = 'pointer';
    if (isNoteActive(note, source)) {
      const newNote: Note = { noteNumber: note, velocity: 0, source: source };
      setActiveNotes(prev => prev.filter(n => !(n.noteNumber === note && n.source === source)));
      SynthInputHandler.noteOff(newNote);
    }
  };
  const handlePhysicalKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    const keyCode = event.code;
    const keyData = layoutData().keys.find(k => k.keyCode === keyCode);
    const velocity = 100;
    const source: Note['source'] = 'keyboard';

    if (keyData && !isNoteActive(keyData.note, source)) {
      event.preventDefault();
      const newNote: Note = { noteNumber: keyData.note, velocity: velocity, source: source };
      setActiveNotes([...activeNotes(), newNote]);
      SynthInputHandler.noteOn(newNote);
    }
  };

  const handlePhysicalKeyUp = (event: KeyboardEvent): void => {
    const keyCode = event.code;
    const keyData = layoutData().keys.find(k => k.keyCode === keyCode);
    const source: Note['source'] = 'keyboard';

    if (keyData && isNoteActive(keyData.note, source)) {
      const newNote: Note = { noteNumber: keyData.note, velocity: 0, source: source };
      setActiveNotes(prev => prev.filter(n => !(n.noteNumber === keyData.note && n.source === source)));
      SynthInputHandler.noteOff(newNote);
    }
  };


  // --- Shift Functions ---
  // Apply the EXACT logic from original vanilla JS click handlers
  const shiftLeft = (): void => {
    setStartNote(prev => prev - 1); // Request shift down by 1
  };

  const shiftRight = (): void => {
    // Replicate the "+ 2" logic from the original code directly here when requesting shift up
    setStartNote(prev => prev + 2);
  };


  // --- Rendering Logic ---
  // We need to calculate black key positions based on preceding white keys *within the current render*

  // Use createMemo to calculate positioned keys efficiently
  const positionedKeys = createMemo(() => {
    const keys = layoutData().keys; // Get reactive keys array
    const dims = keyDimensions(); // Get reactive dimensions
    let whiteKeyRenderIndex = 0; // Track index of white keys *as we iterate*
    const result = [];

    for (const keyData of keys) {
      let style: JSX.CSSProperties = {};
      if (keyData.type === 'black') {
        // Calculate position based on the *current* white key index
        const precedingWhiteKeyStart = (whiteKeyRenderIndex - 1) * dims.whiteWidth;
        const leftPosition = precedingWhiteKeyStart + (dims.whiteWidth - dims.blackWidth / 2);
        style = { left: `${leftPosition}%` };
      } else {
        whiteKeyRenderIndex++; // Increment index *after* processing a white key
      }
      result.push({ ...keyData, style }); // Add style to the data for rendering
    }
    return result;
  });

  const isKeyVisuallyActive = (keyCode: string): boolean => {
    const keyData = layoutData().keys.find(k => k.keyCode === keyCode);
    if (!keyData) return false;
    return activeNotes().some(n => n.noteNumber === keyData.note);
  };
  return (
    <div class="keyboard-outer-wrapper">
      <div id="bottom-row" class="bottom-row-controls">
        <button id="shift-keys-left" onClick={shiftLeft}>←</button>

        <div id="keyboard-container" class="keyboard-container">
          {/* Iterate over the memoized positionedKeys */}
          <For each={positionedKeys()}>
            {(keyDataWithStyle) => { // Now includes style
              const isActive = () => isKeyVisuallyActive(keyDataWithStyle.keyCode);

              return (
                <div
                  class={`key ${keyDataWithStyle.type}`}
                  classList={{ active: isActive() }}
                  data-code={keyDataWithStyle.keyCode}
                  data-note={keyDataWithStyle.note}
                  // Apply pre-calculated style
                  style={keyDataWithStyle.style}
                  onMouseDown={[handlePointerDown, keyDataWithStyle]} // Pass original data part
                  onMouseUp={[handlePointerUpOrLeave, keyDataWithStyle]}
                  onMouseLeave={[handlePointerUpOrLeave, keyDataWithStyle]}
                  onTouchStart={[handlePointerDown, keyDataWithStyle]}
                  onTouchEnd={[handlePointerUpOrLeave, keyDataWithStyle]}
                  onTouchCancel={[handlePointerUpOrLeave, keyDataWithStyle]}
                >
                  <div class="key-label">
                    <span class="note-name">{keyDataWithStyle.noteName}</span>
                    <span class="key-code">{keyDataWithStyle.keyCode.replace('Key', '').replace('Digit', '')}</span>
                  </div>
                </div>
              );
            }}
          </For>
        </div>

        <button id="shift-keys-right" onClick={shiftRight}>→</button>
      </div>
    </div>
  );
};

export default KeyboardUI;

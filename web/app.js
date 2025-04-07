import init from "./pkg/rustfmsynth.js"; // Import init here
import { setupKeyboardInput, removeKeyboardInput, handleKeyDown, handleKeyUp } from './keyboard-input.js'; // Import keyboard handler + handlers
import { generateKeyboard, connectKeyboardUIPort } from './keyboard-ui.js'; // Import keyboard UI functions
import { initializeOperatorControls, getOperatorStates, applyOperatorStatesUI, NUM_OPERATORS as OP_CONTROL_NUM, resetOperatorControlsUI } from './operator-controls.js'; // Import the new setup function and NUM_OPERATORS
// Import the new matrix functions
import {
  createAlgorithmMatrixUI,
  getAlgorithmFromMatrix,
  setupMatrixEventListeners,
  displayAlgorithm,
  resetAlgorithmMatrixUI
} from './algorithm-matrix.js';

let audioContext;
let processorNode;
let wasmBinary = null; // Store fetched WASM binary
let synthInitializationPromise = null; // Promise to track synth readiness (Wasm init + connect)
let audioSystemInitializationPromise = null; // Promise to track core audio setup

// Flag to track if the core audio setup is done (still useful for quick check)
let audioSystemInitialized = false;

// Use the number of operators defined in operator-controls.js or define globally
// Ensure this is consistent across your modules!
const NUM_OPERATORS = OP_CONTROL_NUM || 6; // Example: Use value from operator-controls or default to 6

const matrixContainer = document.getElementById('algorithm-matrix');
const operatorControlsContainer = document.getElementById('operator-controls');

// Flag to prevent updating the URL fragment while applying state from it
let isApplyingState = false;
let initialStateLoaded = null; // Store the loaded initial state here
let initialStateSentToWorklet = false; // <-- New Flag

// Add this new exported function
/**
 * Attempts to resume the AudioContext if it exists and is suspended.
 * Should be called directly within a user interaction event handler.
 */
export function resumeAudioContext() {
  if (audioContext && audioContext.state === 'suspended') {
    console.log("Attempting to resume AudioContext due to user interaction...");
    audioContext.resume().then(() => {
      console.log("AudioContext resumed successfully.");
    }).catch(e => console.warn("AudioContext.resume() failed:", e));
    // Note: We don't await here. Let the main initialization flow handle state checks.
  }
}

async function loadWasm() {
  // Fetch the WASM binary only once
  if (!wasmBinary) {
    try {
      console.log("Fetching Wasm binary...");
      const response = await fetch("./pkg/rustfmsynth_bg.wasm");
      if (!response.ok) {
        throw new Error(`Failed to fetch Wasm binary: ${response.statusText}`);
      }
      wasmBinary = await response.arrayBuffer();
      console.log("Wasm binary fetched successfully.");
    } catch (e) {
      console.error("Error fetching Wasm binary:", e);
      wasmBinary = null; // Reset on error
      throw e; // Re-throw to prevent synth start
    }
  }
}

// Generate the keyboard UI as soon as the script runs
try {
  generateKeyboard(); // This adds the mouse listeners internally
} catch (e) {
  console.error("Error generating initial keyboard UI:", e);
}

// New function: Sets up AudioContext, WorkletNode, and connects input handlers
async function initializeAudioSystem() {
  // Quick exit if already initialized successfully
  if (audioSystemInitialized) return;

  console.log("Initializing core audio system...");
  try {
    audioContext = new AudioContext();
    if (audioContext.state === 'suspended') {
      await audioContext.resume().catch(e => console.warn("AudioContext initial resume failed:", e));
    }
    await audioContext.audioWorklet.addModule("synth-processor.js");
    console.log("AudioWorklet module added successfully.");
    processorNode = new AudioWorkletNode(audioContext, "synth-processor");
    console.log("AudioWorkletNode created.");
    processorNode.port.onmessage = (event) => {
      // Handle any other messages if needed in the future
      console.log("Received unexpected message from worklet:", event.data);
    };
    processorNode.port.onmessageerror = (event) => {
      console.error("Error receiving message from worklet:", event);
      // Potentially reject the synthInitializationPromise if it's pending?
    };
    setupKeyboardInput(processorNode.port);
    connectKeyboardUIPort(processorNode.port);

    audioSystemInitialized = true; // Mark as done *after* completion
    console.log("Core audio system initialized.");

  } catch (error) {
    console.error("Error initializing core audio system:", error);
    audioSystemInitialized = false; // Ensure flag reflects failure
    // Important: Reset the promise on failure so retry is possible
    audioSystemInitializationPromise = null;
    throw error; // Re-throw so ensureSynthStarted knows it failed
  }
}


// Modified: This now handles WASM loading, sending init, connecting, AND sending initial state
async function completeSynthInitialization() {
  // Return a promise that resolves when the synth Wasm is initialized and connected
  return new Promise(async (resolve, reject) => {
    try {
      await loadWasm();
      if (!wasmBinary) throw new Error("Wasm binary failed to load or was already transferred.");
      if (!audioSystemInitialized || !processorNode || !processorNode.port) throw new Error("Core audio system not initialized before completing synth setup.");

      processorNode.port.onmessage = (event) => {
        if (event.data.type === 'initialized') {
          console.log("Received initialization confirmation from worklet.");

          // +++ Send Initial State AFTER worklet is ready +++
          if (!initialStateSentToWorklet && initialStateLoaded) {
             console.log("Worklet initialized, sending initial state loaded from fragment...");
             try {
                 // Send Algorithm Matrix update
                 processorNode.port.postMessage({
                     type: 'set-algorithm',
                     payload: initialStateLoaded.matrix
                 });

                 // Send Operator States updates
                 if (Array.isArray(initialStateLoaded.operators)) {
                     const count = Math.min(initialStateLoaded.operators.length, NUM_OPERATORS);
                     for (let i = 0; i < count; i++) {
                          const opState = initialStateLoaded.operators[i];
                          if (opState) {
                              if (opState.ratio !== undefined) processorNode.port.postMessage({ type: 'set_operator_ratio', operator_index: i, ratio: opState.ratio });
                              if (opState.modIndex !== undefined) processorNode.port.postMessage({ type: 'set_operator_modulation_index', operator_index: i, modulation_index: opState.modIndex });
                              if (opState.waveform !== undefined) processorNode.port.postMessage({ type: 'set_operator_waveform', operator_index: i, waveform_value: opState.waveform });
                              if (opState.attack !== undefined && opState.decay !== undefined && opState.sustain !== undefined && opState.release !== undefined) {
                                  processorNode.port.postMessage({ type: 'set_operator_envelope', operator_index: i, attack: opState.attack, decay: opState.decay, sustain: opState.sustain, release: opState.release });
                              }
                          }
                     }
                     console.log(`Sent initial state for ${count} operators to worklet.`);
                 }
                 initialStateSentToWorklet = true; // Mark as sent
             } catch (stateSendError) {
                  console.error("Error sending initial state to worklet:", stateSendError);
                  // Don't reject the main promise here, synth is technically ready
                  // but state might be default.
             }
          } else if (!initialStateSentToWorklet) {
             console.log("Worklet initialized, no initial state loaded, using defaults already in worklet.");
             initialStateSentToWorklet = true; // Mark default state as "sent" (i.e., accepted)
          }
          // +++ End Initial State Sending +++

          resolve(); // Resolve the promise when worklet confirms
        } else {
          console.log("Received message from worklet during init wait:", event.data);
        }
      };

      console.log("Sending init message with Wasm binary to processor...");
      processorNode.port.postMessage({
        type: "init",
        sampleRate: audioContext.sampleRate,
        wasmBinary: wasmBinary // Send the ArrayBuffer
      }, [wasmBinary]); // Mark wasmBinary as transferable
      wasmBinary = null; // Nullify after transfer

      // Connect the processor node to the output *after* sending init
      processorNode.connect(audioContext.destination);
      console.log("Processor node connected to destination.");

      // --- Promise will resolve when 'initialized' message is received --- 

    } catch (error) {
      console.error("Error during final synth initialization steps:", error);
      wasmBinary = null; // Ensure binary is nulled on error too
      initialStateSentToWorklet = false; // Reset flag on error
      reject(error); // Reject the promise on any error during this phase
    }
  }); // End of Promise constructor
}

// Helper ensureSynthStarted: Now also implicitly handles sending initial state via completeSynthInitialization
export async function ensureSynthStarted() {
  if (!audioSystemInitializationPromise) {
    console.log("Initiating core audio system setup (likely due to user interaction)...");
    // Ensure context can be resumed if needed (important on interaction)
    resumeAudioContext();
    audioSystemInitializationPromise = initializeAudioSystem();
  }
  try {
    await audioSystemInitializationPromise;
  } catch (error) {
    console.error("Failed initial audio system setup (awaiting promise):", error);
    throw error;
  }

  if (!synthInitializationPromise) {
    console.log("Starting final synth initialization (Wasm load, connect, initial state send)...");
    // Resume context again just before sending Wasm, belt-and-suspenders
     if (audioContext && audioContext.state === 'suspended') {
         console.log("Resuming potentially suspended AudioContext before final init...")
         try { await audioContext.resume(); } catch (e) { /* handle error */ }
     }
    synthInitializationPromise = completeSynthInitialization(); // This now handles initial state send
  }

  try {
    await synthInitializationPromise; // Wait for Wasm init, connection, and initial state send to complete
  } catch (error) {
    console.error("Synth final initialization failed:", error);
    synthInitializationPromise = null;
    // Don't reset initialStateSentToWorklet here, as the core issue is init failure
    throw error;
  }
}

// --- State Serialization/Deserialization ---

function serializeState() {
    const matrixState = getAlgorithmFromMatrix(matrixContainer);
    const operatorStates = getOperatorStates(); // Get from operator-controls UI

    // Basic check if states were gathered correctly
    if (!matrixState || !operatorStates || operatorStates.length !== NUM_OPERATORS) {
         console.warn("Could not gather complete state for serialization.");
         return null;
    }

    const state = {
        version: 1, // Versioning for future format changes
        matrix: matrixState,
        operators: operatorStates
    };

    try {
        const jsonString = JSON.stringify(state);
        // Base64 encode to make it URL-safe without complex escaping
        return btoa(jsonString);
    } catch (e) {
        console.error("Error serializing state:", e);
        return null;
    }
}

function deserializeState(encodedString) {
    if (!encodedString) return null;
    try {
        const jsonString = atob(encodedString); // Decode Base64
        const state = JSON.parse(jsonString);

        // Basic validation: check version and presence of main keys
        if (state && state.version === 1 && Array.isArray(state.matrix) && Array.isArray(state.operators)) {
            // Add more validation if needed (e.g., check array lengths match NUM_OPERATORS)
            if (state.matrix.length !== NUM_OPERATORS || state.operators.length !== NUM_OPERATORS) {
                 console.warn(`Deserialized state operator count mismatch (Matrix: ${state.matrix.length}, Ops: ${state.operators.length}). Expected ${NUM_OPERATORS}. Applying may be partial.`);
                 // Allow partial application for now
            }
             return state;
        } else {
             console.warn("Deserialized state is invalid, missing keys, or wrong version:", state);
             return null;
        }
    } catch (e) {
        // Errors can happen with invalid Base64 or JSON
        console.error("Error deserializing state:", e);
        return null;
    }
}

// --- Update URL Fragment ---
function updateUrlFragment() {
    if (isApplyingState) {
        // console.log("Skipping URL update while applying state."); // Debug log
        return; // Prevent feedback loop
    }

    const serializedState = serializeState();
    if (serializedState) {
        // Use replaceState to update hash without adding to browser history
        history.replaceState(null, '', '#' + serializedState);
        // console.log("URL Fragment updated."); // Debug log
    } else {
        // Optionally clear the hash if state is invalid or empty
        // history.replaceState(null, '', window.location.pathname + window.location.search);
        console.warn("Serialization failed, URL fragment not updated.");
    }
}

// --- Apply State Function (Simplified: UI Only for initial load) ---
// This function NOW ONLY updates the UI elements directly.
// Sending state to the worklet happens later via ensureSynthStarted/completeSynthInitialization.
function applyStateUIOnly(state, matrixContainerElement, operatorControlsContainerElement) {
    if (!state || !state.matrix || !state.operators) {
        console.warn("Cannot apply invalid or incomplete state to UI:", state);
        return;
    }

    console.log("Applying state to UI elements:", state);
    isApplyingState = true; // Block URL updates during this process

    try {
        // 1. Update Matrix UI
        if (matrixContainerElement) {
            displayAlgorithm(matrixContainerElement, state.matrix);
        } else {
             console.error("Matrix container element not provided during UI state application.");
        }

        // 2. Update Operator Controls UI
        if (operatorControlsContainerElement) {
            applyOperatorStatesUI(state.operators); // Use the UI-only function
        } else {
            console.error("Operator controls container element not provided during UI state application.")
        }
        console.log("Successfully applied state to UI.");

    } catch (error) {
        console.error("Failed during UI state application process:", error);
    } finally {
         isApplyingState = false;
         console.log("Finished applying UI state, isApplyingState is now false.");
    }
}

// --- Callback function to handle matrix updates ---
// No longer needs direct URL update call, handled by event listener setup
function handleMatrixUpdate(combinedMatrix, processorNodeInstance) {
  console.log("Matrix UI changed, sending algorithm to processor:", combinedMatrix);
  ensureSynthStarted()
    .then(() => {
      if (!processorNode) {
         console.error("processorNode is null in handleMatrixUpdate after ensureSynthStarted");
         return;
      }
      processorNode.port.postMessage({
        type: 'set-algorithm',
        payload: combinedMatrix
      });
    })
    .catch(err => {
      console.error("Failed to ensure synth started before sending algorithm update:", err);
    });
}

// --- Updated Initialisation Function ---
async function initializeApp() {
  console.log("Initializing application...");

  // --- Find Containers (ensure DOM is ready) ---
  // It's generally safer to get elements within the DOMContentLoaded handler
  const currentMatrixContainer = document.getElementById('algorithm-matrix'); // Re-check or use module var if preferred
  const currentOperatorControlsContainer = document.getElementById('operator-controls'); // <-- Get element HERE
  const resetButton = document.getElementById('reset-button'); // <-- Get reset button HERE

  // --- Generate UI Shells ---
  if (currentMatrixContainer) {
      createAlgorithmMatrixUI(NUM_OPERATORS, currentMatrixContainer);
  } else {
      console.error("Algorithm matrix container not found.");
  }
  // Check the locally found container element
  if (!currentOperatorControlsContainer) {
      console.error("Operator controls container (#operator-controls) NOT FOUND in DOM.");
  }
  try { generateKeyboard(); } catch (e) { console.error("Error generating keyboard UI:", e); }
  console.log("Base UI structure generated.");


   // --- Initialize Operator Controls (Generates DOM, attaches internal listeners) ---
   // Pass updateUrlFragment callback. Must happen *before* applying UI state.
   // Use the locally found container element
   if (currentOperatorControlsContainer) {
       console.log("Attempting to initialize operator controls in container:", currentOperatorControlsContainer);
       initializeOperatorControls(currentOperatorControlsContainer, updateUrlFragment); // Pass the found container
       console.log("Finished calling initializeOperatorControls.");
   } else {
       // Logged the error above already
       console.warn("Skipping operator controls initialization because container was not found.");
   }

   // --- Load State from URL Fragment ---
   initialStateLoaded = null;
   initialStateSentToWorklet = false;
   if (window.location.hash && window.location.hash.length > 1) {
     const encodedState = window.location.hash.substring(1);
     console.log("Attempting to deserialize state from URL fragment...");
     initialStateLoaded = deserializeState(encodedState);
     if (initialStateLoaded) {
         console.log("Deserialized initial state successfully.");
         // --- Apply Initial State to UI ONLY ---
         // Use the locally found container for consistency when applying state
         applyStateUIOnly(initialStateLoaded, currentMatrixContainer, currentOperatorControlsContainer);
         updateUrlFragment();
     } else {
         console.warn("Failed to deserialize state from URL fragment, using defaults.");
         history.replaceState(null, '', window.location.pathname + window.location.search); // Clear invalid hash
         // initialStateLoaded remains null, defaults will be used in worklet
         initialStateSentToWorklet = true; // Mark defaults as "sent" (accepted) since we won't send anything specific
     }
   } else {
        console.log("No initial state in URL fragment, using defaults.");
        // Worklet will use its internal defaults. Mark as "sent".
        initialStateSentToWorklet = true;
   }

  // --- Setup Matrix Event Listeners ---
  // Pass the specific container instance
  if (currentMatrixContainer) {
      setupMatrixEventListeners(currentMatrixContainer, (matrix) => {
          // Need access to the worklet node for handleMatrixUpdate
          handleMatrixUpdate(matrix, processorNode); // Assuming handleMatrixUpdate needs the node
          updateUrlFragment();
      });
  }

  // Attach global keyboard listeners
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  console.log("Keyboard listeners attached.");

  // --- Add Reset Button Listener ---
  if (resetButton && currentMatrixContainer && currentOperatorControlsContainer) {
      resetButton.addEventListener('click', async () => {
          console.log("Reset button clicked.");
          resumeAudioContext(); // Good practice before sending messages

          // 1. Reset UI Elements
          resetAlgorithmMatrixUI(currentMatrixContainer);
          resetOperatorControlsUI(); // Uses internal default logic

          try {
               // 2. Ensure synth is ready (might start it if not already)
               await ensureSynthStarted();
               if (!processorNode) throw new Error("Processor node is unavailable after ensureSynthStarted");

               // 3. Get the state FROM the now-reset UI
               const defaultMatrix = getAlgorithmFromMatrix(currentMatrixContainer);
               const defaultOperators = getOperatorStates(); // Gets current (default) values

               if (!defaultMatrix || !defaultOperators) {
                   console.error("Failed to get default state from UI after reset.");
                   return;
               }

               console.log("Sending default state to worklet after reset...");

               // 4. Send Reset State to Worklet
               // Send Algorithm
               processorNode.port.postMessage({
                   type: 'set-algorithm',
                   payload: defaultMatrix
               });
               console.log("Sent default algorithm to worklet.");

               // Send Operator States
               for (let i = 0; i < defaultOperators.length; i++) {
                   const opState = defaultOperators[i];
                   if (opState) {
                        // Send all params for each operator to ensure reset
                        processorNode.port.postMessage({ type: 'set_operator_ratio', operator_index: i, ratio: opState.ratio });
                        processorNode.port.postMessage({ type: 'set_operator_modulation_index', operator_index: i, modulation_index: opState.modIndex });
                        processorNode.port.postMessage({ type: 'set_operator_waveform', operator_index: i, waveform_value: opState.waveform });
                        processorNode.port.postMessage({ type: 'set_operator_envelope', operator_index: i, attack: opState.attack, decay: opState.decay, sustain: opState.sustain, release: opState.release });
                   }
               }
               console.log(`Sent default state for ${defaultOperators.length} operators to worklet.`);

               // 5. Update URL Fragment (Reflects the new default state)
               // Block updates temporarily just to be safe, though it shouldn't loop here
               isApplyingState = true;
               updateUrlFragment();
               isApplyingState = false;
               console.log("Reset complete, URL fragment updated.");

          } catch (error) {
               console.error("Error during patch reset process:", error);
               // Potentially notify the user here
          }
      });
      console.log("Reset button event listener attached.");
  } else {
      if (!resetButton) console.warn("Reset button not found.");
      if (!currentMatrixContainer) console.warn("Matrix container not found for reset listener.");
      if (!currentOperatorControlsContainer) console.warn("Operator controls container not found for reset listener.");
  }

  console.log("Application ready. Interact with controls or keyboard to start audio.");
}

// Remove button event listeners as keyboard input is now primary
// document.getElementById("note-on").addEventListener("click", ...);
// document.getElementById("note-off").addEventListener("click", ...);

// DOMContentLoaded listener now calls the renamed function
document.addEventListener('DOMContentLoaded', initializeApp);


// Optional: Add cleanup if needed (e.g., for hot module replacement)
window.addEventListener('beforeunload', () => {
  // Remove listeners when leaving the page
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  console.log("Keyboard listeners removed.");

  removeKeyboardInput(); // Clears the port and state in keyboard-input.js

  if (audioContext) {
    audioContext.close().catch(e => console.error("Error closing AudioContext:", e));
  }
});

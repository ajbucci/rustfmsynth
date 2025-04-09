// Import necessary modules
import init from "./pkg/rustfmsynth.js"; // Keep init import if used directly, though it seems unused now
import { removeKeyboardInput, handleKeyDown, handleKeyUp, setKeyboardProcessorPort } from './keyboard-input.js';
import { generateKeyboard, connectKeyboardUIPort } from './keyboard-ui.js';
import { initializeOperatorControls, getOperatorStates, applyOperatorStatesUI, NUM_OPERATORS as OP_CONTROL_NUM, resetOperatorControlsUI } from './operator-controls.js';
import {
  createAlgorithmMatrixUI,
  getAlgorithmFromMatrix,
  displayAlgorithm,
  resetAlgorithmMatrixUI
} from './algorithm-matrix.js';
import { compressData, decompressData } from './compression.js'; // Assume compression helpers moved to a separate file

// --- Global State Variables ---
let audioContext = null;
let processorNode = null;
let wasmBinary = null; // Store fetched WASM binary
let synthReadyPromise = null; // A single promise to track when the synth is fully ready (Wasm init + message confirmation)
let resolveSynthReady = null; // Function to resolve the synthReadyPromise

const NUM_OPERATORS = OP_CONTROL_NUM || 6; // Consistent operator count

// DOM Element References (fetched once after DOM ready)
let matrixContainer = null;
let operatorControlsContainer = null;
let resetButton = null;

// State Management Flags
let isApplyingInitialState = false; // Flag specific to initial load state application
let isUpdatingFromUI = true; // Flag to control URL updates (true allows updates, false blocks)

// --- Helper Functions ---

/**
 * Attempts to resume the AudioContext if it exists and is suspended.
 * Should be called within a user interaction event handler.
 */
export function resumeAudioContext() {
  if (audioContext && audioContext.state === 'suspended') {
    console.log("Attempting to resume AudioContext due to user interaction...");
    audioContext.resume().then(() => {
      console.log("AudioContext resumed successfully.");
    }).catch(e => console.warn("AudioContext.resume() failed:", e));
  }
}

/**
 * Fetches the WASM binary if not already fetched.
 */
async function loadWasm() {
  if (wasmBinary) return; // Already fetched or transferred
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
    wasmBinary = null;
    throw e; // Propagate error
  }
}

/**
 * Creates the core UI elements (Keyboard, Matrix Shell, Operator Controls Shell).
 */
function createBaseUI() {
  console.log("Creating base UI elements...");
  try {
    // Ensure containers exist
    if (!matrixContainer) throw new Error("Matrix container not found.");
    if (!operatorControlsContainer) throw new Error("Operator controls container not found.");

    // Generate static UI parts
    generateKeyboard(); // Assumes this finds its container or appends globally
    createAlgorithmMatrixUI(NUM_OPERATORS, matrixContainer, handleUIChange);

    // Initialize Operator Controls (creates dynamic elements inside the container)
    // Pass the update callback *now*
    initializeOperatorControls(operatorControlsContainer, handleUIChange);

    console.log("Base UI elements created.");
  } catch (error) {
    console.error("Error creating base UI:", error);
    // Consider displaying an error message to the user
  }
}

/**
 * Serializes the current UI state (Matrix + Operators).
 * @returns {Promise<string|null>} Compressed, base64 encoded state string or null on failure.
 */
async function serializeState() {
  if (!matrixContainer || !operatorControlsContainer) {
    console.warn("Cannot serialize state: UI containers not ready.");
    return null;
  }
  try {
    const matrixState = getAlgorithmFromMatrix(matrixContainer);
    const operatorStates = getOperatorStates(); // Get from operator-controls UI

    if (!matrixState || !operatorStates || operatorStates.length !== NUM_OPERATORS) {
      console.warn("Could not gather complete state for serialization from UI.");
      return null;
    }

    const state = {
      version: 1,
      matrix: matrixState,
      operators: operatorStates
    };
    const jsonString = JSON.stringify(state);
    return await compressData(jsonString); // Assumes compressData handles base64 encoding
  } catch (e) {
    console.error("Error serializing state:", e);
    return null;
  }
}

/**
 * Deserializes state from a compressed, base64 encoded string.
 * @param {string} encodedString The encoded state string.
 * @returns {Promise<object|null>} The parsed state object or null on failure/invalid data.
 */
async function deserializeState(encodedString) {
  if (!encodedString) return null;
  try {
    const jsonString = await decompressData(encodedString); // Assumes decompressData handles base64 decoding
    const state = JSON.parse(jsonString);

    // Basic validation
    if (state && state.version === 1 && Array.isArray(state.matrix) && Array.isArray(state.operators)) {
      if (state.matrix.length !== NUM_OPERATORS || state.operators.length !== NUM_OPERATORS) {
        console.warn(`Deserialized state operator count mismatch (Matrix: ${state.matrix.length}, Ops: ${state.operators.length}). Expected ${NUM_OPERATORS}. Applying partial state.`);
        // Truncate or pad if necessary, or just let applying functions handle it
        state.matrix = state.matrix.slice(0, NUM_OPERATORS); // Example: truncate
        state.operators = state.operators.slice(0, NUM_OPERATORS);
        while (state.matrix.length < NUM_OPERATORS) state.matrix.push(Array(NUM_OPERATORS).fill(0)); // Pad matrix rows if needed
        while (state.operators.length < NUM_OPERATORS) state.operators.push({}); // Pad operators if needed (or use defaults)
      }
      return state;
    } else {
      console.warn("Deserialized state is invalid, missing keys, or wrong version:", state);
      return null;
    }
  } catch (e) {
    console.error("Error deserializing state:", e);
    return null;
  }
}

/**
 * Updates the URL fragment with the current serialized state.
 * Controlled by the `isUpdatingFromUI` flag.
 */
async function updateUrlFragment() {
  if (!isUpdatingFromUI) {
    // console.log("Skipping URL update."); // Debug log
    return;
  }

  const serializedState = await serializeState();
  if (serializedState) {
    // Use replaceState to avoid polluting browser history
    history.replaceState(null, '', '#' + serializedState);
    // console.log("URL Fragment updated."); // Debug log
  } else {
    console.warn("Serialization failed, URL fragment not updated.");
    // Optionally clear the hash if serialization fails consistently:
    // history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

/**
 * Applies a state object to the UI elements.
 * @param {object} state The state object to apply.
 */
function applyStateToUI(state) {
  if (!state || !state.matrix || !state.operators) {
    console.warn("Cannot apply invalid or incomplete state to UI:", state);
    return;
  }
  if (!matrixContainer || !operatorControlsContainer) {
    console.error("Cannot apply state to UI: Containers not ready.");
    return;
  }

  console.log("Applying state to UI elements...");
  const wasUpdating = isUpdatingFromUI;
  isUpdatingFromUI = false; // Prevent URL updates while applying state

  try {
    displayAlgorithm(matrixContainer, state.matrix);
    applyOperatorStatesUI(state.operators); // Update operator controls UI
    console.log("Successfully applied state to UI.");
  } catch (error) {
    console.error("Failed during UI state application process:", error);
  } finally {
    isUpdatingFromUI = wasUpdating; // Restore previous state
    console.log(`Finished applying UI state, isUpdatingFromUI is now ${isUpdatingFromUI}.`);
  }
}

/**
 * Sends the complete state (matrix + operators) to the synth worklet.
 * Requires `processorNode` to be initialized.
 * @param {object} state The state object to send.
 */
function sendStateToSynth(state) {
  if (!processorNode || !processorNode.port) {
    console.error("Cannot send state: processorNode not available.");
    return;
  }
  if (!state || !state.matrix || !state.operators) {
    console.warn("Cannot send invalid or incomplete state to synth:", state);
    return;
  }

  console.log("Sending state to synth worklet...");
  try {
    // Send Algorithm Matrix update
    processorNode.port.postMessage({
      type: 'set-algorithm',
      matrix: state.matrix
    });

    // Send Operator States updates
    const count = Math.min(state.operators.length, NUM_OPERATORS);
    for (let i = 0; i < count; i++) {
      const opState = state.operators[i];
      if (opState) {
        // Send all relevant parameters for each operator
        if (opState.ratio !== undefined) processorNode.port.postMessage({ type: 'set_operator_ratio', operator_index: i, ratio: opState.ratio });
        if (opState.modIndex !== undefined) processorNode.port.postMessage({ type: 'set_operator_modulation_index', operator_index: i, modulation_index: opState.modIndex });
        if (opState.waveform !== undefined) processorNode.port.postMessage({ type: 'set_operator_waveform', operator_index: i, waveform_value: opState.waveform });
        // Ensure all envelope parameters are present before sending
        if (opState.attack !== undefined && opState.decay !== undefined && opState.sustain !== undefined && opState.release !== undefined) {
          processorNode.port.postMessage({ type: 'set_operator_envelope', operator_index: i, attack: opState.attack, decay: opState.decay, sustain: opState.sustain, release: opState.release });
        } else {
          console.warn(`Operator ${i}: Incomplete envelope data in state, skipping envelope update.`);
        }
      }
    }
    console.log(`Sent state for algorithm and ${count} operators to worklet.`);
  } catch (error) {
    console.error("Error sending state to worklet:", error);
  }
}

/**
 * Callback function triggered by UI changes (matrix, operators).
 * Sends the updated part to the synth and updates the URL fragment.
 */
async function handleUIChange() {
  // It's often simpler to just get the full state and send it,
  // rather than figuring out exactly what changed.
  // If performance becomes an issue, optimize later.
  console.log("UI Change detected, updating synth and URL.");
  // resumeAudioContext(); // Good practice before sending messages
  //
  // if (!processorNode || !processorNode.port) {
  //   console.warn("Processor node not ready, cannot send UI changes yet.");
  //   return;
  // }
  //
  const currentState = {
    matrix: getAlgorithmFromMatrix(matrixContainer),
    operators: getOperatorStates()
  };
  //
  if (currentState.matrix && currentState.operators) {
    // Send the complete current state to the synth
    // sendStateToSynth(currentState);
    // Update the URL fragment
    await updateUrlFragment();
  } else {
    console.error("Failed to get current state from UI on change.");
  }
}

/**
 * Handles the 'initialized' message from the worklet.
 * Loads URL state, applies it to UI, and sends it to the synth.
 */
async function onSynthInitialized() {
  console.log("Received initialization confirmation from worklet.");

  // Now that the synth is ready, load state from URL
  let initialState = null;
  const hash = window.location.hash;

  isApplyingInitialState = true; // Prevent UI listeners from triggering updates during initial load

  if (hash && hash.length > 1) {
    const encodedState = hash.substring(1);
    console.log("Attempting to deserialize state from URL fragment...");
    initialState = await deserializeState(encodedState);
    if (initialState) {
      console.log("Deserialized initial state successfully:", initialState);
    } else {
      console.warn("Failed to deserialize state from URL fragment, using defaults.");
      history.replaceState(null, '', window.location.pathname + window.location.search); // Clear invalid hash
    }
  } else {
    console.log("No initial state in URL fragment, using defaults.");
  }

  // If no valid state loaded, get default state from UI (which should be in default state now)
  if (!initialState) {
    if (!matrixContainer || !operatorControlsContainer) {
      console.error("Cannot get default state: UI containers not available.");
      isApplyingInitialState = false;
      return; // Critical error
    }
    console.log("Getting default state from initialized UI elements...");
    initialState = {
      matrix: getAlgorithmFromMatrix(matrixContainer), // Should be default
      operators: getOperatorStates() // Should be default
    };
    // Ensure defaults were retrieved correctly
    if (!initialState.matrix || !initialState.operators) {
      console.error("Failed to retrieve default state from UI. Synth state might be incorrect.");
      initialState = null; // Reset to avoid applying partial/bad state
    } else {
      console.log("Using default state retrieved from UI:", initialState);
    }
  }

  // Apply the determined state (loaded or default) to UI and Synth
  if (initialState) {
    applyStateToUI(initialState);
    sendStateToSynth(initialState);
    // Update URL only if we loaded state from it initially, otherwise the URL is already clean or reflects defaults implicitly
    if (hash && hash.length > 1 && initialState) {
      // We loaded from a hash, ensure it's updated/normalized after potential fixes
      await updateUrlFragment();
    }
  } else {
    console.error("Could not determine initial state (loaded or default). Synth may not be configured correctly.");
  }

  isApplyingInitialState = false; // Allow UI updates again
  console.log("Initial state processing complete.");
}


/**
 * Initializes the core audio components and the synth worklet.
 */
async function initializeSynth() {
  console.log("Initializing synthesizer...");
  try {
    // 1. Load Wasm
    await loadWasm();
    if (!wasmBinary) throw new Error("Wasm binary failed to load or was already transferred.");

    // 2. Create AudioContext (potentially resumes)
    if (!audioContext) {
      audioContext = new AudioContext();
      console.log("AudioContext created. Sample rate:", audioContext.sampleRate);
      if (audioContext.state === 'suspended') {
        console.warn("AudioContext is suspended. User interaction will be needed to start audio.");
        // No automatic resume here, wait for user action like button click or key press
      }
    } else {
      resumeAudioContext(); // Resume if already exists and suspended
    }


    // 3. Add Worklet module
    try {
      await audioContext.audioWorklet.addModule("synth-processor.js");
      console.log("AudioWorklet module loaded.");
    } catch (moduleError) {
      console.error("Failed to load AudioWorklet module:", moduleError);
      throw moduleError; // Stop initialization
    }

    // 4. Create WorkletNode
    processorNode = new AudioWorkletNode(audioContext, "synth-processor", {
      processorOptions: { numberOfOutputs: 1 } // Example options if needed
    });
    console.log("AudioWorkletNode created.");

    // 5. Setup Promise for Synth Readiness
    synthReadyPromise = new Promise((resolve) => {
      resolveSynthReady = resolve; // Store the resolve function
    });

    // 6. Set up Worklet Message Handling
    processorNode.port.onmessage = (event) => {
      if (event.data.type === 'initialized') {
        onSynthInitialized(); // Handle state loading *after* confirmation
        if (resolveSynthReady) {
          resolveSynthReady(); // Resolve the promise indicating synth is fully ready
          resolveSynthReady = null; // Prevent multiple resolves
        }
      } else {
        console.log("Received message from worklet:", event.data);
        // Handle other potential messages from the worklet here
      }
    };
    processorNode.port.onmessageerror = (event) => {
      console.error("Error receiving message from worklet:", event);
      // Potentially reject synthReadyPromise or notify user
    };

    // 7. Send init message with Wasm binary
    console.log("Sending init message with Wasm binary to processor...");
    processorNode.port.postMessage({
      type: "init",
      sampleRate: audioContext.sampleRate,
      wasmBinary: wasmBinary // Send the ArrayBuffer
    }, [wasmBinary]); // Mark wasmBinary as transferable
    wasmBinary = null; // Nullify after transfer

    // 8. Connect processor to destination
    processorNode.connect(audioContext.destination);
    console.log("Processor node connected to destination.");

    // 9. Connect Keyboard Input/UI
    setKeyboardProcessorPort(processorNode.port);
    connectKeyboardUIPort(processorNode.port); // Connects UI keyboard clicks

    console.log("Synth initialization sequence complete. Waiting for 'initialized' confirmation from worklet...");

  } catch (error) {
    console.error("Error during synthesizer initialization:", error);
    // Display error to user, potentially disable controls
    processorNode = null; // Ensure node is null on failure
    wasmBinary = null; // Ensure binary is nulled
    synthReadyPromise = Promise.reject(error); // Reject the promise on failure
    throw error; // Re-throw if needed upstream
  }
}

/**
 * Resets the synth state to default values.
 */
async function resetSynthState() {
  console.log("Reset button clicked.");
  resumeAudioContext(); // Ensure audio context is active

  if (!matrixContainer || !operatorControlsContainer) {
    console.error("Cannot reset: UI containers not found.");
    return;
  }

  console.log("Resetting UI to defaults...");
  isUpdatingFromUI = false; // Prevent URL update during reset UI phase

  // 1. Reset UI Elements first
  resetAlgorithmMatrixUI(matrixContainer); // Resets matrix UI
  resetOperatorControlsUI(); // Resets operator controls UI

  console.log("Getting default state from reset UI...");
  // 2. Get the state *from* the now-reset UI
  const defaultState = {
    matrix: getAlgorithmFromMatrix(matrixContainer),
    operators: getOperatorStates()
  };

  if (!defaultState.matrix || !defaultState.operators) {
    console.error("Failed to get default state from UI after reset. Aborting reset.");
    isUpdatingFromUI = true; // Re-enable updates
    return;
  }

  // 3. Ensure synth is ready before sending state
  if (!processorNode || !processorNode.port) {
    console.error("Synth not ready, cannot send reset state.");
    // Try to wait for synth if it's still initializing? Or just fail?
    // For simplicity, let's assume it should be ready if reset is clicked.
    try {
      console.log("Waiting for synth to be ready before sending reset state...");
      await synthReadyPromise; // Wait for the synth to confirm initialization
      if (!processorNode || !processorNode.port) throw new Error("Synth node still not available after waiting.");
    } catch (waitError) {
      console.error("Error waiting for synth readiness during reset:", waitError);
      isUpdatingFromUI = true; // Re-enable updates
      return;
    }
  }


  console.log("Sending default state to worklet...");
  // 4. Send Reset State to Worklet
  sendStateToSynth(defaultState);

  // 5. Update URL Fragment to reflect the new default state
  isUpdatingFromUI = true; // Re-enable updates *before* updating URL
  await updateUrlFragment();

  console.log("Reset complete.");
}


// --- Main Application Initialization ---
async function initializeApp() {
  console.log("Initializing application...");

  // 1. Get DOM element references
  matrixContainer = document.getElementById('algorithm-matrix');
  operatorControlsContainer = document.getElementById('operator-controls');
  resetButton = document.getElementById('reset-button');

  if (!matrixContainer || !operatorControlsContainer) {
    console.error("Fatal Error: Required UI container elements not found in DOM. Aborting initialization.");
    // Display a user-friendly error message on the page
    document.body.innerHTML = '<p style="color: red; font-weight: bold;">Error: Application cannot start. UI components missing.</p>';
    return;
  }

  // 2. Create Base UI Elements (Keyboard, Matrix, Operator shells)
  createBaseUI(); // Includes initializing operator controls

  // 3. Initialize Synthesizer (AudioContext, Worklet, WASM)
  // This now includes waiting for the 'initialized' message internally
  // and triggering the initial state load/apply flow (onSynthInitialized)
  try {
    await initializeSynth(); // Starts async loading/setup
  } catch (synthError) {
    console.error("Synth initialization failed. Application may not function correctly.", synthError);
    // Display error to user
    // Optionally disable UI controls here
    return; // Stop further setup if synth fails critically
  }

  // Global Keyboard listeners
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  console.log("Keyboard listeners attached.");

  // Reset Button Listener
  if (resetButton) {
    resetButton.addEventListener('click', resetSynthState);
    console.log("Reset button event listener attached.");
  } else {
    console.warn("Reset button not found.");
  }


  console.log("Application initialization sequence launched.");
  console.log("Waiting for synth worklet confirmation to load initial state...");
  // The rest of the state loading (URL -> UI -> Synth) happens when
  // the 'initialized' message is received by the `initializeSynth` function's message handler.
}

// --- Global Event Listeners ---

// Start initialization when the DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  console.log("Cleaning up application resources...");
  // Remove global listeners
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  console.log("Keyboard listeners removed.");

  // Clean up keyboard input module if necessary
  removeKeyboardInput();

  // Close AudioContext
  if (audioContext) {
    audioContext.close().then(() => {
      console.log("AudioContext closed.");
    }).catch(e => console.error("Error closing AudioContext:", e));
    audioContext = null;
  }

  // Clean up worklet node? Not usually necessary, closed with context.
  processorNode = null;
});

import init from "./pkg/rustfmsynth.js"; // Import init here
import { setupKeyboardInput, removeKeyboardInput, handleKeyDown, handleKeyUp } from './keyboard-input.js'; // Import keyboard handler + handlers
import { generateKeyboard, connectKeyboardUIPort } from './keyboard-ui.js'; // Import keyboard UI functions

let audioContext;
let processorNode;
let wasmBinary = null; // Store fetched WASM binary
let synthInitializationPromise = null; // Promise to track synth readiness (Wasm init + connect)
let audioSystemInitializationPromise = null; // Promise to track core audio setup

// Flag to track if the core audio setup is done (still useful for quick check)
let audioSystemInitialized = false;

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


// Modified: This now handles the WASM loading, sending init message, and connecting
async function completeSynthInitialization() {
  // Return a promise that resolves when the synth Wasm is initialized and connected
  return new Promise(async (resolve, reject) => {
    try {
      // Ensure Wasm binary is loaded
      await loadWasm();
      if (!wasmBinary) {
        throw new Error("Wasm binary failed to load or was already transferred.");
      }

      // Ensure the core audio system (Context, Node, Port) is ready
      if (!audioSystemInitialized || !processorNode || !processorNode.port) {
        throw new Error("Core audio system not initialized before completing synth setup.");
      }

      // Re-assign port listener specifically for the 'initialized' confirmation
      processorNode.port.onmessage = (event) => {
        if (event.data.type === 'initialized') {
          console.log("Received initialization confirmation from worklet.");
          resolve(); // Resolve the promise when worklet confirms
        } else {
          console.log("Received message from worklet during init wait:", event.data);
        }
      };

      // Send the init message WITH the Wasm binary
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
      reject(error); // Reject the promise on any error during this phase
    }
  }); // End of Promise constructor
}

// Helper to ensure synth is started before sending messages
export async function ensureSynthStarted() {
  // Step 1: Ensure the core AudioContext/WorkletNode/Port setup is done (using a promise)
  if (!audioSystemInitializationPromise) {
      console.log("Initiating core audio system setup...");
      audioSystemInitializationPromise = initializeAudioSystem();
  }
  try {
      await audioSystemInitializationPromise;
  } catch (error) {
      console.error("Failed initial audio system setup (awaiting promise):", error);
      // audioSystemInitializationPromise is reset inside initializeAudioSystem on error
      throw error; // Propagate error
  }

  // Step 2: Handle the Wasm initialization and connection part (only once)
  if (!synthInitializationPromise) {
    console.log("Starting final synth initialization (Wasm load, connect)...");
    if (audioContext && audioContext.state === 'suspended') {
       console.log("Resuming potentially suspended AudioContext before final init...")
       try {
         await audioContext.resume();
       } catch (resumeError) { 
         console.error("Failed to resume AudioContext:", resumeError);
         throw new Error(`AudioContext resume failed: ${resumeError.message}`); 
       }
    }
    synthInitializationPromise = completeSynthInitialization(); // Store the promise
  }

  try {
    await synthInitializationPromise; // Wait for Wasm init and connection to complete
  } catch (error) {
    console.error("Synth final initialization failed:", error);
    synthInitializationPromise = null; 
    throw error; // Re-throw so caller knows it failed
  }
}


// Remove button event listeners as keyboard input is now primary
// document.getElementById("note-on").addEventListener("click", ...);
// document.getElementById("note-off").addEventListener("click", ...);

// DOMContentLoaded listener now generates UI, adds key listeners, and logs readiness.
// Core audio setup happens lazily on first interaction via ensureSynthStarted.
document.addEventListener('DOMContentLoaded', () => {
  try {
    generateKeyboard(); // Regenerate UI (or ensure it's generated)
    console.log("Synthesizer UI ready.");
  } catch (e) {
    console.error("Error generating keyboard UI on DOMContentLoaded:", e);
    // Decide if we should stop here or try to continue
  }
  
  // Attach keyboard listeners to the window
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  console.log("Keyboard listeners attached.");
  
  console.log("Interact with the keyboard (physical or virtual) to start audio system and synth.");
  // Note: We don't call initializeAudioSystem() here anymore.
  // It will be called by the first call to ensureSynthStarted().
});


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

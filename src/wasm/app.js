import init from "./pkg/rustfmsynth.js"; // Import init here
import { setupKeyboardInput, removeKeyboardInput } from './keyboard-input.js'; // Import keyboard handler
import { generateKeyboard, connectKeyboardUIPort } from './keyboard-ui.js'; // Import keyboard UI functions

let audioContext;
let processorNode;
let wasmBinary = null; // Store fetched WASM binary
let synthInitializationPromise = null; // Promise to track synth readiness
let isPoweredOn = false; // Track power state

// Function to handle power button state
async function handlePowerToggle() {
  const powerButton = document.getElementById('power-button');
  const powerStatus = powerButton.nextElementSibling; // Get the status element
  const keyboardContainer = document.getElementById('keyboard-container'); // Get keyboard container
  
  if (!isPoweredOn) {
    try {
      // First time power on - ensure synth is started
      await ensureSynthStarted();
      
      // Update power state
      isPoweredOn = true;
      powerButton.classList.remove('off');
      powerButton.classList.add('on');
      powerStatus.textContent = 'ON'; // Update status text
      keyboardContainer.classList.remove('power-off'); // Remove power-off class
      
      // Notify processor of power state
      if (processorNode) {
        processorNode.port.postMessage({
          type: "power",
          state: true
        });
      }
    } catch (error) {
      console.error("Failed to power on synth:", error);
      return; // Don't update UI if startup failed
    }
  } else {
    // Power off
    isPoweredOn = false;
    powerButton.classList.remove('on');
    powerButton.classList.add('off');
    powerStatus.textContent = 'OFF'; // Update status text
    keyboardContainer.classList.add('power-off'); // Add power-off class
    
    // Notify processor of power state
    if (processorNode) {
      processorNode.port.postMessage({
        type: "power",
        state: false
      });
    }
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
  generateKeyboard();
} catch (e) {
  console.error("Error generating initial keyboard UI:", e);
}

async function startSynth() {
  // Return a promise that resolves when the synth is ready
  return new Promise(async (resolve, reject) => {
    try {
      // Ensure Wasm binary is loaded before proceeding
      await loadWasm();

      audioContext = new AudioContext();
      if (audioContext.state === 'suspended') {
        // Try to resume context early, might need user gesture later
        await audioContext.resume().catch(e => console.warn("AudioContext resume failed initially:", e));
      }

      try {
        await audioContext.audioWorklet.addModule("synth-processor.js");
        console.log("AudioWorklet module added successfully.");
      } catch (e) {
        console.error("Error adding AudioWorklet module:", e);
        reject(e); // Reject the promise if module loading fails
        return;
      }

      processorNode = new AudioWorkletNode(audioContext, "synth-processor");
      console.log("AudioWorkletNode created.");

      // --- Set up listener for confirmation --- 
      processorNode.port.onmessage = (event) => {
        if (event.data.type === 'initialized') {
          console.log("Received initialization confirmation from worklet.");
          // Setup keyboard input and connect UI port after worklet confirms
          setupKeyboardInput(processorNode.port);
          connectKeyboardUIPort(processorNode.port);
          resolve(); // Resolve the promise when worklet confirms
        } else {
          // Handle other potential messages from worklet if needed
          console.log("Received message from worklet:", event.data);
        }
      };
      // Handle errors from the worklet port
      processorNode.port.onmessageerror = (event) => {
        console.error("Error receiving message from worklet:", event);
        reject(new Error("Message error from worklet"));
      };
      // --- End listener setup --- 

      // Send the init message WITH the Wasm binary
      if (!wasmBinary) {
        const err = new Error("Wasm binary not available to send to worklet!");
        console.error(err);
        reject(err);
        return;
      }
      processorNode.port.postMessage({
        type: "init",
        sampleRate: audioContext.sampleRate,
        wasmBinary: wasmBinary // Send the ArrayBuffer
      }, [wasmBinary]); // Mark wasmBinary as transferable
      console.log("Init message with Wasm binary sent to processor.");
      wasmBinary = null; // Nullify after transfer

      processorNode.connect(audioContext.destination);
      console.log("Processor node connected to destination.");

    } catch (error) {
      console.error("Error during synth startup:", error);
      reject(error); // Reject the promise on any startup error
    }
  }); // End of Promise constructor
}

// Helper to ensure synth is started before sending messages
async function ensureSynthStarted() {
  if (!synthInitializationPromise) {
    console.log("Starting synth initialization...");
    synthInitializationPromise = startSynth(); // Store the promise
  }
  try {
    await synthInitializationPromise; // Wait for initialization to complete
    console.log("Synth initialization complete.");
    // Ensure context is running after potential user gesture
    if (audioContext && audioContext.state === 'suspended') {
      console.log("Resuming potentially suspended AudioContext...")
      await audioContext.resume();
    }
  } catch (error) {
    console.error("Synth initialization failed:", error);
    // Reset promise if init failed, allowing retry? Or maybe keep it failed.
    // synthInitializationPromise = null; 
    throw error; // Re-throw so caller knows it failed
  }
}

// Remove button event listeners as keyboard input is now primary
// document.getElementById("note-on").addEventListener("click", ...);
// document.getElementById("note-off").addEventListener("click", ...);

// Remove the old click handler and replace with power button initialization
document.addEventListener('DOMContentLoaded', () => {
  const powerButton = document.getElementById('power-button');
  powerButton.addEventListener('click', handlePowerToggle);
});

console.log("Click the power button to enable audio and keyboard input.");

// Optional: Add cleanup if needed (e.g., for hot module replacement)
// window.addEventListener('beforeunload', () => {
//    removeKeyboardInput();
// });

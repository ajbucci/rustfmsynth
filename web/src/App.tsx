import { Component, onMount, onCleanup, createEffect, createSignal, For } from 'solid-js';
import { createStore, unwrap, SetStoreFunction } from 'solid-js/store';

import { AppState, AlgorithmSetterArg, MASTER_VOLUME_MIN, MASTER_VOLUME_MAX } from './state';
import { NUM_OPERATORS } from './config';

import {
  getAudioContext,
  closeAudioContext,
  addAudioWorkletModule,
  createAudioWorkletNode
} from './audio';

import * as SynthInputHandler from './synthInputHandler';
import { MidiInputHandler } from './midiHandlers';

import KeyboardUI from './components/KeyboardUI';
import AlgorithmMatrix from './components/AlgorithmMatrix';
import OperatorControl from './components/OperatorControl';
import PatchManager from './components/PatchManager';

import './style.css';
import { createDefaultAppState } from './defaults';
import { deserializeState } from './urlState';
import Crossfader from './components/Crossfader';
import Dial from './components/Dial';

export const [appStore, setAppStore] = createStore<AppState>(createDefaultAppState());
// export const setAppStore = createUrlStatePersistence(
//   appStore,
//   _setAppStoreOriginal as SetStoreFunction<AppState>, // Pass original setter
//   { debounceMs: 500 }
// );

const [isFineModeActive, setIsFineModeActive] = createSignal(false);
// Main App Component
const App: Component = () => {

  // Variable to hold the processor node reference (not reactive state)
  let processorNode: AudioWorkletNode | null = null;
  let midiHandlerInstance: MidiInputHandler | null = null;

  const [isSynthReady, setIsSynthReady] = createSignal(false);
  const [masterVolume, setMasterVolume] = createSignal(appStore.masterVolume);
  // --- Initialization Logic ---
  const initializeAudioAndSynth = async () => {
    console.log("App: Initializing Audio and Synth...");
    try {
      // 1. Get or Create AudioContext (will warn if suspended)
      const audioContext = getAudioContext();

      // 2. Load WASM - Needs to be fetched for the *main thread* first
      // to be sent to the worklet.
      console.log("App: Fetching Wasm binary...");
      const wasmResponse = await fetch("./pkg/rustfmsynth_bg.wasm"); // Path relative to public/index.html
      if (!wasmResponse.ok) throw new Error("Failed to fetch Wasm binary.");
      const wasmBinary = await wasmResponse.arrayBuffer();
      console.log("App: Wasm binary fetched.");


      // 3. Add Worklet Module
      await addAudioWorkletModule("./synth-processor.js");

      // 4. Create Worklet Node
      processorNode = createAudioWorkletNode("synth-processor", {
        numberOfOutputs: 1,
      });

      // 5. Set up Message Listener (Only for 'initialized' in this minimal setup)
      processorNode.port.onmessage = (event) => {
        if (event.data?.type === 'initialized') {
          console.log("App: Received 'initialized' confirmation from worklet.");
          setIsSynthReady(true);
          // Synth is ready in the worklet, now the handler is fully usable.
        } else if (event.data?.type === 'init_error') {
          console.error("App: Received initialization error from worklet:", event.data.error);
          // Handle critical init error - maybe display UI message
        } else if (event.data?.type === 'processing_error') {
          console.warn("App: Received processing error from worklet:", event.data.error, "for message:", event.data.messageType);
        } else {
          console.log("App: Received message from worklet:", event.data);
        }
      };
      processorNode.port.onmessageerror = (event) => {
        console.error("App: Error receiving message from worklet:", event);
      };

      // 6. Initialize SynthInputHandler with the Port
      // Do this *before* sending the init message so handler is ready conceptually
      SynthInputHandler.initializeSynthInputHandler(processorNode.port);

      // 7. Send 'init' message to Worklet with WASM binary
      console.log("App: Sending 'init' message with Wasm binary to processor...");
      processorNode.port.postMessage({
        type: "init",
        sampleRate: audioContext.sampleRate,
        wasmBinary: wasmBinary
      }, [wasmBinary]); // Mark wasmBinary as transferable

      // 8. Connect Node to Destination
      processorNode.connect(audioContext.destination);
      console.log("App: Processor node connected to destination.");

      console.log("App: Synth initialization sequence complete. Waiting for 'initialized' confirmation.");

    } catch (error) {
      console.error("App: Error during synthesizer initialization:", error);
      // Display error to user, potentially disable UI elements
      // (Error boundary component in Solid could be useful here)
      processorNode = null; // Ensure node ref is null on failure
    }
  };
  const handleMasterVolumeChange = (newValue: number) => {
    setMasterVolume(newValue);
    SynthInputHandler.setMasterVolume(newValue); // Call synth handler
  }
  // --- Fine Mode Global Listeners --- 
  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Shift" && !e.repeat && !isFineModeActive()) {
      // Use functional update form for signals too
      setIsFineModeActive(true);
      // Update body cursor directly (effect in Dial handles body cursor DURING drag)
      if (!document.body.classList.contains('dial-dragging-active')) {
        document.body.style.cursor = 'cell';
      }
    }
  };
  const handleGlobalKeyUp = (e: KeyboardEvent) => {
    if (e.key === "Shift" && isFineModeActive()) {
      // Use functional update form
      setIsFineModeActive(false);
      // Update body cursor directly
      if (!document.body.classList.contains('dial-dragging-active')) {
        document.body.style.cursor = '';
      }
    }
  };
  // --- Lifecycle ---
  onMount(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('keyup', handleGlobalKeyUp);
    initializeAudioAndSynth();
    midiHandlerInstance = new MidiInputHandler();
  });

  onCleanup(() => {
    console.log("App: Cleaning up...");
    // Disconnect node? Usually handled by context close.
    // if (processorNode) {
    //     processorNode.disconnect();
    // }
    window.removeEventListener('keydown', handleGlobalKeyDown);
    window.removeEventListener('keyup', handleGlobalKeyUp);
    closeAudioContext(); // Close context via the audio module
    SynthInputHandler.initializeSynthInputHandler(null); // Clear port in handler
    processorNode = null;
  });

  createEffect(() => {
    const ready = isSynthReady();

    if (!ready) {
      console.log("App: Skipping synth update, synth not ready.");
      return; // Don't send update yet
    }
    const hash = window.location.hash.slice(1);
    if (hash) {
      try {
        const decoded = deserializeState(hash);
        if (decoded) {
          setAppStore(decoded);
          history.replaceState(null, '', window.location.pathname);
        }
      } catch (err) {
        console.error('Failed to parse URL state', err);
      }
    }
    SynthInputHandler.setSynthState(unwrap(appStore));
  });
  // --- Render ---
  const operatorIndices = () => Array.from({ length: NUM_OPERATORS }, (_, i) => i); // 0-based for array access
  return (
    <div class="app-container">
      <div class="d-flex flex-row"
        style={{
          "align-items": "center",
          "justify-content": "center",
        }}>
        <div class="intro">
          <span class="title">The Synth</span>
          <p>Use your keyboard, MIDI, or click the keys below.</p>
        </div>

      </div>
      <div id="synth-container">
        <div class="controls-container d-flex flex-col flex-xxl-row">
          <div class="controls-top-row d-flex flex-col flex-md-row flex-xxl-col">
            <div class="matrix-master-container">
              <div class="parameter-container master-volume-container flex-row">
                <label class="parameter-title">Master Volume</label>
                <Dial
                  label={`Master Volume`}
                  id={`master-volume-control`}
                  value={masterVolume}
                  onChange={handleMasterVolumeChange}
                  isFineModeActive={isFineModeActive} // Pass fine mode down
                  // Pass fader-specific config
                  minVal={MASTER_VOLUME_MIN}
                  maxVal={MASTER_VOLUME_MAX}
                  valueDisplayFormatter={(value) => value.toFixed(0) + "%"}
                />
              </div>
              <AlgorithmMatrix
                numOperators={NUM_OPERATORS}
                algorithm={appStore.algorithm}
                setAlgorithmState={(updater: AlgorithmSetterArg) => setAppStore('algorithm', updater)}
              />
            </div>
            <PatchManager />
          </div>
          <div id="operator-controls"> {/* Wrapper for layout */}
            <For each={operatorIndices()}>
              {(opIndex) => (
                <OperatorControl
                  operatorIndex={opIndex}
                  isFineModeActive={isFineModeActive}
                />
              )}
            </For>

          </div>

        </div>
        <KeyboardUI initialStartNote={48} />
      </div>
    </div >
  );
};

export default App;

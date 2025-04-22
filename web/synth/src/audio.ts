let audioCtx: AudioContext | null = null;

/**
 * Gets the existing AudioContext or creates a new one if it doesn't exist.
 * Logs warnings if the context is initially suspended.
 * @returns {AudioContext} The application's AudioContext instance.
 */
export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
      console.log("AudioContext created. Sample rate:", audioCtx.sampleRate);
      // Check initial state immediately after creation
      if (audioCtx.state === 'suspended') {
        console.warn("AudioContext is suspended. User interaction (e.g., click/keypress) is required to start audio.");
      }
    } catch (e) {
      console.error("Failed to create AudioContext:", e);
      // Handle error appropriately - maybe display a message to the user?
      // Re-throwing might be appropriate if the app cannot function without it.
      throw new Error("Could not create AudioContext. Web Audio API may not be supported.");
    }
  }
  return audioCtx;
}

/**
 * Attempts to resume the AudioContext if it exists and is suspended.
 * Should be called in response to a user gesture (click, keypress, etc.).
 * Does nothing if the context doesn't exist or is already running.
 */
export function resumeAudioContext(): void {
  // Use getAudioContext() only to check state if it exists, don't create it here.
  if (audioCtx && audioCtx.state === 'suspended') {
    console.log("Attempting to resume AudioContext...");
    audioCtx.resume().then(() => {
      console.log("AudioContext resumed successfully.");
    }).catch(e => console.warn("AudioContext.resume() failed:", e));
    // Note: No await needed, resume runs asynchronously.
  }
}

/**
 * Closes the AudioContext if it exists, releasing system resources.
 * Sets the internal reference to null.
 */
export function closeAudioContext(): void {
  if (audioCtx) {
    const currentContext = audioCtx; // Capture ref in case of async issues
    audioCtx = null; // Set internal ref to null immediately
    currentContext.close().then(() => {
      console.log("AudioContext closed.");
    }).catch(e => {
      console.error("Error closing AudioContext:", e);
      // Restore ref if close failed? Unlikely needed.
      // audioCtx = currentContext;
    });
  }
}

/**
 * Creates the AudioWorkletNode, attaching it to the AudioContext.
 * Requires the AudioContext to be initialized first.
 * @param {string} processorName - The name the processor was registered with.
 * @param {AudioWorkletNodeOptions} [options] - Optional options for the node.
 * @returns {AudioWorkletNode} The created AudioWorkletNode.
 * @throws {Error} If AudioContext is not initialized or node creation fails.
 */
export function createAudioWorkletNode(processorName: string, options?: AudioWorkletNodeOptions): AudioWorkletNode {
  const context = getAudioContext(); // Ensures context exists or throws
  try {
    const node = new AudioWorkletNode(context, processorName, options);
    console.log(`AudioWorkletNode '${processorName}' created.`);
    return node;
  } catch (e) {
    console.error(`Failed to create AudioWorkletNode '${processorName}':`, e);
    throw e; // Re-throw the error
  }
}

/**
 * Loads the AudioWorklet module into the AudioContext.
 * Requires the AudioContext to be initialized first.
 * @param {string} moduleUrl - The URL path to the processor's JS file.
 * @returns {Promise<void>} A promise that resolves when the module is added.
 * @throws {Error} If AudioContext is not initialized or module loading fails.
 */
export async function addAudioWorkletModule(moduleUrl: string): Promise<void> {
  const context = getAudioContext(); // Ensures context exists or throws
  try {
    await context.audioWorklet.addModule(moduleUrl);
    console.log(`AudioWorklet module loaded from: ${moduleUrl}`);
  } catch (e) {
    console.error(`Failed to load AudioWorklet module from ${moduleUrl}:`, e);
    throw e; // Re-throw the error
  }
}

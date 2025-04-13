// Import the shared message sending function and audio resume function
import { tryEnsureSynthAndSendMessage } from './keyboard-input.js';
import { resumeAudioContext, handleUIChange } from './app.js';
import { createDial } from './dial.js';
import { createVerticalCrossfader } from './crossfader.js';
export const NUM_OPERATORS = 6; // Example: Define and export
const containerId = 'operator-controls'; // ID of the container div in index.html

// Define the available waveforms and their corresponding integer values
// IMPORTANT: These integer values MUST match the order/representation
// expected by your Rust `set_operator_waveform` function.
const WAVEFORMS = [
  { name: "Sine", value: 0 },
  { name: "Triangle", value: 1 },
  { name: "Square", value: 2 },
  { name: "Sawtooth", value: 3 },
  { name: "Noise", value: 4 },
];
const DEFAULT_WAVEFORM_VALUE = 0; // Default to Sine (value 0)

// Define the sticky points for the ratio slider
const STICKY_RATIO_POINTS = [0.125, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0];
const STICKY_THRESHOLD = 0.05; // How close the slider needs to be to snap

// --- ADSR Envelope Defaults and Limits ---
const DEFAULT_ATTACK = 0.01;
const DEFAULT_DECAY = 0.1;
const DEFAULT_SUSTAIN = 0.8; // Sustain level (0.0 - 1.0)
const DEFAULT_RELEASE = 0.5;
const MIN_TIME = 0.0;
const MAX_TIME = 10.0; // Max seconds for A, D, R
const MIN_SUSTAIN = 0.0;
const MAX_SUSTAIN = 1.0;
const TIME_STEP = 0.01;
const SUSTAIN_STEP = 0.01;

// --- Function to Send Update ---
export const sendRatioUpdate = async (opIndex, ratioValue) => {
  resumeAudioContext(); // Ensure context is running

  const message = {
    type: 'set_operator_ratio',
    operator_index: opIndex,
    ratio: ratioValue
  };
  const messageId = `set-ratio-op-${opIndex}`; // Unique ID
  const success = await tryEnsureSynthAndSendMessage(messageId, message);
  if (success) {
    console.log(`Sent ratio update for Op ${opIndex + 1}: ${ratioValue}`);
    handleUIChange(); // Call callback on success
  } else {
    console.warn(`Operator Controls: Failed to send set_operator_ratio for operator ${opIndex}`);
  }
  // Return success status (optional, but can be useful)
  return success;
};
// --- Function to Send Modulation Index Update ---
export const sendModulationIndexUpdate = async (opIndex, modIndexValue) => {
  resumeAudioContext(); // Ensure context is running

  const message = {
    type: 'set_operator_modulation_index',
    operator_index: opIndex,
    modulation_index: modIndexValue
  };
  const messageId = `set-mod-index-op-${opIndex}`; // Unique ID
  const success = await tryEnsureSynthAndSendMessage(messageId, message);
  if (success) {
    console.log(`Sent mod index update for Op ${opIndex + 1}: ${modIndexValue}`);
    handleUIChange(); // Call callback on success
  } else {
    console.warn(`Operator Controls: Failed to send set_operator_modulation_index for operator ${opIndex}`);
  }
  return success;
};
// +++ NEW FUNCTION: Get current states from UI +++
export function getOperatorStates() {
  const states = [];
  for (let i = 0; i < NUM_OPERATORS; i++) {
    const ratioInput = document.getElementById(`op-${i}-ratio-input`);
    const modIndexInput = document.getElementById(`op-${i}-mod-index-input`);
    const waveformSelect = document.getElementById(`op-${i}-waveform`);
    const attackInput = document.getElementById(`op-${i}-adsr-attack`);
    const decayInput = document.getElementById(`op-${i}-adsr-decay`);
    const sustainInput = document.getElementById(`op-${i}-adsr-sustain`);
    const releaseInput = document.getElementById(`op-${i}-adsr-release`);

    // Define default values locally for robustness
    const defaultState = {
      ratio: 1.0, modIndex: 0.0, waveform: DEFAULT_WAVEFORM_VALUE,
      attack: DEFAULT_ATTACK, decay: DEFAULT_DECAY, sustain: DEFAULT_SUSTAIN, release: DEFAULT_RELEASE
    };

    if (ratioInput && modIndexInput && waveformSelect && attackInput && decayInput && sustainInput && releaseInput) {
      states.push({
        ratio: parseFloat(ratioInput.value) || defaultState.ratio,
        modIndex: parseFloat(modIndexInput.value) || defaultState.modIndex, // Note: 0 is falsy, || might not be ideal if 0 is valid non-default. Use ?? in modern JS. Let's assume defaults are non-zero where applicable or check isNaN.
        waveform: parseInt(waveformSelect.value) ?? defaultState.waveform, // Use nullish coalescing
        attack: parseFloat(attackInput.value) ?? defaultState.attack,
        decay: parseFloat(decayInput.value) ?? defaultState.decay,
        sustain: parseFloat(sustainInput.value) ?? defaultState.sustain,
        release: parseFloat(releaseInput.value) ?? defaultState.release
      });
    } else {
      console.warn(`Could not find all controls for operator ${i + 1} when getting state. Using defaults.`);
      states.push(defaultState); // Push default state if controls are missing
    }
  }
  return states;
}

// +++ NEW FUNCTION: Apply states to UI only +++
export function applyOperatorStatesUI(operatorStates) {
  if (!Array.isArray(operatorStates)) {
    console.error("Invalid operator states data for applying to UI.");
    return;
  }

  // Define default values locally for robustness when applying state
  const defaultState = {
    ratio: 1.0, modIndex: 0.0, waveform: DEFAULT_WAVEFORM_VALUE,
    attack: DEFAULT_ATTACK, decay: DEFAULT_DECAY, sustain: DEFAULT_SUSTAIN, release: DEFAULT_RELEASE
  };

  for (let i = 0; i < NUM_OPERATORS; i++) {
    // Use provided state or fallback to default if state for this index is missing/nullish
    const state = operatorStates[i] ?? defaultState;
    // Even if state exists, individual properties might be missing in older versions/malformed data
    const ratio = state.ratio ?? defaultState.ratio;
    const modIndex = state.modIndex ?? defaultState.modIndex;
    const waveform = state.waveform ?? defaultState.waveform;
    const attack = state.attack ?? defaultState.attack;
    const decay = state.decay ?? defaultState.decay;
    const sustain = state.sustain ?? defaultState.sustain;
    const release = state.release ?? defaultState.release;


    const ratioNum = document.getElementById(`op-${i}-ratio-input`);
    const modIndexInput = document.getElementById(`op-${i}-mod-index-input`);
    const waveformSelect = document.getElementById(`op-${i}-waveform`);
    const attackInput = document.getElementById(`op-${i}-adsr-attack`);
    const decayInput = document.getElementById(`op-${i}-adsr-decay`);
    const sustainInput = document.getElementById(`op-${i}-adsr-sustain`);
    const releaseInput = document.getElementById(`op-${i}-adsr-release`);

    // Update UI elements, checking if they exist
    var changeEvent = new Event('change');
    if (ratioNum) ratioNum.value = ratio.toFixed(ratio >= 1 ? 3 : 4);
    ratioNum.dispatchEvent(changeEvent); // Trigger change event
    if (modIndexInput) modIndexInput.value = modIndex.toFixed(2);
    modIndexInput.dispatchEvent(changeEvent); // Trigger change event
    if (waveformSelect) waveformSelect.value = waveform.toString();
    if (attackInput) attackInput.value = attack.toFixed(3);
    if (decayInput) decayInput.value = decay.toFixed(3);
    if (sustainInput) sustainInput.value = sustain.toFixed(2);
    if (releaseInput) releaseInput.value = release.toFixed(3);
  }
  console.log("Applied operator states to UI controls.");
}

/**
 * Resets all operator UI controls to their default values.
 */
export function resetOperatorControlsUI() {
  console.log("Resetting operator controls UI to defaults...");
  const defaultState = {
    ratio: 1.0, modIndex: 1.0, waveform: DEFAULT_WAVEFORM_VALUE, // Default mod index might be 0 or 1 depending on preference
    attack: DEFAULT_ATTACK, decay: DEFAULT_DECAY, sustain: DEFAULT_SUSTAIN, release: DEFAULT_RELEASE
  };
  const defaultStatesArray = Array(NUM_OPERATORS).fill(defaultState);
  applyOperatorStatesUI(defaultStatesArray); // Reuse the apply function with default data
  console.log("Operator controls UI reset complete.");
}

/**
 * Creates the HTML elements (label, dial, number input, waveform select, ADSR) for a single operator
 * and adds the necessary event listeners for synchronization and updates.
 * @param {number} index - The 0-based index of the operator.
 * @param {HTMLElement} container - The parent container element to append to.
 * @param {function(): void} onStateChangeCallback - Function to call after a parameter is successfully sent.
 */
function createOperatorControl(index, container, onStateChangeCallback) {
  console.log(` -> createOperatorControl(index: ${index})`);
  const controlWrapper = document.createElement('div');
  controlWrapper.classList.add('operator-control');

  // --- Label ---
  const label = document.createElement('label');
  label.htmlFor = `op-${index}-ratio-dial`; // Point label to the dial
  label.textContent = `Op ${index + 1} Ratio:`;
  controlWrapper.appendChild(label);

  // --- Range Input (Dial) ---
  // TODO: add initial value from operator state
  const dialContainer = createDial(index);
  controlWrapper.appendChild(dialContainer);

  const crossfaderContainer = createVerticalCrossfader(index, 1.00);
  controlWrapper.appendChild(crossfaderContainer);

  // --- Waveform Label ---
  const waveformLabel = document.createElement('label');
  waveformLabel.htmlFor = `op-${index}-waveform`;
  waveformLabel.textContent = `Waveform:`;
  waveformLabel.style.marginTop = '10px'; // Add some space above waveform selector
  controlWrapper.appendChild(waveformLabel);

  // --- Waveform Select (Dropdown) ---
  const waveformSelect = document.createElement('select');
  waveformSelect.id = `op-${index}-waveform`;
  waveformSelect.dataset.operatorIndex = index; // Store index

  // Populate dropdown options
  WAVEFORMS.forEach(wf => {
    const option = document.createElement('option');
    option.value = wf.value.toString(); // Store the integer value
    option.textContent = wf.name;       // Display the name
    if (wf.value === DEFAULT_WAVEFORM_VALUE) {
      option.selected = true; // Set default selection
    }
    waveformSelect.appendChild(option);
  });
  controlWrapper.appendChild(waveformSelect);

  // --- ADSR Envelope Controls ---
  const adsrWrapper = document.createElement('div');
  adsrWrapper.classList.add('adsr-controls');
  adsrWrapper.style.marginTop = '15px'; // Add space before envelope controls
  adsrWrapper.style.borderTop = '1px solid #ccc'; // Separator line
  adsrWrapper.style.paddingTop = '10px';

  const adsrTitle = document.createElement('div');
  adsrTitle.textContent = 'Envelope:';
  adsrTitle.style.fontWeight = 'bold';
  adsrTitle.style.marginBottom = '5px';
  adsrWrapper.appendChild(adsrTitle);

  // Helper to create Label + Number Input pairs
  const createAdsrInput = (paramName, defaultValue, min, max, step) => {
    const paramWrapper = document.createElement('div');
    paramWrapper.classList.add('adsr-param');

    const label = document.createElement('label');
    label.htmlFor = `op-${index}-adsr-${paramName.toLowerCase()}`;
    label.textContent = `${paramName}:`;

    const input = document.createElement('input');
    input.type = 'number';
    input.id = `op-${index}-adsr-${paramName.toLowerCase()}`;
    input.value = defaultValue.toFixed(paramName === 'Sustain' ? 2 : 3); // Adjust precision
    input.min = min.toString();
    input.max = max.toString();
    input.step = step.toString();
    input.dataset.operatorIndex = index; // Store index

    paramWrapper.appendChild(label);
    paramWrapper.appendChild(input);
    return paramWrapper;
  };

  // Create A, D, S, R inputs
  adsrWrapper.appendChild(createAdsrInput('Attack', DEFAULT_ATTACK, MIN_TIME, MAX_TIME, TIME_STEP));
  adsrWrapper.appendChild(createAdsrInput('Decay', DEFAULT_DECAY, MIN_TIME, MAX_TIME, TIME_STEP));
  adsrWrapper.appendChild(createAdsrInput('Sustain', DEFAULT_SUSTAIN, MIN_SUSTAIN, MAX_SUSTAIN, SUSTAIN_STEP));
  adsrWrapper.appendChild(createAdsrInput('Release', DEFAULT_RELEASE, MIN_TIME, MAX_TIME, TIME_STEP));

  // Create Set Button
  const setButton = document.createElement('button');
  setButton.textContent = 'Set Envelope';
  setButton.id = `op-${index}-adsr-set`;
  setButton.dataset.operatorIndex = index;
  setButton.style.marginTop = '8px';
  adsrWrapper.appendChild(setButton);

  controlWrapper.appendChild(adsrWrapper); // Add ADSR section to the main wrapper

  // --- Function to Send Waveform Update ---
  const sendWaveformUpdate = async (opIndex, waveformValue) => {
    resumeAudioContext();
    const message = {
      type: 'set_operator_waveform',
      operator_index: opIndex,
      waveform_value: waveformValue
    };
    const messageId = `set-waveform-op-${opIndex}`;
    const success = await tryEnsureSynthAndSendMessage(messageId, message);
    if (success) {
      const waveformName = WAVEFORMS.find(wf => wf.value === waveformValue)?.name || 'Unknown';
      console.log(`Sent waveform update for Op ${opIndex + 1}: ${waveformName} (${waveformValue})`);
      onStateChangeCallback(); // Call callback on success
    } else {
      console.warn(`Operator Controls: Failed to send set_operator_waveform for operator ${opIndex}`);
    }
    return success;
  };

  // --- Function to Send Envelope Update ---
  const sendEnvelopeUpdate = async (opIndex, attack, decay, sustain, release) => {
    resumeAudioContext(); // Ensure context is running

    const message = {
      type: 'set_operator_envelope',
      operator_index: opIndex,
      attack: attack,
      decay: decay,
      sustain: sustain,
      release: release
    };
    const messageId = `set-envelope-op-${opIndex}`; // Unique ID for throttling/logging
    const success = await tryEnsureSynthAndSendMessage(messageId, message);
    if (success) {
      console.log(`Sent envelope update for Op ${opIndex + 1}: A=${attack.toFixed(3)} D=${decay.toFixed(3)} S=${sustain.toFixed(2)} R=${release.toFixed(3)}`);
      onStateChangeCallback(); // Call callback on success
    } else {
      console.warn(`Operator Controls: Failed to send set_operator_envelope for operator ${opIndex}`);
    }
    return success;
  };

  // --- Event Listener for Waveform Select ---
  waveformSelect.addEventListener('change', (event) => { // No need for async on the listener itself
    resumeAudioContext(); // Good practice

    const targetSelect = event.currentTarget;
    const operatorIndex = parseInt(targetSelect.dataset.operatorIndex);
    const waveformValue = parseInt(targetSelect.value);

    // Send the update (don't await)
    sendWaveformUpdate(operatorIndex, waveformValue);
  });

  // --- Event Listener for ADSR Set Button ---
  setButton.addEventListener('click', (event) => { // No need for async on the listener itself
    const targetButton = event.currentTarget;
    const operatorIndex = parseInt(targetButton.dataset.operatorIndex);

    // Find the input elements
    const attackInput = document.getElementById(`op-${operatorIndex}-adsr-attack`);
    const decayInput = document.getElementById(`op-${operatorIndex}-adsr-decay`);
    const sustainInput = document.getElementById(`op-${operatorIndex}-adsr-sustain`);
    const releaseInput = document.getElementById(`op-${operatorIndex}-adsr-release`);

    if (!attackInput || !decayInput || !sustainInput || !releaseInput) {
      console.error(`Could not find all ADSR input elements for operator ${operatorIndex}`);
      return; // Stop if elements aren't found
    }

    // Get and parse values, providing defaults if parsing fails
    let attack = parseFloat(attackInput.value) || DEFAULT_ATTACK;
    let decay = parseFloat(decayInput.value) || DEFAULT_DECAY;
    let sustain = parseFloat(sustainInput.value) || DEFAULT_SUSTAIN;
    let release = parseFloat(releaseInput.value) || DEFAULT_RELEASE;

    // Clamp values to their defined ranges
    attack = Math.max(MIN_TIME, Math.min(MAX_TIME, attack));
    decay = Math.max(MIN_TIME, Math.min(MAX_TIME, decay));
    sustain = Math.max(MIN_SUSTAIN, Math.min(MAX_SUSTAIN, sustain));
    release = Math.max(MIN_TIME, Math.min(MAX_TIME, release));

    // Update the input fields visually *before* sending
    attackInput.value = attack.toFixed(3);
    decayInput.value = decay.toFixed(3);
    sustainInput.value = sustain.toFixed(2);
    releaseInput.value = release.toFixed(3);

    // Send the update to the synth processor (don't await)
    sendEnvelopeUpdate(operatorIndex, attack, decay, sustain, release);
  });

  // Append the whole control to the main container
  if (container && controlWrapper) {
    container.appendChild(controlWrapper);
    console.log(` -> Appended control wrapper for index ${index} to container.`);
  } else {
    console.error(` -> Failed to append control wrapper for index ${index}. Container or wrapper missing.`);
  }
}

/**
 * Initializes the operator control dials.
 * @param {HTMLElement} container - The container element to populate. MUST be provided now.
 * @param {function(): void} onStateChangeCallback - Function to call when any operator state changes.
 */
export function initializeOperatorControls(container, onStateChangeCallback) {
  // Remove the fallback lookup, rely on the element passed from app.js
  // if (!container) {
  //     container = document.getElementById(containerId);
  // }

  // Check if a valid container was passed
  if (!container || !(container instanceof HTMLElement)) { // More robust check
    console.error(`Operator Controls Initialization: Invalid or missing container element provided.`, container);
    return; // Stop if no valid container
  }

  // Ensure callback is a function
  if (typeof onStateChangeCallback !== 'function') {
    console.warn("Operator Controls: No valid onStateChangeCallback provided.");
    onStateChangeCallback = () => { }; // Default no-op
  }

  console.log("Initializing operator controls inside provided container:", container);
  // Clear existing content explicitly
  container.innerHTML = '';
  console.log(`Cleared container #${container.id || 'no-id'}. Creating controls...`);


  for (let i = 0; i < NUM_OPERATORS; i++) {
    console.log(`Creating control ${i + 1}/${NUM_OPERATORS}...`);
    try {
      createOperatorControl(i, container, onStateChangeCallback); // Pass the provided container down
    } catch (error) {
      console.error(`Error creating operator control ${i}:`, error);
      // Continue trying to create others if possible
    }
  }
  console.log(`${NUM_OPERATORS} operator controls generation loop finished.`);
  // Add a final check
  if (container.children.length === NUM_OPERATORS) {
    console.log(`Successfully generated ${container.children.length} control elements.`);
  } else {
    console.warn(`Generated ${container.children.length} controls, but expected ${NUM_OPERATORS}. Check for errors above.`);
  }
}

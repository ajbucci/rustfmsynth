// Import the shared message sending function and audio resume function
import { tryEnsureSynthAndSendMessage } from './keyboard-input.js';
import { resumeAudioContext } from './app.js';

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

/**
 * Creates the HTML elements (label, dial, number input, waveform select) for a single operator
 * and adds the necessary event listeners for synchronization and updates.
 * @param {number} index - The 0-based index of the operator.
 * @param {HTMLElement} container - The parent container element to append to.
 */
function createOperatorControl(index, container) {
    const controlWrapper = document.createElement('div');
    controlWrapper.classList.add('operator-control');

    // --- Label ---
    const label = document.createElement('label');
    label.htmlFor = `op-${index}-ratio-dial`; // Point label to the dial
    label.textContent = `Op ${index + 1} Ratio:`;
    controlWrapper.appendChild(label);

    // --- Range Input (Dial) ---
    // TODO: add initial value from operator state
    const dial = document.createElement('input');
    dial.type = 'range';
    dial.id = `op-${index}-ratio-dial`; // Unique ID for the dial
    const minRatio = 0.1;
    const maxRatio = 8.0;
    const stepRatio = 0.01;
    dial.min = minRatio.toString();
    dial.max = maxRatio.toString();
    dial.step = stepRatio.toString();
    dial.value = '1.0'; // Default ratio
    dial.dataset.operatorIndex = index;
    controlWrapper.appendChild(dial);

    // --- Number Input ---
    const numberInput = document.createElement('input');
    numberInput.type = 'number';
    numberInput.id = `op-${index}-ratio-num`; // Unique ID for the number input
    numberInput.min = minRatio.toString();
    numberInput.max = maxRatio.toString();
    numberInput.step = stepRatio.toString();
    numberInput.value = parseFloat(dial.value).toFixed(2); // Set initial value from dial
    numberInput.dataset.operatorIndex = index; // Store index here too
    controlWrapper.appendChild(numberInput);

    // --- Modulation Index Label ---
    const modIndexLabel = document.createElement('label');
    modIndexLabel.htmlFor = `op-${index}-mod-index-dial`;
    modIndexLabel.textContent = `Mod Index:`;
    modIndexLabel.style.marginTop = '10px'; // Add some space
    controlWrapper.appendChild(modIndexLabel);

    // --- Modulation Index Range Input (Dial) ---
    const modIndexDial = document.createElement('input');
    modIndexDial.type = 'range';
    modIndexDial.id = `op-${index}-mod-index-dial`;
    const minModIndex = 0.0;
    const maxModIndex = 10.0; // Example max value, adjust as needed
    const stepModIndex = 0.1;
    modIndexDial.min = minModIndex.toString();
    modIndexDial.max = maxModIndex.toString();
    modIndexDial.step = stepModIndex.toString();
    modIndexDial.value = '0.0'; // Default modulation index
    modIndexDial.dataset.operatorIndex = index;
    controlWrapper.appendChild(modIndexDial);

    // --- Modulation Index Number Input ---
    const modIndexNumberInput = document.createElement('input');
    modIndexNumberInput.type = 'number';
    modIndexNumberInput.id = `op-${index}-mod-index-num`;
    modIndexNumberInput.min = minModIndex.toString();
    modIndexNumberInput.max = maxModIndex.toString();
    modIndexNumberInput.step = stepModIndex.toString();
    modIndexNumberInput.value = parseFloat(modIndexDial.value).toFixed(1); // Sync with dial
    modIndexNumberInput.dataset.operatorIndex = index;
    controlWrapper.appendChild(modIndexNumberInput);

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
    adsrTitle.textContent = 'Amplitude Envelope:';
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
        label.style.display = 'inline-block';
        label.style.width = '50px'; // Align labels

        const input = document.createElement('input');
        input.type = 'number';
        input.id = `op-${index}-adsr-${paramName.toLowerCase()}`;
        input.value = defaultValue.toFixed(paramName === 'Sustain' ? 2 : 3); // Adjust precision
        input.min = min.toString();
        input.max = max.toString();
        input.step = step.toString();
        input.style.width = '60px'; // Control input width
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

    // --- Function to Send Update ---
    // Avoid duplicating message sending logic
    const sendUpdate = async (opIndex, ratioValue) => {
        resumeAudioContext(); // Ensure context is running

        const message = {
            type: 'set_operator_ratio',
            operator_index: opIndex,
            ratio: ratioValue
        };
        const messageId = `set-ratio-op-${opIndex}`; // Unique ID
        const success = await tryEnsureSynthAndSendMessage(messageId, message);
        if (!success) {
            console.warn(`Operator Controls: Failed to send set_operator_ratio for operator ${opIndex}`);
        }
    };

    // --- Function to Send Modulation Index Update ---
    const sendModulationIndexUpdate = async (opIndex, modIndexValue) => {
        resumeAudioContext(); // Ensure context is running

        const message = {
            type: 'set_operator_modulation_index',
            operator_index: opIndex,
            modulation_index: modIndexValue
        };
        const messageId = `set-mod-index-op-${opIndex}`; // Unique ID
        const success = await tryEnsureSynthAndSendMessage(messageId, message);
        if (!success) {
            console.warn(`Operator Controls: Failed to send set_operator_modulation_index for operator ${opIndex}`);
        }
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
        if (!success) {
            console.warn(`Operator Controls: Failed to send set_operator_envelope for operator ${opIndex}`);
            // You could add UI feedback here if needed (e.g., make button red temporarily)
        } else {
            console.log(`Sent envelope update for Op ${opIndex + 1}: A=${attack} D=${decay} S=${sustain} R=${release}`);
             // Optional: Add success feedback (e.g., temporary style change)
        }
        return success;
    };

    // --- Event Listener for Slider ('input' for real-time) ---
    dial.addEventListener('input', (event) => {
        const targetDial = event.currentTarget;
        const operatorIndex = parseInt(targetDial.dataset.operatorIndex);
        let ratio = parseFloat(targetDial.value);

        // --- Sticky Logic ---
        let snapped = false;
        for (const stickyPoint of STICKY_RATIO_POINTS) {
            if (Math.abs(ratio - stickyPoint) < STICKY_THRESHOLD) {
                 // Check if the slider is actually moving *towards* the sticky point
                 // or if it just snapped on the previous event. This prevents getting stuck.
                 // We store the previous value temporarily for this check.
                 const previousValue = parseFloat(targetDial.dataset.previousValue || ratio.toString());
                 if (Math.abs(ratio - stickyPoint) < Math.abs(previousValue - stickyPoint)) {
                    ratio = stickyPoint;
                    targetDial.value = ratio.toString(); // Update the slider position itself
                    snapped = true;
                    break; // Snap to the first encountered sticky point
                 }
            }
        }
        // Store the current value (snapped or not) for the next event's check
        targetDial.dataset.previousValue = ratio.toString();

        // Update the number input's value to match the slider (potentially snapped)
        numberInput.value = ratio.toFixed(2);

        // Send the update to the synth processor
        // No need to await here, let it send in the background
        sendUpdate(operatorIndex, ratio);
    });

    // --- Event Listener for Number Input ('change' fires on blur/enter) ---
    numberInput.addEventListener('change', (event) => {
        const targetInput = event.currentTarget;
        const operatorIndex = parseInt(targetInput.dataset.operatorIndex);
        let ratio = parseFloat(targetInput.value);

        // Validate and clamp the input value
        if (isNaN(ratio)) {
            ratio = parseFloat(dial.value); // Revert to slider value if invalid
        } else {
            ratio = Math.max(minRatio, Math.min(maxRatio, ratio)); // Clamp to min/max
        }

        // Update the input field itself with the potentially clamped value (formatted)
        targetInput.value = ratio.toFixed(2);

        // Update the slider's value to match the number input
        dial.value = ratio.toString();
        // Clear previous value tracker when number input changes directly
        delete dial.dataset.previousValue;

        // Send the update to the synth processor
        // No need to await here
        sendUpdate(operatorIndex, ratio);
    });

    // --- Event Listener for Modulation Index Slider ---
    modIndexDial.addEventListener('input', (event) => {
        const targetDial = event.currentTarget;
        const operatorIndex = parseInt(targetDial.dataset.operatorIndex);
        const modIndex = parseFloat(targetDial.value);

        // Update the number input
        modIndexNumberInput.value = modIndex.toFixed(1);

        // Send the update
        sendModulationIndexUpdate(operatorIndex, modIndex);
    });

    // --- Event Listener for Modulation Index Number Input ---
    modIndexNumberInput.addEventListener('change', (event) => {
        const targetInput = event.currentTarget;
        const operatorIndex = parseInt(targetInput.dataset.operatorIndex);
        let modIndex = parseFloat(targetInput.value);

        // Validate and clamp
        if (isNaN(modIndex)) {
            modIndex = parseFloat(modIndexDial.value); // Revert
        } else {
            modIndex = Math.max(minModIndex, Math.min(maxModIndex, modIndex)); // Clamp
        }

        // Update the input field
        targetInput.value = modIndex.toFixed(1);

        // Update the slider
        modIndexDial.value = modIndex.toString();

        // Send the update
        sendModulationIndexUpdate(operatorIndex, modIndex);
    });

    // --- Event Listener for Waveform Select ---
    waveformSelect.addEventListener('change', async (event) => {
        resumeAudioContext(); // Ensure context is running

        const targetSelect = event.currentTarget;
        const operatorIndex = parseInt(targetSelect.dataset.operatorIndex);
        const waveformValue = parseInt(targetSelect.value); // Get selected integer value

        // Prepare the message
        const message = {
            type: 'set_operator_waveform',
            operator_index: operatorIndex,
            waveform_value: waveformValue // Send the integer value
        };
        const messageId = `set-waveform-op-${operatorIndex}`; // Unique ID

        // Attempt to send the message
        const success = await tryEnsureSynthAndSendMessage(messageId, message);
        if (!success) {
            console.warn(`Operator Controls: Failed to send set_operator_waveform for operator ${operatorIndex}`);
            // Optional: Revert dropdown if send fails? Might be complex.
        }
    });

    // --- Event Listener for ADSR Set Button ---
    setButton.addEventListener('click', async (event) => {
        const targetButton = event.currentTarget;
        const operatorIndex = parseInt(targetButton.dataset.operatorIndex);

        // Find the input elements associated with this operator's ADSR section
        // Using IDs is reliable here
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

        // Optional: Update the input fields visually with the clamped values
        attackInput.value = attack.toFixed(3);
        decayInput.value = decay.toFixed(3);
        sustainInput.value = sustain.toFixed(2);
        releaseInput.value = release.toFixed(3);

        // Send the update to the synth processor
        await sendEnvelopeUpdate(operatorIndex, attack, decay, sustain, release);
    });

    // Append the whole control to the main container
    container.appendChild(controlWrapper);
}

/**
 * Initializes the operator control dials.
 * Finds the container element and generates controls for each operator.
 * Should be called once the DOM is ready.
 * @param {HTMLElement} container - The container element to populate. If null, it will try to find by ID.
 */
export function initializeOperatorControls(container = null) {
    if (!container) {
        container = document.getElementById(containerId);
    }
    if (!container) {
        console.error(`Operator Controls: Container element with ID #${containerId} not found.`);
        return;
    }

    console.log("Initializing operator controls...");
    container.innerHTML = ''; // Clear any placeholder content

    for (let i = 0; i < NUM_OPERATORS; i++) {
        createOperatorControl(i, container);
    }
    console.log(`${NUM_OPERATORS} operator controls generated and initialized.`);
}
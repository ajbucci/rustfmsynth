// Import the shared message sending function and audio resume function
import { tryEnsureSynthAndSendMessage } from './keyboard-input.js';
import { resumeAudioContext } from './app.js';

export const NUM_OPERATORS = 4; // Example: Define and export
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
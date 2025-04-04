// Import the shared message sending function and audio resume function
import { tryEnsureSynthAndSendMessage } from './keyboard-input.js';
import { resumeAudioContext } from './app.js';

const NUM_OPERATORS = 4; // Hardcoded number of operators
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

    // --- Event Listener for Slider ('input' for real-time) ---
    dial.addEventListener('input', (event) => {
        const targetDial = event.currentTarget;
        const operatorIndex = parseInt(targetDial.dataset.operatorIndex);
        const ratio = parseFloat(targetDial.value);

        // Update the number input's value to match the slider
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

        // Send the update to the synth processor
        // No need to await here
        sendUpdate(operatorIndex, ratio);
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
 */
export function initializeOperatorControls() {
    const container = document.getElementById(containerId);
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
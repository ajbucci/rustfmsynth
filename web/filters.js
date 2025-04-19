// Central configuration for filters and their parameters
import { tryEnsureSynthAndSendMessage } from './keyboard-input.js';
import { resumeAudioContext, debounceHandleUIChange } from './app.js';
const FILTERS = [
  {
    name: "Low Pass", // Human-readable name
    value: "lowpass",         // Value sent to Rust/WASM (can be string or number)
    params: [         // Array of parameter definitions for this filter
      { name: "Cutoff", id: "cutoff", default: 10000.0, min: 20.0, max: 20000.0, step: 1.0, unit: "Hz" },
      { name: "Q", id: "q", default: 0.707, min: 0.1, max: 10.0, step: 0.01, unit: "" }
      // Add more params for LowPass if needed
    ]
  },
  {
    name: "Comb",
    value: "comb",
    params: [
      { name: "Alpha", id: "alpha", default: 0.5, min: -1.0, max: 1.0, step: 0.01, unit: "" }, // Feedback/Gain
      { name: "K", id: "k", default: 100, min: 1, max: 4096, step: 1, unit: "samples" }         // Delay length
    ]
  },
  {
    name: "Pitched Comb",
    value: "pitched_comb",
    params: [
      { name: "Alpha", id: "alpha", default: 0.95, min: -1.0, max: 1.0, step: 0.01, unit: "" } // Usually positive feedback, close to 1
    ]
  },
  {
    name: "None", // Bypass option
    value: "none",
    params: []     // No parameters
  }
];
// --- Function to Send Update ---
export const sendSetFilter = async (opIndex, filterValue, filterParams) => {
  resumeAudioContext(); // Ensure context is running

  const message = {
    type: 'set_operator_filter',
    operator_index: opIndex,
    filterValue: filterValue,
    filterParams: filterParams,
  };
  const messageId = `set-filter-op-${opIndex}`; // Unique ID
  const success = await tryEnsureSynthAndSendMessage(messageId, message);
  if (success) {
    debounceHandleUIChange(); // Call callback on success
  } else {
    console.warn(`Operator Controls: Failed to send set_operator_filter for operator ${opIndex}`);
  }
  // Return success status (optional, but can be useful)
  return success;
};

export const sendRemoveFilter = async (opIndex, filterValue) => {
  resumeAudioContext(); // Ensure context is running

  const message = {
    type: 'remove_operator_filter',
    operator_index: opIndex,
    filterValue: filterValue,
  };
  const messageId = `remove-filter-op-${opIndex}`; // Unique ID
  const success = await tryEnsureSynthAndSendMessage(messageId, message);
  if (success) {
    debounceHandleUIChange(); // Call callback on success
  } else {
    console.warn(`Operator Controls: Failed to send remove_operator_filter for operator ${opIndex}`);
  }
  // Return success status (optional, but can be useful)
  return success;
};
function createParameterControl(operatorIndex, filterValue, paramInfo, currentParamValue) {
  const paramWrapper = document.createElement('div');
  paramWrapper.classList.add('filter-param-control', `param-${paramInfo.id}`);
  // Removed dataset attributes from wrapper as they are on the input now
  const label = document.createElement('label');
  // Unique ID distinguishes params in adder vs active filters
  const inputId = `op-${operatorIndex}-filter-${filterValue}-${paramInfo.id}-${currentParamValue === undefined ? 'adder' : 'active'}`;
  label.htmlFor = inputId;
  label.textContent = `${paramInfo.name}: `;

  const input = document.createElement('input');
  input.type = 'number';
  input.id = inputId;
  input.name = paramInfo.id; // Use paramInfo.id for the name attribute
  input.value = (currentParamValue ?? paramInfo.default).toString();
  input.min = paramInfo.min.toString();
  input.max = paramInfo.max.toString();
  input.step = paramInfo.step.toString();
  input.dataset.operatorIndex = operatorIndex; // Keep these for context if needed elsewhere
  input.dataset.filterValue = filterValue;
  input.dataset.paramId = paramInfo.id; // Store paramId here too

  const unitSpan = document.createElement('span');
  unitSpan.className = 'param-unit';
  unitSpan.textContent = ` ${paramInfo.unit || ''}`;

  paramWrapper.appendChild(label);
  paramWrapper.appendChild(input);
  paramWrapper.appendChild(unitSpan);
  return paramWrapper;
}
/**
 * Finds all number inputs within a given container and returns their values
 * as an object { paramId: value }, performing validation/clamping.
 * @param {HTMLElement} container - The parent element containing the inputs.
 * @returns {object} An object mapping parameter IDs to their numeric values.
 */
function getParamsFromContainer(container) {
  const params = {};
  const paramInputs = container.querySelectorAll('input[type="number"]');
  paramInputs.forEach(input => {
    const paramId = input.name; // Use the input's name attribute
    if (!paramId) {
      console.warn("Input missing name attribute, cannot get param ID:", input);
      return; // Skip this input if it doesn't have a name
    }
    let value = parseFloat(input.value);
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);

    // Use default value from config if NaN (requires access or storing default on input)
    // For simplicity here, we'll clamp NaN to min, but ideally find default.
    if (isNaN(value)) {
      console.warn(`NaN value for ${paramId}, clamping to min ${min}`);
      value = min; // Fallback to min if NaN and default isn't easily available
    }

    // Clamp value
    value = Math.max(min, Math.min(max, value));
    input.value = value.toString(); // Update UI to reflect clamped value

    params[paramId] = value;
  });
  return params;
}
/**
 * Creates the complete filter management UI (active filters display + adder)
 * for a single operator. Handles internal UI updates for add/remove.
 * Starts with an EMPTY active filters display.
 * Returns a single container element. Caller attaches action listeners
 * AND is responsible for initial population based on state.
 *
 * @param {number} operatorIndex - The 0-based index of this operator.
 * @returns {HTMLElement} A div element containing the entire filter UI.
 */
export function createOperatorFilterManager(operatorIndex) {
  console.log(`Creating EMPTY filter manager UI for Operator ${operatorIndex + 1}`);

  // 1. Create the main wrapper (Unchanged)
  const managerContainer = document.createElement('div');
  managerContainer.classList.add('operator-filter-manager', `operator-filter-manager-${operatorIndex}`);

  // 2. Active Filters Section Title (Unchanged)
  const activeFiltersTitle = document.createElement('label');
  activeFiltersTitle.textContent = 'Active Filters:';
  managerContainer.appendChild(activeFiltersTitle);

  // 3. Div to HOLD the list of active filter UI blocks (Unchanged)
  const filtersDisplayArea = document.createElement('div');
  filtersDisplayArea.classList.add('active-filters-display');
  filtersDisplayArea.id = `op-${operatorIndex}-active-filters`;
  filtersDisplayArea.textContent = 'No filters active.'; // Initial state
  managerContainer.appendChild(filtersDisplayArea);

  // ----------------------------------------------------
  // 4. Adder Section (UI structure unchanged)
  // ----------------------------------------------------
  const adderTitle = document.createElement('label');
  adderTitle.textContent = 'Add Filter:';
  managerContainer.appendChild(adderTitle);

  const adderSelect = document.createElement('select');
  adderSelect.className = 'filter-type-select-adder';
  adderSelect.id = `op-${operatorIndex}-filter-type-select-adder`;
  adderSelect.dataset.operatorIndex = operatorIndex;
  const defaultOption = document.createElement('option');
  defaultOption.value = ''; defaultOption.textContent = '-- Select Filter --'; defaultOption.disabled = true; defaultOption.selected = true;
  adderSelect.appendChild(defaultOption);
  FILTERS.forEach(fi => { const o = document.createElement('option'); o.value = fi.value.toString(); o.textContent = fi.name; adderSelect.appendChild(o); });
  managerContainer.appendChild(adderSelect);

  const adderParamsDiv = document.createElement('div');
  adderParamsDiv.className = 'filter-adder-params-area';
  adderParamsDiv.id = `op-${operatorIndex}-filter-adder-params-area`;
  managerContainer.appendChild(adderParamsDiv);

  const addButton = document.createElement('button');
  addButton.className = 'add-filter-button';
  addButton.id = `op-${operatorIndex}-add-filter-button`;
  addButton.textContent = 'Add Filter to Chain';
  addButton.dataset.operatorIndex = operatorIndex;
  managerContainer.appendChild(addButton);

  // --- Helper function to update available options in adder select ---
  const updateAdderOptionsDisabledState = () => {
    const currentDisplayedValues = new Set();
    filtersDisplayArea.querySelectorAll('.active-filter-control').forEach(el => {
      currentDisplayedValues.add(el.dataset.filterValue);
    });
    for (const option of adderSelect.options) {
      if (option.value !== '') {
        option.disabled = currentDisplayedValues.has(option.value);
      }
    }
  };

  // --- Internal Helper Functions (Scoped) ---
  const updateAdderParamsUI = (selectedValue) => {
    adderParamsDiv.innerHTML = ''; // Clear previous
    const filterConfig = FILTERS.find(f => f.value.toString() === selectedValue);

    if (filterConfig?.params?.length > 0) {
      filterConfig.params.forEach(paramInfo => {
        // Create using default value, specify it's for the 'adder'
        const paramControl = createParameterControl(operatorIndex, filterConfig.value, paramInfo, undefined /* use default */);
        adderParamsDiv.appendChild(paramControl);
      });
    } else if (filterConfig) {
      adderParamsDiv.innerHTML = `<i>${filterConfig.name} has no adjustable parameters.</i>`;
    }
  };

  // --- Internal Event Listeners ---
  adderSelect.addEventListener('change', (event) => {
    updateAdderParamsUI(event.target.value);
  });

  addButton.addEventListener('click', async () => { // *** MODIFIED: Added async ***
    const selectedValue = adderSelect.value;
    if (!selectedValue) {
      alert("Please select a filter type to add.");
      return;
    }
    const filterValue = selectedValue;
    const filterConfig = FILTERS.find(f => f.value === filterValue);
    if (!filterConfig) {
      console.error("Selected filter config not found for value:", filterValue);
      return;
    }

    // Check for duplicates (based on visual display)
    const currentDisplayedValues = new Set();
    filtersDisplayArea.querySelectorAll('.active-filter-control').forEach(el => {
      currentDisplayedValues.add(el.dataset.filterValue);
    });
    if (currentDisplayedValues.has(selectedValue)) {
      alert(`${filterConfig.name} is already in the filter chain.`);
      return;
    }

    // --- Get Params from Adder UI ---
    const params = getParamsFromContainer(adderParamsDiv); // Use helper

    // --- Call sendSetFilter ---
    console.log(`Attempting to add Op ${operatorIndex + 1} Filter: ${filterConfig.name} with params:`, params);
    const success = await sendSetFilter(operatorIndex, filterValue, params);

    if (success) {
      // VISUALLY Add element *only on success*
      if (filtersDisplayArea.textContent === 'No filters active.') {
        filtersDisplayArea.textContent = '';
      }
      const newFilterData = { typeValue: filterValue, params: params }; // Use the params we just sent
      // Pass adderSelect to the internal creator so it can update options on remove
      const newActiveElement = createActiveFilterDisplayInternal(operatorIndex, newFilterData, filtersDisplayArea, adderSelect, updateAdderOptionsDisabledState);
      if (newActiveElement) {
        filtersDisplayArea.appendChild(newActiveElement);
      }

      // Reset adder & update options
      adderSelect.value = '';
      updateAdderParamsUI(''); // Clear adder params
      updateAdderOptionsDisabledState(); // Update based on new state
      console.log(`UI Add SUCCESS Op ${operatorIndex + 1}: ${filterConfig?.name}. Message sent.`);
    } else {
      console.error(`Failed to add filter ${filterConfig.name} via backend for operator ${operatorIndex}. UI not updated.`);
      // Optionally provide user feedback about the failure
      alert(`Failed to add filter ${filterConfig.name}. Please check the console for errors.`);
    }
  });

  // --- Initial setup ---
  updateAdderOptionsDisabledState(); // Set initial adder options

  // --- Expose an update function for the CALLER (Unchanged) ---
  managerContainer.updateDisplay = (filtersData) => {
    console.log(`Filter Manager ${operatorIndex}: Externally updating display with`, filtersData);
    filtersDisplayArea.innerHTML = ''; // Clear current display
    if (!filtersData || filtersData.length === 0) {
      filtersDisplayArea.textContent = 'No filters active.';
    } else {
      filtersData.forEach(filterData => {
        // Pass adderSelect and the update function to the internal creator
        const activeElement = createActiveFilterDisplayInternal(
          operatorIndex, filterData, filtersDisplayArea, adderSelect, updateAdderOptionsDisabledState
        );
        if (activeElement) {
          filtersDisplayArea.appendChild(activeElement);
        }
      });
    }
    updateAdderOptionsDisabledState(); // Update adder based on new active list
  };

  // Return the single container holding everything
  return managerContainer;
}


function createActiveFilterDisplayInternal(operatorIndex, activeFilterData, displayArea, adderSelect, updateAdderOptionsCallback) {
  const filterConfig = FILTERS.find(f => f.value === activeFilterData.typeValue);
  if (!filterConfig) return null;

  // --- Container setup (Unchanged) ---
  const container = document.createElement('div');
  container.classList.add('active-filter-control', `filter-type-${filterConfig.value}`);
  container.dataset.filterValue = activeFilterData.typeValue;
  container.dataset.operatorIndex = operatorIndex; // Add operator index for easier access in listeners

  // --- Header setup (Unchanged) ---
  const header = document.createElement('div');
  const title = document.createElement('strong'); title.textContent = filterConfig.name;
  header.appendChild(title);

  // --- Remove Button Setup (Unchanged logic, calls callback) ---
  const removeButton = document.createElement('button');
  removeButton.textContent = '✕';
  removeButton.title = `Remove ${filterConfig.name}`;
  removeButton.classList.add('remove-filter-button');
  removeButton.dataset.operatorIndex = operatorIndex;
  removeButton.dataset.filterValue = activeFilterData.typeValue;

  removeButton.addEventListener('click', () => {
    // NOTE: This *only* removes visually and updates the adder.
    // The actual removal command (e.g., 'remove_operator_filter')
    // needs to be sent by an external listener attached to this button,
    // likely in the code that USES `createOperatorFilterManager`.
    console.log(`UI Remove: Op ${operatorIndex + 1}, Filter ${filterConfig.name}`);
    container.remove(); // Remove self from DOM

    // Update adder options via the callback
    updateAdderOptionsCallback();

    if (displayArea.children.length === 0) {
      displayArea.textContent = 'No filters active.';
    }
    sendRemoveFilter(operatorIndex, filterConfig.value)
  });
  header.appendChild(removeButton);
  container.appendChild(header);

  // --- Parameter controls ---
  const paramsContainer = document.createElement('div');
  paramsContainer.classList.add('active-filter-params');
  if (filterConfig.params?.length > 0) {
    filterConfig.params.forEach(paramInfo => {
      const currentVal = activeFilterData.params ? activeFilterData.params[paramInfo.id] : paramInfo.default; // Use default if not present
      const paramControl = createParameterControl(operatorIndex, activeFilterData.typeValue, paramInfo, currentVal);
      paramsContainer.appendChild(paramControl);

      // *** ATTACH LISTENER FOR PARAM CHANGES ***
      const inputElement = paramControl.querySelector('input[type="number"]');
      if (inputElement) {
        inputElement.addEventListener('change', async (event) => { // *** Added async ***
          // Get operator index and filter value from the container's dataset
          const opIdx = parseInt(container.dataset.operatorIndex);
          const filtVal = container.dataset.filterValue;

          if (isNaN(opIdx) || !filtVal) {
            console.error("Missing operator index or filter value on container dataset", container);
            return;
          }

          // Get *all* current parameter values from *this* filter's container
          const currentParams = getParamsFromContainer(paramsContainer); // Use helper

          console.log(`UI Param Change: Op ${opIdx + 1}, Filter ${filterConfig.name}, Param ${event.target.name}=${event.target.value}. Sending update...`);

          // --- Call sendSetFilter ---
          await sendSetFilter(opIdx, filtVal, currentParams);
        });
      } else {
        console.warn("Could not find input element within param control for", paramInfo.name);
      }
    });
  } else {
    const nt = document.createElement('span'); nt.textContent = "No params.";
    paramsContainer.appendChild(nt);
  }
  container.appendChild(paramsContainer);

  return container;
}

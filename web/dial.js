// --- Global State and Control ---
import { sendRatioUpdate } from './operator-controls.js';

let isFineModeActive = false;
const coarseTooltip = "Drag to adjust (Hold Shift for fine detail)";
const fineTooltip = "Drag for fine detail (Release Shift for coarse steps)";
const FINE_MODE_SENSITIVITY = 0.3;

const fineModeToggleButton = document.getElementById('fine-mode-toggle');

// Central function to update all visuals related to fine mode
function updateFineModeVisuals(isActive) {
  // 1. Update Toggle Button Appearance
  if (fineModeToggleButton) {
    fineModeToggleButton.textContent = `Fine Mode: ${isActive ? 'ON' : 'OFF'}`;
    fineModeToggleButton.classList.toggle('active', isActive);
  }

  // 2. Update Dial Tooltips
  const dials = document.querySelectorAll('.dial');
  dials.forEach(dial => {
    dial.title = isActive ? fineTooltip : coarseTooltip;
  });

  // 3. Update Cursor (only if not currently dragging)
  if (!document.body.classList.contains('dial-dragging-active')) {
    document.body.style.cursor = isActive ? 'cell' : '';
  }
  // (Cursor during drag is handled in mousedown/mousemove/keyup)
}

// --- Event Listeners for Global Controls ---

// Toggle Button Listener
if (fineModeToggleButton) {
  fineModeToggleButton.addEventListener('click', () => {
    isFineModeActive = !isFineModeActive; // Toggle the state
    updateFineModeVisuals(isFineModeActive);

    // Also update cursor for any potentially active drag operation
    const cursorStyle = isFineModeActive ? 'cell' : (document.body.classList.contains('dial-dragging-active') ? 'grabbing' : '');
    document.body.style.cursor = cursorStyle;
    if (document.body.classList.contains('dial-dragging-active')) {
      document.querySelectorAll('.dial.dragging').forEach(d => d.style.cursor = isFineModeActive ? 'cell' : 'grabbing');
    }
  });
} else {
  console.warn("Fine mode toggle button not found (#fine-mode-toggle)");
}


// Keyboard Listeners (Shift Key)
document.addEventListener("keydown", (e) => {
  if (e.key === "Shift" && !e.repeat && !isFineModeActive) {
    isFineModeActive = true;
    updateFineModeVisuals(true); // Update visuals

    // Update cursor if dragging has already started
    if (document.body.classList.contains('dial-dragging-active')) {
      document.body.style.cursor = 'cell';
      document.querySelectorAll('.dial.dragging').forEach(d => d.style.cursor = 'cell');
    }
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "Shift" && isFineModeActive) {
    isFineModeActive = false;
    updateFineModeVisuals(false); // Update visuals

    // Update cursor if dragging
    if (document.body.classList.contains('dial-dragging-active')) {
      document.body.style.cursor = 'grabbing';
      document.querySelectorAll('.dial.dragging').forEach(d => d.style.cursor = 'grabbing');
    }
    // No snapping value on key release
  }
});


export function createDial(index, initialValue = 1) {
  const MIN_ROTATION = -135;
  const MAX_ROTATION = 135;
  const TOTAL_ROTATION_RANGE = MAX_ROTATION - MIN_ROTATION;
  const SUB_STEPS_PER_INTERVAL = 100;
  const coarseValueStrings = ['1/128', '1/64', '1/32', '1/16', '1/8', '1/4', '1/2', ...Array(32).keys().map(i => (i + 1).toString())];
  const coarseValues = coarseValueStrings.map(v => eval(v));
  const numCoarseIntervals = coarseValues.length - 1;

  // --- DOM Elements ---
  const dial = document.createElement("div");
  dial.classList.add("dial");
  dial.id = `op-${index}-ratio-dial`;
  // Set initial tooltip based on the current global state when created
  dial.title = isFineModeActive ? fineTooltip : coarseTooltip;
  const radius = 35;
  dial.style.width = `${radius * 2}px`;
  dial.style.height = dial.style.width;

  const indicator = document.createElement("div");
  indicator.id = `op-${index}-ratio-dial-indicator`;
  indicator.classList.add("dial-indicator");
  // ... indicator styles ...
  const indHeight = radius / 1.3;
  const indWidth = 4;
  const indInset = 0;
  indicator.style.width = `${indWidth}px`;
  indicator.style.height = `${indHeight}px`;
  indicator.style.borderRadius = `${indWidth / 2}px`;
  indicator.style.top = `${indInset}px`;
  indicator.style.left = `${radius - indWidth / 2}px`;
  indicator.style.transformOrigin = `center ${radius - indInset}px`;
  dial.appendChild(indicator);


  const dialInput = document.createElement("input");
  dialInput.id = `op-${index}-ratio-input`;
  dialInput.classList.add("dial-input");
  dialInput.type = "text"; // Using text input

  // --- State ---
  let currentValue = initialValue;
  let visualRotation = 0;
  let isDragging = false;
  let lastAngle = null;

  // --- Helper Functions (valueToRotation, rotationToValue, updateIndicator, updateInput) ---
  function valueToRotation(value) {
    value = Math.max(coarseValues[0], Math.min(coarseValues[numCoarseIntervals], value));
    let lowerIndex = 0;
    for (let i = 0; i < numCoarseIntervals; i++) {
      if (value >= coarseValues[i] && value <= coarseValues[i + 1]) {
        lowerIndex = i;
        break;
      }
      if (i === numCoarseIntervals - 1 && value === coarseValues[i + 1]) {
        lowerIndex = i + 1;
        break;
      }
    }
    const valLower = coarseValues[lowerIndex];
    const valUpper = coarseValues[Math.min(lowerIndex + 1, numCoarseIntervals)];
    let fraction = 0;
    if (valUpper > valLower) {
      fraction = (value - valLower) / (valUpper - valLower);
    } else if (value === valLower) {
      fraction = 0;
    } else {
      fraction = 0;
    }
    const normalizedPosition = lowerIndex + fraction;
    return MIN_ROTATION + (normalizedPosition / numCoarseIntervals) * TOTAL_ROTATION_RANGE;
  }
  function rotationToValue(rotation) {
    rotation = Math.max(MIN_ROTATION, Math.min(MAX_ROTATION, rotation));
    const normalizedPosition = ((rotation - MIN_ROTATION) / TOTAL_ROTATION_RANGE) * numCoarseIntervals;
    const lowerIndex = Math.max(0, Math.min(numCoarseIntervals - 1, Math.floor(normalizedPosition)));
    const upperIndex = Math.min(numCoarseIntervals, lowerIndex + 1);
    const fraction = normalizedPosition - lowerIndex;
    const valLower = coarseValues[lowerIndex];
    const valUpper = coarseValues[upperIndex];
    let targetValue;
    if (!isFineModeActive) { // Coarse Mode Snapping
      const targetCoarseIndex = Math.round(normalizedPosition);
      targetValue = coarseValues[Math.max(0, Math.min(numCoarseIntervals, targetCoarseIndex))];
    } else { // Fine Mode Sub-stepping
      const intervalRange = valUpper - valLower;
      if (intervalRange <= 0) {
        targetValue = valLower;
      } else {
        const subStepIndex = Math.round(fraction * SUB_STEPS_PER_INTERVAL);
        const subStepIncrement = intervalRange / SUB_STEPS_PER_INTERVAL;
        targetValue = valLower + subStepIndex * subStepIncrement;
      }
    }
    return Math.max(coarseValues[0], Math.min(coarseValues[numCoarseIntervals], targetValue));
  }
  function updateIndicator() {
    indicator.style.transform = `rotate(${visualRotation}deg)`;
  }
  function updateInput() {
    const numDecimalPlaces = currentValue < 2 ? 4 : 3;
    const formattedValue = currentValue.toFixed(numDecimalPlaces);
    if (dialInput.value !== formattedValue) {
      dialInput.value = formattedValue;
    }
    dial.dispatchEvent(new CustomEvent('change', { detail: { value: currentValue } }));
  }

  // --- Event Listeners (mousedown, mousemove, mouseup, input change, cleanup) ---
  function dialStartInteraction(clientX, clientY) {
    isDragging = true;
    dial.classList.add('dragging');
    document.body.classList.add('dial-dragging-active');
    document.body.style.userSelect = "none";
    const cursorStyle = isFineModeActive ? 'cell' : 'grabbing';
    document.body.style.cursor = cursorStyle;
    dial.style.cursor = cursorStyle;
    visualRotation = valueToRotation(currentValue);
    updateIndicator();
    const rect = dial.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startAngleRaw = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI) + 90;
    lastAngle = (startAngleRaw + 360) % 360;
  }
  dial.addEventListener("mousedown", (event) => {
    event.preventDefault();
    dialStartInteraction(event.clientX, event.clientY);
  });
  dial.addEventListener("touchstart", (event) => {
    event.preventDefault();
    dialStartInteraction(event.touches[0].clientX, event.touches[0].clientY);
  });
  const handleMouseMove = (event) => {
    if (!isDragging) return;
    const rect = dial.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const currentAngleRaw = Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI) + 90;
    const currentAngle = (currentAngleRaw + 360) % 360;
    let delta = currentAngle - lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    const effectiveDelta = isFineModeActive ? (delta * FINE_MODE_SENSITIVITY) : delta;
    visualRotation += effectiveDelta;
    visualRotation = Math.max(MIN_ROTATION, Math.min(MAX_ROTATION, visualRotation));
    currentValue = rotationToValue(visualRotation);
    lastAngle = currentAngle;
    updateIndicator();
    updateInput();
    sendRatioUpdate(index, currentValue);
  };
  const handleTouchMove = (event) => {
    event.preventDefault();
    let newEvent = { clientX: event.touches[0].clientX, clientY: event.touches[0].clientY };
    handleMouseMove(newEvent);
  }
  const handleMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    dial.classList.remove('dragging');
    document.body.classList.remove('dial-dragging-active');
    lastAngle = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = isFineModeActive ? 'cell' : '';
    dial.style.cursor = "";
    visualRotation = valueToRotation(currentValue);
    updateIndicator();
  };
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
  document.addEventListener('touchmove', handleTouchMove);
  document.addEventListener('touchend', handleMouseUp);
  dialInput.addEventListener('change', (event) => {
    let newValue = parseFloat(event.target.value);
    if (!isNaN(newValue)) {
      newValue = Math.max(coarseValues[0], Math.min(coarseValues[numCoarseIntervals], newValue));
      currentValue = newValue;
      visualRotation = valueToRotation(currentValue);
      updateIndicator();
      updateInput();
      sendRatioUpdate(index, newValue);
    } else {
      updateInput();
    }
  });
  dial.cleanup = () => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleMouseUp);
  };


  // --- Initial Setup ---
  currentValue = Math.max(coarseValues[0], Math.min(coarseValues[numCoarseIntervals], initialValue));
  visualRotation = valueToRotation(currentValue);
  updateIndicator();
  updateInput();

  // --- DOM Assembly ---
  const dialContainer = document.createElement("div");
  dialContainer.classList.add(`op-${index}-ratio-dial-container`);
  dialContainer.append(dial);
  dialContainer.append(dialInput);

  // Ensure initial visuals are correct after potential creation loop
  // updateFineModeVisuals(isFineModeActive); // Call this *after* all dials are created

  return dialContainer;
}


// --- Final Initialization ---
// After creating all your dials, ensure the initial visuals are set:
// Example:
// createDial(0, 1);
// createDial(1, 8);
// updateFineModeVisuals(isFineModeActive); // Call once after all dials exist

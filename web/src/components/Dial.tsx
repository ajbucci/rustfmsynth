import { Component, createSignal, createEffect, onMount, onCleanup, JSX, Accessor, untrack } from 'solid-js';
import { clampValue } from '../utils'; // Assuming a clamp utility exists or create one

import '../style.css'; // Or Dial.css

// --- Constants and Types ---
const MIN_ROTATION = -135;
const MAX_ROTATION = 135;
const TOTAL_ROTATION_RANGE = MAX_ROTATION - MIN_ROTATION;
const SUB_STEPS_PER_INTERVAL = 100; // For fine mode calculation
const FINE_MODE_SENSITIVITY = 0.3; // Multiplier for fine dragging
const RADIUS = 35;

const INDICATOR_HEIGHT = RADIUS / 1.3;
const INDICATOR_WIDTH = 4;
const INDICATOR_INSET = 0;
// Define required and optional props
interface DialProps {
  value: Accessor<number>;             // Reactive getter for the current value
  onChange: (newValue: number) => void; // Callback to report value changes
  isActive?: Accessor<boolean>;       // Reactive getter for active state (e.g., carrier)
  isFineModeActive: Accessor<boolean>;      // Reactive getter for global fine mode state

  // Configuration for value mapping and display
  // Passed directly or derived from a config object prop
  minVal: number;
  maxVal: number;
  step?: number; // Optional, maybe used for snapping or text input step
  defaultValue?: number;
  coarseValues: number[]; // Array of predefined coarse snap points/values

  // Optional props for ARIA, IDs etc.
  id?: string;
  label?: string; // For accessibility
}

const Dial: Component<DialProps> = (props) => {

  // --- Internal State ---
  const [isDragging, setIsDragging] = createSignal(false);
  const [visualRotation, setVisualRotation] = createSignal(0);
  // Store the angle where the drag started relative to the rotation applied
  const [dragStartAngleOffset, setDragStartAngleOffset] = createSignal(0);

  // Derived constants from props
  const numCoarseIntervals = () => props.coarseValues.length - 1;
  const coarseMin = () => props.coarseValues[0];
  const coarseMax = () => props.coarseValues[props.coarseValues.length - 1];

  // Refs for DOM elements if needed for direct manipulation (e.g., focus)
  let dialElement: HTMLDivElement | undefined;
  let inputElement: HTMLInputElement | undefined;


  // --- Value / Rotation Conversion Logic (Adapted from original) ---
  // Memoize conversions if they become complex or called frequently in effects
  const valueToRotation = (value: number): number => {
    const clampedValue = clampValue(value, coarseMin(), coarseMax()); // Clamp to overall range
    let lowerIndex = 0;
    const intervals = numCoarseIntervals();
    const coarseVals = props.coarseValues;

    // Find the coarse interval the value falls into
    for (let i = 0; i < intervals; i++) {
      if (clampedValue >= coarseVals[i] && clampedValue <= coarseVals[i + 1]) {
        lowerIndex = i;
        break;
      }
      // Handle edge case where value is exactly the max
      if (i === intervals - 1 && clampedValue === coarseVals[i + 1]) {
        lowerIndex = i + 1; // Assign to the last index if it's the max value
        break;
      }
    }
    // Handle case where value might be exactly the min (loop doesn't catch index 0 if starting there)
    if (clampedValue === coarseVals[0]) {
      lowerIndex = 0;
    }


    const valLower = coarseVals[lowerIndex];
    const valUpper = coarseVals[Math.min(lowerIndex + 1, intervals)];

    let fraction = 0;
    if (valUpper > valLower) {
      fraction = (clampedValue - valLower) / (valUpper - valLower);
    } else if (clampedValue === valLower) { // Handle interval where lower === upper
      fraction = 0;
    } else {
      // Should not happen with clamping, but default to 0
      fraction = 0;
    }

    const normalizedPosition = lowerIndex + fraction; // Position within the total coarse intervals
    return MIN_ROTATION + (normalizedPosition / intervals) * TOTAL_ROTATION_RANGE;
  };

  const rotationToValue = (rotation: number): number => {
    const clampedRotation = clampValue(rotation, MIN_ROTATION, MAX_ROTATION);
    const intervals = numCoarseIntervals();
    const coarseVals = props.coarseValues;
    const fineMode = props.isFineModeActive(); // Read reactive prop

    const normalizedPosition = ((clampedRotation - MIN_ROTATION) / TOTAL_ROTATION_RANGE) * intervals;

    const lowerIndex = clampValue(Math.floor(normalizedPosition), 0, intervals - 1);
    const upperIndex = Math.min(intervals, lowerIndex + 1); // Ensure upperIndex doesn't exceed bounds

    const fraction = normalizedPosition - lowerIndex;

    const valLower = coarseVals[lowerIndex];
    const valUpper = coarseVals[upperIndex];

    let targetValue: number;

    if (!fineMode) { // Coarse Mode Snapping
      const targetCoarseIndex = clampValue(Math.round(normalizedPosition), 0, intervals);
      targetValue = coarseVals[targetCoarseIndex];
    } else { // Fine Mode Sub-stepping
      const intervalRange = valUpper - valLower;
      if (intervalRange <= 0) {
        targetValue = valLower; // If interval has no range, stick to lower value
      } else {
        // Calculate sub-step based on fraction within the interval
        const subStepIndex = Math.round(fraction * SUB_STEPS_PER_INTERVAL);
        const subStepIncrement = intervalRange / SUB_STEPS_PER_INTERVAL;
        targetValue = valLower + subStepIndex * subStepIncrement;
      }
    }
    // Final clamp to ensure value stays within the absolute min/max defined by coarseValues
    return clampValue(targetValue, coarseMin(), coarseMax());
  };


  // --- Effects ---

  // Effect to update visual rotation when the EXTERNAL value prop changes
  createEffect(() => {
    const externalValue = props.value(); // Track the external value prop
    // Use untrack to prevent this effect from triggering itself via setVisualRotation
    untrack(() => {
      const newRotation = valueToRotation(externalValue);
      // Only update if significantly different to avoid jitter? Or always sync?
      // Let's always sync for now.
      setVisualRotation(newRotation);
      // console.log(`Effect: External value ${externalValue} -> Rotation ${newRotation}`);
    });
  });

  // Effect to update body cursor and user-select during drag
  createEffect(() => {
    if (isDragging()) {
      document.body.classList.add('dial-dragging-active');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = props.isFineModeActive() ? 'cell' : 'grabbing';
    } else {
      document.body.classList.remove('dial-dragging-active');
      document.body.style.userSelect = '';
      // Reset cursor only if *this* drag ended, respect global fine mode state
      document.body.style.cursor = props.isFineModeActive() ? 'cell' : '';
    }
  });

  // --- Event Handlers ---

  const getAngleFromEvent = (clientX: number, clientY: number): number => {
    if (!dialElement) return 0;
    const rect = dialElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    // Calculate angle relative to vertical (top = 0 deg), clockwise positive
    const angleRad = Math.atan2(clientX - centerX, centerY - clientY); // Note Y is inverted
    return angleRad * (180 / Math.PI); // Convert to degrees
  };


  const handleInteractionStart = (clientX: number, clientY: number) => {
    if (!dialElement) return;
    setIsDragging(true);
    const currentRotation = visualRotation(); // Use current visual rotation
    const startAngle = getAngleFromEvent(clientX, clientY);
    setDragStartAngleOffset(currentRotation - startAngle); // Store difference

    // Add temporary listeners to document/window for move/end
    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('mouseup', handleInteractionEnd);
    window.addEventListener('touchmove', handleInteractionMove, { passive: false });
    window.addEventListener('touchend', handleInteractionEnd);
    window.addEventListener('touchcancel', handleInteractionEnd);
  };

  const handleInteractionMove = (event: MouseEvent | TouchEvent) => {
    if (!isDragging()) return;

    event.preventDefault(); // Prevent scrolling on touch devices

    const isTouchEvent = !!(event as TouchEvent).touches;
    const clientX = isTouchEvent ? (event as TouchEvent).touches[0].clientX : (event as MouseEvent).clientX;
    const clientY = isTouchEvent ? (event as TouchEvent).touches[0].clientY : (event as MouseEvent).clientY;

    const currentAngle = getAngleFromEvent(clientX, clientY);
    let newRotation = currentAngle + dragStartAngleOffset(); // Apply offset

    // Handle angle wrapping
    // (This simple offset logic might need refinement for perfect wrap-around behavior,
    // depending on how getAngleFromEvent behaves near 180/-180)

    // Apply fine mode sensitivity DURING drag calculation if needed
    // (Alternative: Apply sensitivity to delta as in original - let's try that)
    // ---> Reverting to delta calculation like original:

    const lastRot = visualRotation(); // Get rotation BEFORE this move
    let targetRotation = currentAngle + dragStartAngleOffset(); // Target based on angle

    // Calculate delta from *last* rotation, handling wrap-around
    let delta = targetRotation - lastRot;
    while (delta <= -180) delta += 360;
    while (delta > 180) delta -= 360;


    const effectiveDelta = props.isFineModeActive() ? (delta * FINE_MODE_SENSITIVITY) : delta;
    let finalRotation = lastRot + effectiveDelta; // Apply potentially scaled delta


    // Clamp rotation to min/max limits
    finalRotation = clampValue(finalRotation, MIN_ROTATION, MAX_ROTATION);

    // Update visual rotation immediately
    setVisualRotation(finalRotation);

    // Calculate new value based on rotation
    const newValue = rotationToValue(finalRotation);

    // Call onChange prop if value *actually* changed
    // Use untrack to avoid onChange causing loops if parent passes value back immediately
    if (newValue !== untrack(props.value)) {
      props.onChange(newValue);
    }
  };

  const handleInteractionEnd = () => {
    if (!isDragging()) return;
    setIsDragging(false);

    // Remove temporary listeners
    window.removeEventListener('mousemove', handleInteractionMove);
    window.removeEventListener('mouseup', handleInteractionEnd);
    window.removeEventListener('touchmove', handleInteractionMove);
    window.removeEventListener('touchend', handleInteractionEnd);
    window.removeEventListener('touchcancel', handleInteractionEnd);

    // Snap visual rotation to the final value after drag ends
    // This ensures it aligns correctly if coarse snapping was applied in rotationToValue
    setVisualRotation(valueToRotation(props.value()));
  };


  // --- Text Input Handler ---
  const handleInputChange = (event: Event) => {
    const target = event.currentTarget as HTMLInputElement;
    let newValue = parseFloat(target.value);

    if (!isNaN(newValue)) {
      // Clamp input value to allowed range
      newValue = clampValue(newValue, coarseMin(), coarseMax());
      if (newValue !== props.value()) { // Check if value actually changed
        props.onChange(newValue);
        // Visual rotation will update via the effect watching props.value()
      } else {
        // If clamped value is same as current, maybe reset input display
        // Use untrack to avoid infinite loop if parent updates prop immediately
        target.value = formatValueForInput(untrack(props.value));
      }
    } else {
      // Reset input display to current value if input is invalid
      target.value = formatValueForInput(props.value());
    }
  };

  // Helper to format value for text input
  const formatValueForInput = (value: number): string => {
    // Add more sophisticated formatting if needed (e.g., based on magnitude)
    const numDecimalPlaces = props.isFineModeActive() ? 4 : 3; // More precision in fine mode?
    // Adjust decimal places based on value magnitude if needed
    // if (value < 0.1) numDecimalPlaces = 5; else if (value < 1) ...
    return value.toFixed(numDecimalPlaces);
  }

  // --- Tooltip Text ---
  const tooltipText = () => props.isFineModeActive()
    ? "Drag for fine detail (Release Shift for coarse steps)"
    : "Drag to adjust (Hold Shift for fine detail)";


  // --- Render ---
  return (
    <div class="parameter-container" // Use isActive prop
      ref={dialElement} // Assign ref for calculations
      role="slider"
      aria-valuemin={props.minVal} // Use minVal/maxVal for ARIA
      aria-valuemax={props.maxVal}
      aria-valuenow={props.value()}
      aria-label={props.label || 'Dial Control'}
      title={tooltipText()} // Dynamic tooltip
      onMouseDown={(e) => handleInteractionStart(e.clientX, e.clientY)}
      on:touchstart={{
        passive: false, // Set listener options directly
        handleEvent: (event: TouchEvent) => { // Define the handleEvent method
          // Call original handler, keyDataWithStyle is available via closure
          event.preventDefault();
          handleInteractionStart(event.touches[0].clientX, event.touches[0].clientY);
        }
      }}
      style={{
        cursor: isDragging() ? (props.isFineModeActive() ? 'cell' : 'grabbing') : 'grab'
      }}
    >
      <label class="parameter-title" for={props.id ? `${props.id}-input` : undefined}>
        {props.label || 'Dial'}: {/* Use prop label */}
      </label>
      <div class={`dial ${props.isActive?.() ? 'active' : ''}`}
        style={{
          width: `${RADIUS * 2}px`,
          height: `${RADIUS * 2}px`,
          transform: `rotate(${visualRotation()}deg)`
        }}
      >
        <div class="dial-indicator" style={{
          width: `${INDICATOR_WIDTH}px`,
          height: `${INDICATOR_HEIGHT}px`,
          "border-radius": `${INDICATOR_WIDTH / 2}px`,
          display: "block",
          overflow: "hidden",
          top: `${INDICATOR_INSET}px`,
          left: `${RADIUS - INDICATOR_WIDTH / 2}px`,
          "transform-origin": `center ${RADIUS - INDICATOR_INSET}px`
        }}></div>
      </div>
      {/* Consider hiding input visually and using it mainly for accessibility/form submission */}
      <input
        ref={inputElement}
        type="text" // Or number with step? Text allows more flexible formatting display
        class="dial-input"
        id={props.id ? `${props.id}-input` : undefined}
        value={formatValueForInput(props.value())} // Display formatted value based on prop
        onBlur={handleInputChange} // Update on blur to avoid excessive updates during typing
        onChange={handleInputChange} // Or update on change? Blur is often safer.
        onKeyDown={(e) => { if (e.key === 'Enter') handleInputChange(e); }} // Update on Enter
      />
    </div >
  );
};

export default Dial;

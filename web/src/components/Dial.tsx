import { Component, createSignal, createEffect, Accessor, untrack } from 'solid-js';
import { clampValue } from '../utils'; // Assuming a clamp utility exists or create one
import '../style.css'; // Or Dial.css

// --- Constants and Types ---
const MIN_ROTATION = -135;
const MAX_ROTATION = 135;
const TOTAL_ROTATION_RANGE = MAX_ROTATION - MIN_ROTATION;
const SUB_STEPS_PER_INTERVAL = 100; // For fine mode calculation ('ratio' mode)
const FINE_MODE_SENSITIVITY = 0.3; // Multiplier for fine dragging (affects both modes)
const RADIUS = 35;

const INDICATOR_HEIGHT = RADIUS / 1.3;
const INDICATOR_WIDTH = 4;
const INDICATOR_INSET = 0;

// Define component modes
export type DialMode = 'ratio' | 'fixedFrequency';

// Define required and optional props
interface DialProps {
  value: Accessor<number>;             // Reactive getter for the current value (ratio OR frequency)
  onChange: (newValue: number) => void; // Callback to report value changes (ratio OR frequency)

  isActive?: Accessor<boolean>;       // Reactive getter for active state (e.g., carrier)
  isFineModeActive: Accessor<boolean>; // Reactive getter for global fine mode state (affects drag sensitivity)

  // Configuration for value mapping and display
  minVal: number;                       // Used as the minimum for 'fixedFrequency' mode
  maxVal: number;                       // Used as the maximum for 'fixedFrequency' mode
  step?: number;                        // Optional step for snapping ('fixedFrequency') or input step

  coarseValues?: number[];              // Array of predefined snap points

  // --- General props ---
  defaultValue?: number;                // Initial value if needed (less critical with reactive value)
  id?: string;
  label?: string;                       // For accessibility
  valueDisplayFormatter?: (value: number) => string; // Optional custom formatter
}

const Dial: Component<DialProps> = (props) => {

  // --- Internal State ---
  const [isDragging, setIsDragging] = createSignal(false);
  const [visualRotation, setVisualRotation] = createSignal(0);
  const [dragStartAngleOffset, setDragStartAngleOffset] = createSignal(0);

  // Refs for DOM elements
  let dialElement: HTMLDivElement | undefined;
  let inputElement: HTMLInputElement | undefined;

  // --- Value / Rotation Conversion Logic ---

  const valueToRotation = (value: number): number => {
    const clampedValue = clampValue(value, props.minVal, props.maxVal);

    if (props.coarseValues && props.coarseValues.length > 0) {
      if (!props.coarseValues || props.coarseValues.length - 1 <= 0) return MIN_ROTATION; // Handle invalid state

      const coarseVals = props.coarseValues;
      const intervals = props.coarseValues.length - 1;
      let lowerIndex = 0;

      // Find the coarse interval the value falls into
      for (let i = 0; i < intervals; i++) {
        if (clampedValue >= coarseVals[i] && clampedValue <= coarseVals[i + 1]) {
          lowerIndex = i;
          break;
        }
        if (i === intervals - 1 && clampedValue === coarseVals[i + 1]) {
          lowerIndex = i + 1;
          break;
        }
      }
      if (clampedValue === coarseVals[0]) {
        lowerIndex = 0;
      }

      const valLower = coarseVals[lowerIndex];
      const valUpper = coarseVals[Math.min(lowerIndex + 1, intervals)];

      let fraction = 0;
      if (valUpper > valLower) {
        fraction = (clampedValue - valLower) / (valUpper - valLower);
      } // else fraction remains 0

      const normalizedPosition = lowerIndex + fraction;
      return MIN_ROTATION + (normalizedPosition / intervals) * TOTAL_ROTATION_RANGE;

    } else {
      const range = props.maxVal - props.minVal;
      if (range <= 0) return MIN_ROTATION; // Handle zero range

      const normalizedValue = (clampedValue - props.minVal) / range;
      return MIN_ROTATION + normalizedValue * TOTAL_ROTATION_RANGE;
    }
  };

  const rotationToValue = (rotation: number): number => {
    const fineDragMode = props.isFineModeActive(); // Fine mode affects drag sensitivity, not value mapping here

    const clampedRotation = clampValue(rotation, MIN_ROTATION, MAX_ROTATION);
    const normalizedRotation = (clampedRotation - MIN_ROTATION) / TOTAL_ROTATION_RANGE;

    if (props.coarseValues && props.coarseValues.length > 0) {
      // --- Ratio Mode Logic ---
      if (!props.coarseValues || props.coarseValues.length - 1 <= 0) return props.minVal; // Handle invalid state

      const coarseVals = props.coarseValues;
      const intervals = props.coarseValues.length - 1;
      const normalizedPosition = normalizedRotation * intervals;

      const lowerIndex = clampValue(Math.floor(normalizedPosition), 0, intervals - 1);
      const upperIndex = Math.min(intervals, lowerIndex + 1);

      const fraction = normalizedPosition - lowerIndex;
      const valLower = coarseVals[lowerIndex];
      const valUpper = coarseVals[upperIndex];

      let targetValue: number;

      // Fine mode for ratio means interpolating *between* coarse steps
      // Coarse mode snaps *to* coarse steps
      if (!fineDragMode) { // Coarse Mode Snapping (Ratio specific)
        const targetCoarseIndex = clampValue(Math.round(normalizedPosition), 0, intervals);
        targetValue = coarseVals[targetCoarseIndex];
      } else { // Fine Mode Sub-stepping (Ratio specific)
        const intervalRange = valUpper - valLower;
        if (intervalRange <= 0) {
          targetValue = valLower;
        } else {
          // Interpolate smoothly within the interval based on the fractional position
          // Note: Using sub-steps was one way, direct interpolation is simpler here
          targetValue = valLower + fraction * intervalRange;

          // Optional: Keep sub-step logic if discrete fine steps are desired
          // const subStepIndex = Math.round(fraction * SUB_STEPS_PER_INTERVAL);
          // const subStepIncrement = intervalRange / SUB_STEPS_PER_INTERVAL;
          // targetValue = valLower + subStepIndex * subStepIncrement;
        }
      }
      // Final clamp for ratio mode
      return clampValue(targetValue, props.minVal, props.maxVal);

    } else {
      // --- Fixed Frequency Mode Logic ---
      const range = props.maxVal - props.minVal;
      let rawValue = props.minVal + normalizedRotation * range;

      // Apply step snapping if step is provided for this mode
      if (props.step && props.step > 0) {
        rawValue = Math.round(rawValue / props.step) * props.step;
      }

      // Final clamp for fixed frequency mode
      return clampValue(rawValue, props.minVal, props.maxVal);
    }
  };


  // --- Effects ---

  // Effect to update visual rotation when the EXTERNAL value prop changes
  createEffect(() => {
    const externalValue = props.value();
    // Untrack mode and range calculations inside here, as they are dependencies
    // of valueToRotation, which we don't want triggering this effect directly.
    untrack(() => {
      const newRotation = valueToRotation(externalValue);
      setVisualRotation(newRotation);
    });
  });


  // Effect to update body cursor and user-select during drag
  createEffect(() => {
    const dragging = isDragging();
    const fineMode = props.isFineModeActive(); // Track global fine mode for cursor
    if (dragging) {
      document.body.classList.add('dial-dragging-active');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = fineMode ? 'cell' : 'grabbing';
    } else {
      document.body.classList.remove('dial-dragging-active');
      document.body.style.userSelect = '';
      // Reset cursor only if *this* drag ended, respect global fine mode state elsewhere
      document.body.style.cursor = fineMode ? 'cell' : '';
    }
  });

  // --- Event Handlers ---

  const getAngleFromEvent = (clientX: number, clientY: number): number => {
    if (!dialElement) return 0;
    const rect = dialElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angleRad = Math.atan2(clientX - centerX, centerY - clientY);
    return angleRad * (180 / Math.PI);
  };

  const handleInteractionStart = (clientX: number, clientY: number) => {
    if (!dialElement) return;
    setIsDragging(true);
    // Use untracked visual rotation to prevent signal loops if effect runs mid-drag
    const currentRotation = untrack(visualRotation);
    const startAngle = getAngleFromEvent(clientX, clientY);
    setDragStartAngleOffset(currentRotation - startAngle);

    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('mouseup', handleInteractionEnd);
    window.addEventListener('touchmove', handleInteractionMove, { passive: false });
    window.addEventListener('touchend', handleInteractionEnd);
    window.addEventListener('touchcancel', handleInteractionEnd);
  };

  const handleInteractionMove = (event: MouseEvent | TouchEvent) => {
    if (!isDragging()) return;
    event.preventDefault();

    const isTouchEvent = !!(event as TouchEvent).touches;
    const clientX = isTouchEvent ? (event as TouchEvent).touches[0].clientX : (event as MouseEvent).clientX;
    const clientY = isTouchEvent ? (event as TouchEvent).touches[0].clientY : (event as MouseEvent).clientY;

    const currentAngle = getAngleFromEvent(clientX, clientY);
    const lastRot = untrack(visualRotation); // Read current rotation without tracking
    let targetRotation = currentAngle + dragStartAngleOffset();

    // Calculate delta with wrap-around handling
    let delta = targetRotation - lastRot;
    while (delta <= -180) delta += 360;
    while (delta > 180) delta -= 360;

    // Apply fine mode sensitivity GLOBALLY to the drag delta
    const effectiveDelta = props.isFineModeActive() ? (delta * FINE_MODE_SENSITIVITY) : delta;
    let finalRotation = lastRot + effectiveDelta;

    finalRotation = clampValue(finalRotation, MIN_ROTATION, MAX_ROTATION);

    // Update visual rotation immediately
    setVisualRotation(finalRotation);

    // Calculate new value based on rotation and CURRENT mode
    const newValue = rotationToValue(finalRotation);

    // Call onChange prop if value *actually* changed
    // Use untrack on props.value() to avoid self-triggering loops
    if (newValue !== untrack(props.value)) {
      props.onChange(newValue);
    }
  };

  const handleInteractionEnd = () => {
    if (!isDragging()) return;
    setIsDragging(false);

    window.removeEventListener('mousemove', handleInteractionMove);
    window.removeEventListener('mouseup', handleInteractionEnd);
    window.removeEventListener('touchmove', handleInteractionMove);
    window.removeEventListener('touchend', handleInteractionEnd);
    window.removeEventListener('touchcancel', handleInteractionEnd);

    // Snap visual rotation to the final value's rotation AFTER drag ends
    // Use untracked props.value() in case onChange triggered an update
    setVisualRotation(valueToRotation(untrack(props.value)));
  };


  // --- Text Input Handler ---
  const handleInputChange = (event: Event) => {
    const target = event.currentTarget as HTMLInputElement;
    let newValue = parseFloat(target.value);

    if (!isNaN(newValue)) {
      newValue = clampValue(newValue, props.minVal, props.maxVal);

      if (newValue !== props.value()) {
        props.onChange(newValue);
      } else {
        // If clamped value is same as current, reset input display to formatted current value
        target.value = formatValueForDisplay(untrack(props.value));
      }
    } else {
      // Reset input display to current value if input is invalid
      target.value = formatValueForDisplay(props.value());
    }
  };

  // Helper to format value for text input/display
  // Uses optional prop formatter or default logic
  const formatValueForDisplay = (value: number): string => {
    if (props.valueDisplayFormatter) {
      return props.valueDisplayFormatter(value);
    }

    // Default formatting logic
    const numDecimalPlaces = props.isFineModeActive() ? 4 : 3;
    return value.toFixed(numDecimalPlaces);
  };

  // --- Tooltip Text ---
  // Tooltip can remain generic about fine/coarse DRAG sensitivity
  const tooltipText = () => props.isFineModeActive()
    ? "Drag for fine detail (Release Shift for less sensitivity)"
    : "Drag to adjust (Hold Shift for fine detail)";


  // --- Render ---
  return (
    <div class="dial-container"
      ref={dialElement}
      role="slider"
      // ARIA values reflect the effective range of the *current* mode
      aria-valuemin={props.minVal}
      aria-valuemax={props.maxVal}
      aria-valuenow={props.value()}
      aria-label={props.label || 'Dial Control'}
      aria-valuetext={formatValueForDisplay(props.value())} // Provide human-readable value text
      title={tooltipText()}
      style={{
        cursor: isDragging() ? (props.isFineModeActive() ? 'cell' : 'grabbing') : 'grab'
      }}
    >
      <div class={`dial ${props.isActive?.() ? 'active' : ''}`}
        onMouseDown={(e) => {
          handleInteractionStart(e.clientX, e.clientY);
        }}
        on:touchstart={{
          passive: false,
          handleEvent: (event: TouchEvent) => {
            event.preventDefault();
            handleInteractionStart(event.touches[0].clientX, event.touches[0].clientY);
          }
        }}
        style={{
          width: `${RADIUS * 2}px`,
          height: `${RADIUS * 2}px`,
          transform: `rotate(${visualRotation()}deg)` // Use signal for rotation
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
      <input
        ref={inputElement}
        type="text" // Text allows more flexible formatting (like 'k' for kHz)
        class="dial-input"
        id={props.id ? `${props.id}-input` : undefined}
        // Use a derived signal or function for the displayed value
        value={formatValueForDisplay(props.value())}
        onBlur={handleInputChange}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} // Trigger blur/update on Enter
      // Prevent direct typing from updating the core value immediately, use blur/enter
      // Consider adding specific keydown handlers for arrow keys later if needed
      />
    </div >
  );
};

export default Dial;

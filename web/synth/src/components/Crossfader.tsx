import { Component, createSignal, createEffect, onMount, onCleanup, JSX, Accessor, untrack } from 'solid-js';
import { clampValue } from '../utils'; // Assuming utility exists

import '../style.css'; // Or Crossfader.css

// --- Constants and Types ---
const MIN_VALUE_DEFAULT = 0.00;
const MAX_VALUE_DEFAULT = 10.00;
const STEP_DEFAULT = 0.01;
const FINE_MODE_DAMPING = 5; // How much less sensitive in fine mode

const FALLBACK_TRACK_HEIGHT = 100;
const FALLBACK_TRACK_WIDTH = 60;
const FALLBACK_THUMB_HEIGHT = 30;

interface CrossfaderProps {
  value: Accessor<number>;
  onChange: (newValue: number) => void;
  isFineModeActive: Accessor<boolean>;

  // Configuration (can have defaults)
  minVal?: number;
  maxVal?: number;
  step?: number;
  defaultValue?: number;

  // Optional
  id?: string;
  label?: string; // Accessibility label
}

const Crossfader: Component<CrossfaderProps> = (props) => {

  // --- Resolve Config Props with Defaults ---
  const minVal = () => props.minVal ?? MIN_VALUE_DEFAULT;
  const maxVal = () => props.maxVal ?? MAX_VALUE_DEFAULT;
  const step = () => props.step ?? STEP_DEFAULT;
  const defaultValue = () => props.defaultValue ?? minVal(); // Default to min if not provided
  const valueRange = () => maxVal() - minVal();

  // --- Internal State ---
  const [isDragging, setIsDragging] = createSignal(false);
  // Store visual top position relative to track height (0% at top, 100% at bottom)
  const [visualThumbTopPx, setVisualThumbTopPx] = createSignal(0); // Reactive thumb position
  const [lastClientY, setLastClientY] = createSignal<number | null>(null);

  // --- Fixed Dimensions (Plain Variables, set in onMount) ---
  let trackHeight = FALLBACK_TRACK_HEIGHT;
  let trackWidth = FALLBACK_TRACK_WIDTH;
  let thumbHeight = FALLBACK_THUMB_HEIGHT;
  let effectiveHeight = Math.max(1, trackHeight - thumbHeight); // Initial calculation

  // Refs
  let trackElement: HTMLDivElement | undefined;
  let thumbElement: HTMLDivElement | undefined; // Ref for thumb height if needed
  let inputElement: HTMLInputElement | undefined;

  // --- Get Dimensions on Mount ---
  onMount(() => {
    requestAnimationFrame(() => {
      if (trackElement) {
        trackHeight = trackElement.offsetHeight; // Assign to plain variable
        trackWidth = trackElement.offsetWidth; // Assign to plain variable
        // console.log("Measured Track Container Height:", trackHeight);
      } else { console.warn("Crossfader: Could not find track container element."); }

      if (thumbElement) {
        thumbHeight = thumbElement.offsetHeight; // Assign to plain variable
        // console.log("Measured Thumb Height:", thumbHeight);
      } else { console.warn("Crossfader: Could not find thumb element."); }

      // Recalculate fixed effective height *after* measuring
      effectiveHeight = Math.max(1, trackHeight - thumbHeight);
      // console.log("Calculated Effective Height:", effectiveHeight);

      // Set initial thumb position based on actual dimensions and initial prop value
      setVisualThumbTopPx(valueToThumbTopPx(props.value()));
    });
  });

  // --- Value / Position Conversion (Uses fixed effectiveHeight) ---
  const valueToThumbTopPx = (value: number): number => {
    const range = valueRange();
    if (range <= 0) return 0;
    // Read fixed effectiveHeight directly
    if (effectiveHeight <= 0) return 0;

    const clampedValue = clampValue(value, minVal(), maxVal());
    const normalizedValue = (clampedValue - minVal()) / range;
    const topPosition = (1 - normalizedValue) * effectiveHeight;
    return clampValue(topPosition, 0, effectiveHeight);
  };

  const thumbTopPxToValue = (thumbTopPx: number): number => {
    // Read fixed effectiveHeight directly
    if (effectiveHeight <= 0) return minVal();

    const clampedTop = clampValue(thumbTopPx, 0, effectiveHeight);
    const normalizedPosition = 1 - (clampedTop / effectiveHeight);
    const range = valueRange();
    const rawValue = minVal() + normalizedPosition * range;

    // Apply step snapping
    const currentStep = step();
    let steppedValue = minVal() + Math.round((rawValue - minVal()) / currentStep) * currentStep;
    steppedValue = clampValue(steppedValue, minVal(), maxVal());

    if (Math.abs(steppedValue - maxVal()) < currentStep / 2) steppedValue = maxVal();
    if (Math.abs(steppedValue - minVal()) < currentStep / 2) steppedValue = minVal();

    return steppedValue;
  };
  // --- Effects ---

  // Update visual thumb position when external value changes
  createEffect(() => {
    const externalValue = props.value();
    untrack(() => {
      // Recalculate pixel position based on the new value and FIXED dimensions
      setVisualThumbTopPx(valueToThumbTopPx(externalValue));
    });
  });

  // Effect for global cursor/select styles during drag
  createEffect(() => {
    if (isDragging()) {
      document.body.classList.add('fader-dragging-active'); // Use specific class
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing'; // Fader only has grabbing cursor
    } else {
      document.body.classList.remove('fader-dragging-active');
      document.body.style.userSelect = '';
      document.body.style.cursor = ''; // Reset to default
    }
  });


  // --- Event Handlers ---

  const handleInteractionStart = (clientY: number) => {
    if (!trackElement) return;
    setIsDragging(true);
    const trackRect = trackElement.getBoundingClientRect();
    const clickY = clientY - trackRect.top;

    // Calculate initial position using FIXED dimensions
    let initialThumbTopPx = clampValue(clickY - thumbHeight / 2, 0, effectiveHeight);
    const initialValue = thumbTopPxToValue(initialThumbTopPx);

    setVisualThumbTopPx(valueToThumbTopPx(initialValue)); // Snap visual
    setLastClientY(clientY);

    if (initialValue !== props.value()) { props.onChange(initialValue); }

    // Add window listeners
    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('mouseup', handleInteractionEnd);
    window.addEventListener('touchmove', handleInteractionMove, { passive: false });
    window.addEventListener('touchend', handleInteractionEnd);
    window.addEventListener('touchcancel', handleInteractionEnd);
  };

  const handleInteractionMove = (event: MouseEvent | TouchEvent) => {
    if (!isDragging() || lastClientY() === null) return;
    event.preventDefault();
    const isTouchEvent = !!(event as TouchEvent).touches;
    const clientY = isTouchEvent ? (event as TouchEvent).touches[0].clientY : (event as MouseEvent).clientY;

    const deltaY = clientY - lastClientY()!;
    const effectiveDeltaY = props.isFineModeActive() ? (deltaY / FINE_MODE_DAMPING) : deltaY;
    // Read fixed effectiveHeight

    const newVisualTopPx = clampValue(visualThumbTopPx() + effectiveDeltaY, 0, effectiveHeight);
    setVisualThumbTopPx(newVisualTopPx);

    const newValue = thumbTopPxToValue(newVisualTopPx);
    setLastClientY(clientY);

    if (newValue !== untrack(props.value)) { props.onChange(newValue); }
  };

  const handleInteractionEnd = () => {
    if (!isDragging()) return;
    setIsDragging(false);
    setLastClientY(null);

    // Remove window listeners
    window.removeEventListener('mousemove', handleInteractionMove);
    window.removeEventListener('mouseup', handleInteractionEnd);
    window.removeEventListener('touchmove', handleInteractionMove);
    window.removeEventListener('touchend', handleInteractionEnd);
    window.removeEventListener('touchcancel', handleInteractionEnd);

    // Snap visual thumb exactly to the final prop value's position
    setVisualThumbTopPx(valueToThumbTopPx(props.value()));
  };

  // --- Text Input Handler ---
  const handleInputChange = (event: Event) => {
    const target = event.currentTarget as HTMLInputElement;
    let newValue = parseFloat(target.value);
    const currentStep = step();

    if (!isNaN(newValue)) {
      newValue = clampValue(newValue, minVal(), maxVal());
      // Snap to step
      newValue = minVal() + Math.round((newValue - minVal()) / currentStep) * currentStep;
      // Final clamp after snapping
      newValue = clampValue(newValue, minVal(), maxVal());

      if (newValue !== props.value()) {
        props.onChange(newValue);
      } else {
        target.value = formatValueForInput(untrack(props.value));
      }
    } else {
      target.value = formatValueForInput(props.value());
    }
  };

  const formatValueForInput = (value: number): string => {
    // Determine decimal places based on step size if possible
    const stepStr = String(step());
    const decimalPlaces = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;
    return value.toFixed(Math.max(2, decimalPlaces)); // Show at least 2 decimal places
  }

  // --- Render ---
  return (
    <div class="parameter-container"> {/* Add specific class */}
      <label class="parameter-title" for={props.id ? `${props.id}-input` : undefined}>
        {props.label || 'Fader'}: {/* Use prop label */}
      </label>
      <div
        class="crossfader-track-container"
        ref={trackElement}
        onMouseDown={(e) => { if (e.button === 0) handleInteractionStart(e.clientY); }}
        onTouchStart={(e) => { e.preventDefault(); handleInteractionStart(e.touches[0].clientY); }}
      // Add ARIA attributes to the track maybe? Or keep on container?
      >
        <div class="crossfader-track">
          <div
            ref={thumbElement}
            class="crossfader-thumb"
            classList={{ dragging: isDragging() }}
            style={{
              // Apply top percentage reactively
              top: `${visualThumbTopPx()}%`,
              // Cursor style handled globally by effect
            }}
            // Make thumb itself draggable too (optional)
            onMouseDown={(e) => { if (e.button === 0) handleInteractionStart(e.clientY); }}
            onTouchStart={(e) => { e.preventDefault(); handleInteractionStart(e.touches[0].clientY); }}
          >
            <div class="crossfader-thumb-stripe"
              style={
                {
                  width: `${.88 * trackWidth}px`,
                  height: `${thumbHeight / 6}px`,
                  position: 'absolute',
                  top: `${.5 * thumbHeight - thumbHeight / 12}px`,
                  left: `${.06 * trackWidth}px`
                }
              }></div>
          </div>
        </div>
      </div>
      <input
        ref={inputElement}
        id={props.id ? `${props.id}-input` : undefined}
        type="text" // Keep text for flexible formatting
        class="crossfader-input"
        value={formatValueForInput(props.value())} // Display formatted prop value
        // Update on blur or enter to prevent excessive updates
        onBlur={handleInputChange}
        onKeyDown={(e) => { if (e.key === 'Enter') { handleInputChange(e); (e.currentTarget as HTMLInputElement).blur(); } }}
      // Consider adding step attribute if type="number" was used
      // step={step()}
      />
    </div>
  );
};

export default Crossfader;

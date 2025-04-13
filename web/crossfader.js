// --- Imports ---
// We only need the update function now
import { sendModulationIndexUpdate } from './operator-controls.js'; // Adjust path if needed

// Constants specific to the crossfader's value range
const MIN_VALUE = 0.00;
const MAX_VALUE = 1.00;
const STEP = 0.01;
const VALUE_RANGE = MAX_VALUE - MIN_VALUE;

// --- createVerticalCrossfader Function ---
export function createVerticalCrossfader(index, initialValue = 1.00) {

  // --- DOM Elements ---
  const faderContainer = document.createElement('div');
  faderContainer.classList.add('crossfader-container');
  faderContainer.id = `op-${index}-mod-index-fader-container`;

  // TODO: add css variables to the stylesheet and pull the dimensions from there
  const thumbWidth = 60;
  const thumbHeight = 30;
  const thumbStripeHeight = 5;
  const thumbStripeWidthPercent = 0.88;
  let thumbStripeWidth = thumbWidth * thumbStripeWidthPercent;

  const trackContainer = document.createElement('div');
  trackContainer.classList.add('crossfader-track-container');
  trackContainer.id = `op-${index}-mod-index-track-container`;
  trackContainer.style.width = `${thumbWidth}px`;

  const track = document.createElement('div');
  track.classList.add('crossfader-track');
  track.id = `op-${index}-mod-index-track`;
  track.style.width = `${thumbWidth / 5}px`;

  const thumb = document.createElement('div');
  thumb.classList.add('crossfader-thumb');
  thumb.id = `op-${index}-mod-index-thumb`;
  thumb.style.width = `${thumbWidth}px`
  thumb.style.height = `${thumbHeight}px`;
  const thumbStripe = document.createElement('div');
  thumbStripe.classList.add('crossfader-thumb-stripe');
  thumbStripe.style.width = `${thumbStripeWidth}px`;
  thumbStripe.style.height = `${thumbStripeHeight}px`;
  thumbStripe.style.position = "absolute";
  thumbStripe.style.top = `${(thumbHeight - thumbStripeHeight) / 2}px`;
  thumbStripe.style.left = `${(thumbWidth - thumbStripeWidth) / 2}px`;
  thumb.appendChild(thumbStripe);
  track.appendChild(thumb);
  trackContainer.appendChild(track);

  faderContainer.appendChild(trackContainer);

  const faderInput = document.createElement("input");
  faderInput.id = `op-${index}-mod-index-input`;
  faderInput.classList.add("crossfader-input");
  faderInput.type = "text"; // Using text input

  faderContainer.appendChild(faderInput);

  // --- Dimensions ---
  const trackHeight = 100; // Matches example CSS
  const effectiveHeight = trackHeight - thumbHeight;

  // --- State ---
  let currentValue = initialValue;
  let visualThumbTop = 0; // Smooth visual position (pixels from track top)
  let isDragging = false;
  let lastClientY = null;
  let trackRect = null;

  // --- Helper Functions ---

  // Calculates the precise top position (in pixels) for a given value
  function valueToThumbTop(value) {
    const clampedValue = Math.max(MIN_VALUE, Math.min(MAX_VALUE, value));
    const normalizedValue = (clampedValue - MIN_VALUE) / VALUE_RANGE;
    const topPosition = (1 - normalizedValue) * effectiveHeight;
    return Math.max(0, Math.min(effectiveHeight, topPosition));
  }

  // Calculates the value based on a thumb top position (pixels), applying step snapping
  function thumbTopToValue(thumbTop) {
    const clampedTop = Math.max(0, Math.min(effectiveHeight, thumbTop));
    const normalizedPosition = 1 - (clampedTop / effectiveHeight);
    const rawValue = MIN_VALUE + normalizedPosition * VALUE_RANGE;
    let steppedValue = MIN_VALUE + Math.round((rawValue - MIN_VALUE) / STEP) * STEP;
    if (Math.abs(steppedValue - MAX_VALUE) < STEP / 2) steppedValue = MAX_VALUE;
    if (Math.abs(steppedValue - MIN_VALUE) < STEP / 2) steppedValue = MIN_VALUE;
    return Math.max(MIN_VALUE, Math.min(MAX_VALUE, steppedValue));
  }

  // Updates the visual thumb element
  function updateThumb() {
    if (effectiveHeight > 0) {
      thumb.style.top = `${visualThumbTop}px`;
    } else {
      thumb.style.top = '50%'; // Fallback
      console.warn(`Crossfader ${index}: Invalid effectiveHeight (${effectiveHeight}), using fallback position.`);
    }
  }

  // Updates the text input element
  function updateInput() {
    const formattedValue = currentValue.toFixed(2);
    if (faderInput.value !== formattedValue) {
      faderInput.value = formattedValue;
    }
  }

  // --- Event Listeners ---

  function startInteraction(clientY) {
    isDragging = true;
    trackRect = track.getBoundingClientRect();
    thumb.classList.add('dragging');
    // Use specific class for dragging fader, not dial's class
    document.body.classList.add('fader-dragging-active');
    document.body.style.userSelect = "none";
    // Cursor is just grabbing, no fine mode check
    document.body.style.cursor = 'grabbing';

    const clickY = clientY - trackRect.top;
    const initialThumbTop = Math.max(0, Math.min(effectiveHeight, clickY - thumbHeight / 2));
    currentValue = thumbTopToValue(initialThumbTop);

    visualThumbTop = valueToThumbTop(currentValue);
    lastClientY = clientY;

    updateThumb();
    updateInput();
    sendModulationIndexUpdate(index, currentValue);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  }

  track.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    startInteraction(event.clientY);
  });

  track.addEventListener("touchstart", (event) => {
    event.preventDefault();
    startInteraction(event.touches[0].clientY);
  }, { passive: false });

  const handleMove = (clientY) => {
    if (!isDragging || lastClientY === null) return;

    const deltaY = clientY - lastClientY;

    // Update visual position directly, no sensitivity scaling
    visualThumbTop += deltaY;
    visualThumbTop = Math.max(0, Math.min(effectiveHeight, visualThumbTop));

    currentValue = thumbTopToValue(visualThumbTop);
    lastClientY = clientY;

    updateThumb();
    updateInput();
    sendModulationIndexUpdate(index, currentValue);
  };

  const handleMouseMove = (event) => {
    handleMove(event.clientY);
  };

  const handleTouchMove = (event) => {
    event.preventDefault();
    if (event.touches.length > 0) {
      handleMove(event.touches[0].clientY);
    }
  };

  const handleEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    thumb.classList.remove('dragging');
    document.body.classList.remove('fader-dragging-active');
    lastClientY = null;
    trackRect = null;
    document.body.style.userSelect = "";
    // Reset cursor to default, no fine mode check
    document.body.style.cursor = '';

    visualThumbTop = valueToThumbTop(currentValue);
    updateThumb(); // Snap visual thumb

    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
  };

  const handleMouseUp = () => {
    handleEnd();
  };
  const handleTouchEnd = () => {
    handleEnd();
  };

  faderInput.addEventListener('change', (event) => {
    let newValue = parseFloat(event.target.value);
    if (!isNaN(newValue)) {
      newValue = Math.max(MIN_VALUE, Math.min(MAX_VALUE, newValue));
      newValue = MIN_VALUE + Math.round((newValue - MIN_VALUE) / STEP) * STEP;
      currentValue = newValue;
      visualThumbTop = valueToThumbTop(currentValue);
      updateThumb();
      updateInput();
      sendModulationIndexUpdate(index, currentValue);
    } else {
      updateInput();
    }
  });

  faderContainer.cleanup = () => {
    console.log(`Cleaning up crossfader ${index}`);
  };

  // --- Initial Setup ---
  currentValue = Math.max(MIN_VALUE, Math.min(MAX_VALUE, initialValue));
  currentValue = MIN_VALUE + Math.round((currentValue - MIN_VALUE) / STEP) * STEP;
  visualThumbTop = valueToThumbTop(currentValue);
  updateThumb();
  updateInput();

  return faderContainer;
}

import { Component, createSignal, createEffect, Show, Accessor, untrack } from 'solid-js';
import Dial from './Dial';
import '../style.css';
import NumericParameterInput from './NumericParameterInput';

export type FrequencyMode = 'ratio' | 'fixedFrequency';

// --- Props for FrequencyManager ---
interface FrequencyManagerProps {
  id?: string;

  // Configuration & State for Ratio Mode Dial
  ratioLabel?: string;
  ratioMin?: number;
  ratioMax?: number;
  ratioCoarseValues: number[];
  ratioValue: Accessor<number>;         // Direct accessor to parent's state
  ratioOnChange: (newValue: number) => void; // Direct callback to parent's handler
  formatRatioValue?: (value: number) => string;

  // Configuration & State for Fixed Frequency Mode Dial
  fixedLabel?: string;
  fixedMin: number;
  fixedMax: number;
  fixedStep?: number;
  fixedValue: Accessor<number>;         // Direct accessor to parent's state
  fixedOnChange: (newValue: number) => void; // Direct callback to parent's handler
  formatFixedValue?: (value: number) => string;

  detuneLabel?: string;
  detuneValue: Accessor<number>;
  detuneOnChange: (newValue: number) => void;
  detuneMin: number;
  detuneMax: number;
  detuneDefault: number;
  detuneStep: number;
  // Configuration for Mode Switching Behavior
  defaultFixedFrequencyOnSwitch?: number; // Value parent should set when switching TO fixed mode

  // Common Passthrough Props
  isActive?: Accessor<boolean>;
  isFineModeActive: Accessor<boolean>; // Assuming global fine mode managed higher up
}

const FrequencyManager: Component<FrequencyManagerProps> = (props) => {

  // --- Internal State ---
  // Mode state is internal to this component
  const [mode, setMode] = createSignal<FrequencyMode>(
    // Initialize based on the initial value from the parent prop
    props.fixedValue() !== 0 ? 'fixedFrequency' : 'ratio'
  );

  // --- Synchronization with External State ---
  // Effect to watch the PARENT'S fixedValue. If it changes to/from 0 externally
  // (e.g., parent's ratioOnChange zeroes it out), update the INTERNAL mode signal.
  createEffect(() => {
    const externalFixedVal = props.fixedValue();
    const expectedMode = externalFixedVal !== 0 ? 'fixedFrequency' : 'ratio';
    // Update internal mode only if it differs from what the external value implies
    if (expectedMode !== untrack(mode)) {
      setMode(expectedMode);
    }
  });

  // --- Internal Mode Toggle Logic ---
  // This handles clicks on the mode switch UI element.
  const handleModeToggleInternal = (targetMode: FrequencyMode) => {
    const currentMode = untrack(mode);
    if (targetMode === currentMode) return; // Already in the target mode

    // Update internal mode state FIRST
    setMode(targetMode);

    // --- Trigger Side Effects via Parent Callbacks ---
    if (targetMode === 'fixedFrequency') {
      // Switching TO fixed mode.
      // Check if the parent's current fixedValue is 0.
      if (props.fixedValue() === 0) {
        // If it is 0, instruct parent to set it to the default.
        const defaultValue = props.defaultFixedFrequencyOnSwitch;
        if (defaultValue === undefined) {
          console.warn("FrequencyManager: Switching to Fixed mode, but no defaultFixedFrequencyOnSwitch provided. Parent fixedOnChange must handle setting a default when called with 0 or current value.");
          // Decide whether to call onChange(0) or onChange(defaultValue anyway)
          // Let's assume we MUST call onChange to signal the mode switch intent.
          // Calling with 0 might be ambiguous. Let's call with the undefined default.
          props.fixedOnChange(defaultValue as any); // Will likely pass undefined if not set
        } else {
          props.fixedOnChange(defaultValue);
        }
      }
      // If parent's fixedValue was already non-zero, no need to call parent onChange here,
      // the mode switch itself is handled internally. Parent state is already correct.
    } else { // Switching TO 'ratio' mode
      // Check if the parent's current fixedValue is non-zero.
      if (props.fixedValue() !== 0) {
        // Instruct the parent to set its fixedValue to 0.
        props.fixedOnChange(0);
      }
      // If parent's fixedValue was already 0, no need to call parent onChange.
    }
  };

  // Handler for the UI element click/keypress
  const handleModeToggleInteraction = () => {
    const currentInternalMode = mode();
    const targetInternalMode: FrequencyMode = currentInternalMode === 'ratio' ? 'fixedFrequency' : 'ratio';
    handleModeToggleInternal(targetInternalMode);
  };


  // --- Derived values for Dials ---
  const ratioMinVal = () => props.ratioMin ?? props.ratioCoarseValues?.[0] ?? 0;
  const ratioMaxVal = () => props.ratioMax ?? props.ratioCoarseValues?.[props.ratioCoarseValues.length - 1] ?? 1;

  const uniqueCheckboxId = `freq-mode-toggle-${props.id || Math.random().toString(36).substring(7)}`;

  // --- Render ---
  return (
    <div class="frequency-manager parameter-container" id={props.id}>
      {/* Mode Toggle Switch - reflects INTERNAL mode state */}
      <label class="parameter-title" for={props.id}>Frequency</label>
      <div class="mode-toggle-container">
        {/* Hidden checkbox for semantic linking if desired, but interaction on label */}
        <input
          type="checkbox"
          id={uniqueCheckboxId}
          class="mode-toggle-checkbox"
          checked={mode() === 'fixedFrequency'} // Reflects internal mode
          aria-hidden="true"
          tabindex="-1"
          readOnly
        />
        {/* Interactive Label acting as the switch */}
        <label
          for={uniqueCheckboxId}
          class="mode-toggle-label toggle"
          data-mode={mode()} // CSS styling based on internal mode
          onClick={(e) => {
            handleModeToggleInteraction();
            e.preventDefault();
          }}
          role="switch"
          aria-checked={mode() === 'fixedFrequency'} // Accessibility state based on internal mode
          aria-label="Toggle frequency mode (Ratio/Fixed)"
          tabindex="0" // Make it focusable
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { handleModeToggleInteraction(); e.preventDefault(); } }}
        >
          <span class="mode-label-text" aria-hidden="true">
            <span>{mode() === 'ratio' ? props.ratioLabel : props.fixedLabel}</span>
          </span>
          <div class="mode-switch-visual" aria-hidden="true">
            <div class="mode-switch-indicator"></div>
          </div>
        </label>
      </div>

      {/* Conditional Dial Rendering based on INTERNAL mode state */}
      <div class="dial-wrapper">
        <Show when={mode() === 'ratio'} fallback={
          <Dial
            // Config for Fixed Frequency Dial
            label={props.fixedLabel ?? "Frequency"}
            id={props.id ? `${props.id}-fixed` : undefined}
            value={props.fixedValue} // PARENT'S value accessor
            onChange={props.fixedOnChange} // PARENT'S change handler
            minVal={props.fixedMin}
            maxVal={props.fixedMax}
            step={props.fixedStep}
            isFineModeActive={props.isFineModeActive}
            isActive={props.isActive}
            valueDisplayFormatter={props.formatFixedValue}
          />
        }>
          {/* Config for Ratio Dial */}
          <Dial
            label={props.ratioLabel ?? "Ratio"}
            id={props.id ? `${props.id}-ratio` : undefined}
            value={props.ratioValue} // PARENT'S value accessor
            onChange={props.ratioOnChange} // PARENT'S change handler
            minVal={ratioMinVal()}
            maxVal={ratioMaxVal()}
            coarseValues={props.ratioCoarseValues}
            isFineModeActive={props.isFineModeActive}
            isActive={props.isActive}
            valueDisplayFormatter={props.formatRatioValue}
          />
        </Show>
      </div>
      <NumericParameterInput
        style={{
          "margin-top": "0.5rem",
          gap: "5px"
        }}
        id={`${props.id}-detune`}
        label={props.detuneLabel ? props.detuneLabel : 'Detune:'}
        numericValue={props.detuneValue}
        onCommit={props.detuneOnChange}
        min={props.detuneMin}
        max={props.detuneMax}
        default={props.detuneDefault}
        step={props.detuneStep} />
    </div>
  );
};

export default FrequencyManager;

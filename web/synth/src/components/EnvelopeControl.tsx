import { Component, For, Accessor } from 'solid-js'; // Added Accessor
import { envelopeParamsInfo, EnvelopeParamInfo, EnvelopeState } from '../state'; // Adjust path

interface EnvelopeControlProps {
  operatorIndex: number; // Keep for context/IDs if needed
  // isActive: Accessor<boolean>;
  value: Accessor<EnvelopeState | undefined>; // Accessor for the whole envelope object
  onParamChange: (paramKey: keyof EnvelopeState, value: number) => void; // Single handler prop
}

const EnvelopeControl: Component<EnvelopeControlProps> = (props) => {
  const opIndex = props.operatorIndex;

  // --- Input Handler ---
  const createEnvelopeInputHandler = (paramKey: keyof EnvelopeState) => (event: InputEvent) => {
    const target = event.currentTarget as HTMLInputElement;
    const stringValue = target.value;
    const numericValue = parseFloat(stringValue);

    // Basic validation before calling the parent handler
    if (!isNaN(numericValue) && numericValue >= 0) {
      // Call the handler passed down from OperatorControl
      props.onParamChange(paramKey, numericValue);
    } else if (stringValue === '') {
      console.warn(`Input for ${paramKey} cleared.`);
      // Optionally call parent handler with 0 or min value on clear
      // props.onParamChange(paramKey, 0);
    } else {
      console.error(`Invalid input for ${paramKey}: "${stringValue}"`);
      // Don't call parent handler for invalid input
    }
  };

  // --- Button Click Handler (if used) ---
  const handleSetEnvelopeClick = () => {
    console.log(`Set Envelope button clicked for operator ${opIndex}.`);
    // Example: Log the current value from the prop accessor
    // console.log("Current envelope value via prop:", props.value());
    // Any action here would likely involve calling another handler passed via props
  };

  return (
    <div class="parameter-container section-box">
      <label class="parameter-title">Envelope</label>
      <div class="envelope-params-container">
        <For each={envelopeParamsInfo}>
          {(paramInfo: EnvelopeParamInfo) => {
            const inputId = `op-${opIndex}-adsr-${paramInfo.key}`;
            // Accessor now reads from the props.value() object
            const paramValueAccessor = () => {
              const envelope = props.value(); // Get the whole envelope object
              return envelope?.[paramInfo.key];
            }

            return (
              <div class="adsr-param">
                <label for={inputId}>{paramInfo.label}</label>
                <input
                  type="number"
                  id={inputId}
                  value={paramValueAccessor()} // Use the derived accessor
                  onInput={createEnvelopeInputHandler(paramInfo.key)}
                  min={paramInfo.min}
                  max={paramInfo.max}
                  step={paramInfo.step}
                  //disabled={!props.isActive()}
                  data-operator-index={opIndex}
                  class="number-input"
                />
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
};

export default EnvelopeControl;

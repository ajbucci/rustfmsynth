import { Component, For, Accessor } from 'solid-js';
import { EnvelopeState, envelopeParamsInfo, EnvelopeParamInfo } from '../state';
import NumericParameterInput from './NumericParameterInput';

interface EnvelopeControlProps {
  operatorIndex: number;
  value: Accessor<EnvelopeState | undefined>; // Accessor for the whole envelope object from parent state
  onParamChange: (paramKey: keyof EnvelopeState, value: number) => void; // Handler to commit numeric changes
  // isActive?: Accessor<boolean>; // Keep if needed for disabling
}

const EnvelopeControl: Component<EnvelopeControlProps> = (props) => {
  const opIndex = props.operatorIndex;

  const handleEnvelopeCommit = (paramKey: keyof EnvelopeState, newValue: number) => {
    props.onParamChange(paramKey, newValue);
  };

  return (
    <div class="parameter-container">
      <label class="parameter-title">Envelope</label>
      <For each={envelopeParamsInfo}>
        {(paramInfo: EnvelopeParamInfo) => {
          const inputId = `op-${opIndex}-adsr-${paramInfo.key}`;

          const numericValueAccessor = () => {
            const envelope = props.value(); // Get the parent state object
            return envelope?.[paramInfo.key];
          };

          return (
            // paramInfo defines the unique properties for each input
            <NumericParameterInput
              label={paramInfo.label}
              id={inputId}
              // Pass the accessor for the numeric value
              numericValue={numericValueAccessor}
              // Pass the commit handler, wrapping it to include the paramKey
              onCommit={(newValue) => handleEnvelopeCommit(paramInfo.key, newValue)}
              min={paramInfo.min}
              max={paramInfo.max}
              step={paramInfo.step}
              minDecimalPlaces={paramInfo.minDecimals}
            // disabled={!props.isActive?.()} // Pass disabled state if applicable
            />
          );
        }}
      </For>
    </div>
  );
};

export default EnvelopeControl;

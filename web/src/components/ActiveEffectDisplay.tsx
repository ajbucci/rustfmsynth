import { Component, For, Accessor } from 'solid-js';
import { EffectState, ReverbParams, EFFECTS, EffectParamInfo, EffectParamsUnion } from '../state'; // Import necessary types/config
import NumericParameterInput from './NumericParameterInput'; // Import the input component

interface ActiveEffectDisplayProps {
  operatorIndex: number;
  effectState: EffectState; // The specific filter state object { type, params }
  effectIndex: number;      // Index within the operator's filters array
  onParamCommit: (effectIndex: number, paramId: string, newValue: number) => Promise<void>;
  onRemove: (typeTagToRemove: EffectState['type']) => Promise<void>;
  // isActive?: Accessor<boolean>; // Uncomment if needed
}

const ActiveEffectDisplay: Component<ActiveEffectDisplayProps> = (props) => {
  const effectConfig = () => EFFECTS.find(f => f.type === props.effectState.type);

  const handleRemoveClick = () => {
    props.onRemove(props.effectState.type);
  };

  const handleParamCommit = (paramId: string, newValue: number) => {
    props.onParamCommit(props.effectIndex, paramId, newValue);
  };

  return (
    <div class={`active-effect-control effect-type-${effectConfig()?.value ?? 'unknown'}`}>
      <div class="active-effect-header">
        <strong>{effectConfig()?.name ?? 'Unknown effect'}</strong>
        <button
          onClick={handleRemoveClick}
          title={`Remove ${effectConfig()?.name ?? 'Effect'}`}
          class="remove-effect-button"
        // disabled={!props.isActive?.()} // Uncomment if needed
        >
          ✕
        </button>
      </div>
      <div class="active-effect-params">
        <For each={effectConfig()?.params} fallback={<span>No params.</span>}>
          {(paramInfo: EffectParamInfo) => {
            const activeParamValueAccessor = () => {
              let paramValue: number | undefined;
              // Use switch for type-safe access to params based on the effectState's type
              switch (props.effectState.type) {
                case "Reverb":
                  paramValue = props.effectState.params[paramInfo.key as keyof ReverbParams];
                  break;
              }
              return paramValue ?? paramInfo.default;
            };

            return (
              <NumericParameterInput
                label={paramInfo.label}
                id={`op-${props.operatorIndex}-active-${props.effectState.type}-${paramInfo.key}`}
                numericValue={activeParamValueAccessor}
                onCommit={(newValue) => handleParamCommit(paramInfo.key, newValue)}
                min={paramInfo.min}
                max={paramInfo.max}
                step={paramInfo.step}
                unit={paramInfo.unit ? paramInfo.unit : ''}
              // disabled={!props.isActive?.()} // Uncomment if needed
              />
            );
          }}
        </For>
      </div>
    </div>
  );
};

export default ActiveEffectDisplay;

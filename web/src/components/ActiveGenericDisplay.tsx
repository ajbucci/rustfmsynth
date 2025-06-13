// components/ActiveGenericDisplay.tsx

import { Component, For } from 'solid-js';
import { GenericConfig, GenericParamInfo } from '../state';
import NumericParameterInput from './NumericParameterInput';

interface ActiveGenericDisplayProps<T extends { params: object }> {
  itemState: T;
  itemIndex: number;
  config: GenericConfig;
  uniqueIdPrefix: string;
  onParamCommit: (itemIndex: number, paramId: string, newValue: number) => Promise<void>;
  onRemove: (itemIndex: number) => Promise<void>;
}

const ActiveGenericDisplay = <T extends { params: object }>(props: ActiveGenericDisplayProps<T>) => {
  const handleRemoveClick = () => { props.onRemove(props.itemIndex); };
  const handleParamCommit = (paramId: string, newValue: number) => { props.onParamCommit(props.itemIndex, paramId, newValue); };

  return (
    <div class={`active-item-control item-type-${props.config.type}`}>
      <div class="active-item-header">
        <strong>{props.config.name}</strong>
        <button
          onClick={handleRemoveClick}
          title={`Remove ${props.config.name}`}
          class="remove-item-button"
        >
          ✕
        </button>
      </div>
      <div class="active-item-params">
        <For each={props.config.params} fallback={<span>No adjustable parameters.</span>}>
          {(paramInfo: GenericParamInfo) => {
            const activeParamValueAccessor = () => {
              const paramsAsRecord = props.itemState.params as Record<string, number | undefined>;
              const paramValue = paramsAsRecord[paramInfo.key];
              return paramValue ?? paramInfo.default;
            };

            return (
              <NumericParameterInput
                label={paramInfo.label}
                id={`${props.uniqueIdPrefix}-active-${(props.itemState as any).type}-${paramInfo.key}`}
                numericValue={activeParamValueAccessor}
                onCommit={(newValue) => handleParamCommit(paramInfo.key, newValue)}
                min={paramInfo.min}
                max={paramInfo.max}
                step={paramInfo.step}
                unit={paramInfo.unit}
              />
            );
          }}
        </For>
      </div>
    </div>
  );
};

export default ActiveGenericDisplay;

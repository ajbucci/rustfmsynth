import { Component, For, Accessor } from 'solid-js';
import { FilterState, FILTERS, FilterParamInfo, LowPassFilterParams, CombFilterParams, PitchedCombFilterParams } from '../state'; // Import necessary types/config
import NumericParameterInput from './NumericParameterInput'; // Import the input component

interface ActiveFilterDisplayProps {
  operatorIndex: number;
  filterState: FilterState; // The specific filter state object { type, params }
  filterIndex: number;      // Index within the operator's filters array
  // Handlers passed from the parent FilterManager
  onParamCommit: (filterIndex: number, paramId: string, newValue: number) => Promise<void>;
  onRemove: (typeTagToRemove: FilterState['type']) => Promise<void>;
  // isActive?: Accessor<boolean>; // Uncomment if needed
}

const ActiveFilterDisplay: Component<ActiveFilterDisplayProps> = (props) => {
  const filterConfig = () => FILTERS.find(f => f.type === props.filterState.type);

  const handleRemoveClick = () => {
    props.onRemove(props.filterState.type);
  };

  const handleParamCommit = (paramId: string, newValue: number) => {
    props.onParamCommit(props.filterIndex, paramId, newValue);
  };

  return (
    <div class={`active-filter-control filter-type-${filterConfig()?.value ?? 'unknown'}`}>
      <div class="active-filter-header">
        <strong>{filterConfig()?.name ?? 'Unknown Filter'}</strong>
        <button
          onClick={handleRemoveClick}
          title={`Remove ${filterConfig()?.name ?? 'Filter'}`}
          class="remove-filter-button"
        // disabled={!props.isActive?.()} // Uncomment if needed
        >
          ✕
        </button>
      </div>
      <div class="active-filter-params">
        <For each={filterConfig()?.params} fallback={<span>No params.</span>}>
          {(paramInfo: FilterParamInfo) => {
            const activeParamValueAccessor = () => {
              let paramValue: number | undefined;
              // Use switch for type-safe access to params based on the filterState's type
              switch (props.filterState.type) {
                case "LowPass":
                  paramValue = props.filterState.params[paramInfo.id as keyof LowPassFilterParams];
                  break;
                case "Comb":
                  paramValue = props.filterState.params[paramInfo.id as keyof CombFilterParams];
                  break;
                case "PitchedComb":
                  paramValue = props.filterState.params[paramInfo.id as keyof PitchedCombFilterParams];
                  break;
              }
              return paramValue ?? paramInfo.default;
            };

            return (
              <NumericParameterInput
                label={paramInfo.name}
                id={`op-${props.operatorIndex}-active-${props.filterState.type}-${paramInfo.id}`}
                numericValue={activeParamValueAccessor}
                onCommit={(newValue) => handleParamCommit(paramInfo.id, newValue)}
                min={paramInfo.min}
                max={paramInfo.max}
                step={paramInfo.step}
                unit={paramInfo.unit}
              // disabled={!props.isActive?.()} // Uncomment if needed
              />
            );
          }}
        </For>
      </div>
    </div>
  );
};

export default ActiveFilterDisplay;

import { Component, createSignal, createMemo, For, Show, Accessor } from 'solid-js';
import {
  FilterState,
  LowPassFilterParams,
  CombFilterParams,
  PitchedCombFilterParams,
  FILTERS,
  FilterConfig,
  FilterParamInfo
} from '../state';
import { appStore, setAppStore } from '../App'; // Import the app store and setter
import { objToJsonBytes, stringToBytes } from '../utils';
import * as SynthInputHandler from '../synthInputHandler';
import NumericParameterInput from './NumericParameterInput';
// Import the child component
import ActiveFilterDisplay from './ActiveFilterDisplay';

type FilterParamsUnion = LowPassFilterParams | CombFilterParams | PitchedCombFilterParams;

interface FilterManagerProps {
  operatorIndex: number;
  // isActive?: Accessor<boolean>; // Keep if needed
}

const FilterManager: Component<FilterManagerProps> = (props) => {
  const opIndex = props.operatorIndex;

  const [adderSelectedTypeTag, setAdderSelectedTypeTag] = createSignal<FilterState['type'] | null>(null);
  const [adderParams, setAdderParams] = createSignal<Record<string, number>>({});

  const activeFilters = createMemo<ReadonlyArray<FilterState>>(() => appStore.operators[opIndex]?.filters ?? []);
  const activeTypeTags = createMemo(() => new Set(activeFilters().map(f => f.type)));

  const selectedAdderConfig = createMemo(() => {
    const tag = adderSelectedTypeTag();
    return tag ? FILTERS.find((f): f is FilterConfig => f.type === tag) : null;
  });

  const handleAdderSelectChange = (e: Event) => {
    const select = e.currentTarget as HTMLSelectElement;
    const newTypeTag = (select.value || null) as FilterState['type'] | null;
    setAdderSelectedTypeTag(newTypeTag);
    const config = newTypeTag ? FILTERS.find(f => f.type === newTypeTag) : null;
    const defaultParams: Record<string, number> = {};
    config?.params?.forEach((p: FilterParamInfo) => {
      defaultParams[p.id] = p.default;
    });
    setAdderParams(defaultParams);
  };

  const handleAdderParamCommit = (paramId: string, newValue: number) => {
    setAdderParams(prev => ({ ...prev, [paramId]: newValue }));
  };

  const handleAddFilterClick = async () => {
    const typeTagToAdd = adderSelectedTypeTag();
    const config = selectedAdderConfig();

    if (!typeTagToAdd || !config) { alert("Please select a filter type."); return; }
    if (activeTypeTags().has(typeTagToAdd)) { alert(`${config.name} is already in the filter chain.`); return; }

    const paramsToSend = { ...adderParams() };
    const finalParams: Record<string, number> = {};
    config.params.forEach(pInfo => {
      finalParams[pInfo.id] = paramsToSend[pInfo.id] ?? pInfo.default;
    });

    let newFilterState: FilterState;
    switch (typeTagToAdd) {
      case "LowPass": newFilterState = { type: "LowPass", params: finalParams as unknown as LowPassFilterParams }; break;
      case "Comb": newFilterState = { type: "Comb", params: finalParams as unknown as CombFilterParams }; break;
      case "PitchedComb": newFilterState = { type: "PitchedComb", params: finalParams as unknown as PitchedCombFilterParams }; break;
      default: console.error(`Unknown filter typeTag: ${typeTagToAdd}`); return;
    }

    SynthInputHandler.setOperatorFilter(opIndex, objToJsonBytes(newFilterState));

    setAppStore('operators', opIndex, 'filters', (prev = []) => [...prev, newFilterState]);

    setAdderSelectedTypeTag(null);
    setAdderParams({});
    const selectElement = document.getElementById(`op-${opIndex}-filter-type-select-adder`) as HTMLSelectElement | null;
    if (selectElement) selectElement.value = '';
  };

  // This function is passed down to ActiveFilterDisplay
  const handleActiveParamCommit = async (filterIndex: number, paramId: string, newValue: number) => {
    const currentFilterState = activeFilters()[filterIndex];
    if (!currentFilterState) return;

    const updatedParams = { ...currentFilterState.params, [paramId]: newValue };
    const updatedFilterState = { type: currentFilterState.type, params: updatedParams as FilterParamsUnion } as FilterState;

    SynthInputHandler.setOperatorFilter(opIndex, objToJsonBytes(updatedFilterState));

    let paramsToStore: FilterParamsUnion;
    switch (currentFilterState.type) {
      case "LowPass": paramsToStore = updatedParams as LowPassFilterParams; break;
      case "Comb": paramsToStore = updatedParams as CombFilterParams; break;
      case "PitchedComb": paramsToStore = updatedParams as PitchedCombFilterParams; break;
      default: console.error("Unknown typeTag"); return;
    }
    setAppStore('operators', opIndex, 'filters', filterIndex, 'params', paramsToStore);
  };

  // This function is passed down to ActiveFilterDisplay
  const handleRemoveFilter = async (typeTagToRemove: FilterState['type']) => {
    SynthInputHandler.removeOperatorFilter(opIndex, stringToBytes(typeTagToRemove));
    setAppStore('operators', opIndex, 'filters', (prev = []) => prev.filter(f => f.type !== typeTagToRemove));
  };

  return (
    <>
      <div class="parameter-container">
        <label class="parameter-title">Active Filters</label>
        <div class="active-filters-display">
          <For each={activeFilters()} fallback={'No filters active.'}>
            {(filterState, index) => (
              // Render the child component, passing state and handlers
              <ActiveFilterDisplay
                operatorIndex={opIndex}
                filterState={filterState}
                filterIndex={index()}
                onParamCommit={handleActiveParamCommit} // Pass down the commit handler
                onRemove={handleRemoveFilter}           // Pass down the remove handler
              // isActive={props.isActive}           // Pass down if needed
              />
            )}
          </For>
        </div>
      </div>
      <div class={`parameter-container`}>
        <label class="parameter-title">Add Filter</label>
        <select
          class="filter-type-select-adder"
          id={`op-${opIndex}-filter-type-select-adder`}
          onChange={handleAdderSelectChange}
          // disabled={!props.isActive?.()} // Uncomment if needed
          value={adderSelectedTypeTag() ?? ''}
        >
          <option value="" disabled={adderSelectedTypeTag() !== null}>-- Select Filter --</option>
          <For each={FILTERS}>
            {(filterConfig) => (
              <option
                value={filterConfig.type}
                disabled={activeTypeTags().has(filterConfig.type)}
              >
                {filterConfig.name}
              </option>
            )}
          </For>
        </select>
      </div>
      <div class="parameter-container">
        <Show when={selectedAdderConfig()?.params?.length > 0}
          fallback={<Show when={adderSelectedTypeTag() !== null}> <i>{selectedAdderConfig()?.name ?? ''} has no adjustable parameters.</i> </Show>}>
          <For each={selectedAdderConfig()?.params}>
            {(paramInfo: FilterParamInfo) => {
              const adderParamValueAccessor = () => adderParams()[paramInfo.id] ?? paramInfo.default;
              return (
                <NumericParameterInput
                  label={paramInfo.name}
                  id={`op-${opIndex}-adder-${selectedAdderConfig()?.type}-${paramInfo.id}`}
                  numericValue={adderParamValueAccessor}
                  // Commit handler updates the local adder state
                  onCommit={(newValue) => handleAdderParamCommit(paramInfo.id, newValue)}
                  min={paramInfo.min}
                  max={paramInfo.max}
                  step={paramInfo.step}
                  unit={paramInfo.unit}
                // disabled={!props.isActive?.()} // Uncomment if needed
                />
              );
            }}
          </For>
        </Show>
        <button
          class="add-filter-button button"
          id={`op-${opIndex}-add-filter-button`}
          onClick={handleAddFilterClick}
          disabled={!adderSelectedTypeTag()} // || !props.isActive?.()} // Uncomment if needed
        >
          Add Filter to Chain
        </button>
      </div>
    </>
  );
};

export default FilterManager;

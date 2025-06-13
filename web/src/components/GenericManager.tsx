// components/GenericManager.tsx

import { Component, createSignal, createMemo, For, Show, Accessor } from 'solid-js';
import { GenericConfig, GenericParamInfo } from '../state';
import NumericParameterInput from './NumericParameterInput';
import ActiveGenericDisplay from './ActiveGenericDisplay';

interface GenericManagerProps<T extends { type: string; params: object }> {
  title: string;
  itemNoun: string;
  itemNounPlural: string;
  configArray: ReadonlyArray<GenericConfig>;
  activeItemsAccessor: Accessor<ReadonlyArray<T>>;
  uniqueIdPrefix: string;
  maxItems?: number;
  onAdd: (newItem: T) => Promise<void>;
  onUpdate: (itemIndex: number, paramId: string, newValue: number) => Promise<void>;
  onRemove: (itemIndex: number) => Promise<void>;
}

const GenericManager = <T extends { type: string; params: object }>(props: GenericManagerProps<T>) => {
  const [adderSelectedType, setAdderSelectedType] = createSignal<string | null>(null);
  const [adderParams, setAdderParams] = createSignal<Record<string, number>>({});

  const activeItems = createMemo(() => props.activeItemsAccessor());
  const activeTypeTags = createMemo(() => new Set(activeItems().map(item => item.type)));

  const itemsToRender = createMemo(() => {
    return activeItems().filter(item => item.type !== "Empty");
  });

  const selectedAdderConfig = createMemo(() => {
    const type = adderSelectedType();
    return type ? props.configArray.find(c => c.type === type) : null;
  });

  const canAddItem = createMemo(() => {
    // If maxItems is not defined, we can always add.
    if (props.maxItems === undefined) return true;

    // Otherwise, check if there is at least one slot of type "Empty".
    return activeItems().some(item => item.type === "Empty");
  });

  const handleAdderSelectChange = (e: Event) => {
    const select = e.currentTarget as HTMLSelectElement;
    const newType = (select.value || null) as string | null;
    setAdderSelectedType(newType);
    const config = newType ? props.configArray.find(c => c.type === newType) : null;
    const defaultParams: Record<string, number> = {};
    config?.params?.forEach((p: GenericParamInfo) => {
      defaultParams[p.key] = p.default;
    });
    setAdderParams(defaultParams);
  };

  const handleAdderParamCommit = (paramId: string, newValue: number) => {
    setAdderParams(prev => ({ ...prev, [paramId]: newValue }));
  };

  const handleAddItemClick = async () => {
    const typeToAdd = adderSelectedType();
    const config = selectedAdderConfig();

    if (!typeToAdd || !config) { alert(`Please select a ${props.itemNoun.toLowerCase()} type.`); return; }
    if (activeTypeTags().has(typeToAdd)) { alert(`${config.name} is already active.`); return; }
    if (!canAddItem()) { alert(`Cannot add more than ${props.maxItems} ${props.itemNounPlural.toLowerCase()}.`); return; }

    const paramsToSend = { ...adderParams() };
    const finalParams: Record<string, number> = {};
    config.params.forEach(pInfo => {
      finalParams[pInfo.key] = paramsToSend[pInfo.key] ?? pInfo.default;
    });

    const newItemState = { type: typeToAdd, params: finalParams } as T;
    await props.onAdd(newItemState);

    setAdderSelectedType(null);
    setAdderParams({});
    const selectElement = document.getElementById(`${props.uniqueIdPrefix}-type-select-adder`) as HTMLSelectElement | null;
    if (selectElement) selectElement.value = '';
  };

  return (
    <>
      <div class={`parameter-container`}>
        <label class="parameter-title">{props.title}</label>
        <select
          class="generic-type-select-adder"
          id={`${props.uniqueIdPrefix}-type-select-adder`}
          onChange={handleAdderSelectChange}
          value={adderSelectedType() ?? ''}
          disabled={!canAddItem()}
        >
          <option value="">Select {props.itemNoun}...</option>
          <For each={props.configArray}>
            {(config) => (
              <option value={config.type} disabled={activeTypeTags().has(config.type)}>
                {config.name}
              </option>
            )}
          </For>
        </select>
      </div>
      <div class="parameter-container">
        <Show when={selectedAdderConfig()?.params?.length > 0}
          fallback={<Show when={adderSelectedType() !== null}> <i>{selectedAdderConfig()?.name ?? ''} has no adjustable parameters.</i> </Show>}>
          <For each={selectedAdderConfig()?.params}>
            {(paramInfo: GenericParamInfo) => {
              const adderParamValueAccessor = () => adderParams()[paramInfo.key] ?? paramInfo.default;
              return (
                <NumericParameterInput
                  label={paramInfo.label}
                  id={`${props.uniqueIdPrefix}-adder-${selectedAdderConfig()?.type}-${paramInfo.key}`}
                  numericValue={adderParamValueAccessor}
                  onCommit={(newValue) => handleAdderParamCommit(paramInfo.key, newValue)}
                  min={paramInfo.min}
                  max={paramInfo.max}
                  step={paramInfo.step}
                  unit={paramInfo.unit}
                />
              );
            }}
          </For>
          <button
            class="add-item-button button"
            onClick={handleAddItemClick}
            disabled={!adderSelectedType()}
          >
            Add {props.itemNoun}
          </button>
        </Show>
      </div>
      <Show when={itemsToRender()?.length > 0}>
        <div class="parameter-container">
          <label class="parameter-title">Active {props.itemNounPlural}</label>
          <div class="active-items-display">
            <For each={itemsToRender()}>
              {(itemState, _index) => {
                // Find the REAL index of the current item from the original, unfiltered array.
                const originalIndex = activeItems().findIndex(item => item === itemState);
                if (originalIndex === -1) return null;

                const itemConfig = props.configArray.find(c => c.type === itemState.type);
                if (!itemConfig) return null;
                return (
                  <ActiveGenericDisplay<T>
                    itemState={itemState}
                    itemIndex={originalIndex}
                    config={itemConfig}
                    onParamCommit={props.onUpdate}
                    onRemove={props.onRemove}
                    uniqueIdPrefix={props.uniqueIdPrefix}
                  />
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </>
  );
};

export default GenericManager;

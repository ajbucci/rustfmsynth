// components/EffectsManager.tsx

import { Component, createMemo } from 'solid-js';
import { appStore, setAppStore } from '../App';
import { EFFECTS, EffectState, ReverbParams, EffectSlot, createEmptyEffect } from '../state';
import * as SynthInputHandler from '../synthInputHandler';
import GenericManager from './GenericManager';

const EffectsManager: Component = () => {
  const activeEffects = createMemo(() => (appStore.effects as EffectState[]) ?? []);

  // Handler now correctly and safely typed with EffectState
  const handleAddEffect = async (newItem: EffectState) => {
    const emptySlotIndex = activeEffects().findIndex(effect => effect.type === "Empty");
    if (emptySlotIndex === -1) {
      console.warn("No empty effect slot available. Cannot add more effects.");
      return;
    }
    // Use the found index as the EffectSlot for the synth handler (0-index to 1-index)
    const effectSlot = (emptySlotIndex + 1) as EffectSlot;

    // Send the update to the synth engine
    switch (newItem.type) {
      case "Reverb":
        SynthInputHandler.setEffectReverb(newItem.params, effectSlot);
        break;
      // Add other cases here...
      default:
        return;
    }

    // Replace the "Empty" placeholder at the found index with the new effect.
    setAppStore('effects', emptySlotIndex, newItem);
  };

  const handleUpdateEffect = async (itemIndex: number, paramId: string, newValue: number) => {
    const currentEffectSlotState = activeEffects()[itemIndex];
    if (!currentEffectSlotState) return;
    const effectSlot = itemIndex + 1 as EffectSlot;
    let updatedEffect: EffectState;
    switch (currentEffectSlotState.type) {
      case "Reverb": {
        const updatedParams: ReverbParams = { ...currentEffectSlotState.params, [paramId]: newValue };
        SynthInputHandler.setEffectReverb(updatedParams, effectSlot);
        updatedEffect = {
          ...currentEffectSlotState,
          params: updatedParams,
        };
        break;
      }
      default:
        console.warn(`Unknown effect type: ${currentEffectSlotState.type}`);
        return;
    }
    setAppStore('effects', itemIndex, updatedEffect);
  };

  const handleRemoveEffect = async (itemIndex: number) => {
    console.log(`Removing effect at index ${itemIndex}`);
    setAppStore('effects', itemIndex, createEmptyEffect());
    SynthInputHandler.removeEffect(itemIndex + 1 as EffectSlot);
  };

  return (
    // We pass the specific EffectState as the generic parameter.
    // All props now match perfectly without any casting.
    <GenericManager<EffectState>
      title="Master Effects"
      itemNoun="Effect"
      itemNounPlural="Effects"
      configArray={EFFECTS}
      activeItemsAccessor={activeEffects}
      uniqueIdPrefix="global-effect"
      maxItems={3}
      onAdd={handleAddEffect}
      onUpdate={handleUpdateEffect}
      onRemove={handleRemoveEffect}
    />
  );
};

export default EffectsManager;

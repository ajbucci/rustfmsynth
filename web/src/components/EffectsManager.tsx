// components/EffectsManager.tsx

import { Component, createMemo } from 'solid-js';
import { appStore, setAppStore } from '../App';
import { EFFECTS, EffectState, EffectSlots, ReverbParams, EffectSlot } from '../state';
import * as SynthInputHandler from '../synthInputHandler';
import GenericManager from './GenericManager';

const EffectsManager: Component = () => {
  const activeEffects = createMemo(() => (appStore.effects as EffectSlots) ?? []);

  // Handler now correctly and safely typed with EffectState
  const handleAddEffect = async (newItem: EffectState) => {
    const effectSlot = (activeEffects().length + 1) as EffectSlot;
    switch (newItem.type) {
      case "Reverb":
        SynthInputHandler.setEffectReverb(newItem.params, effectSlot);
        break;
      default: return;
    }
    setAppStore('effects', (prev = []) => [...(prev ?? []), newItem] as EffectSlots);
  };

  const handleUpdateEffect = async (itemIndex: number, paramId: string, newValue: number) => {
    const currentEffect = activeEffects()[itemIndex];
    if (!currentEffect) return;
    const effectSlot = (itemIndex + 1) as EffectSlot;
    switch (currentEffect.type) {
      case "Reverb": {
        const updatedParams: ReverbParams = { ...currentEffect.params, [paramId]: newValue };
        SynthInputHandler.setEffectReverb(updatedParams, effectSlot);
        break;
      }
    }
    setAppStore('effects', itemIndex, 'params', paramId as any, newValue);
  };

  const handleRemoveEffect = async (itemType: string) => {
    setAppStore('effects', (prev) => (prev ?? []).filter(e => e.type !== itemType) as EffectSlots);
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

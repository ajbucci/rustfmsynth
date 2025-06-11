import { Component, createSignal, createMemo } from "solid-js"
import { EffectState, EffectConfig, EffectParamsUnion, EFFECTS } from "../state"
import { appStore } from "../App";
interface EffectManagerProps {
  id?: string;
}
const EffectManager: Component<EffectManagerProps> = (props) => {

  const [adderSelectedTypeTag, setAdderSelectedTypeTag] = createSignal<EffectState['type'] | null>(null);
  const [adderParams, setAdderParams] = createSignal<Record<string, number>>({});

  const activeEffects = createMemo<ReadonlyArray<EffectState>>(() => appStore.effects);
  const activeTypeTags = createMemo(() => new Set(activeEffects().map(e => e.type)));

  const selectedAdderConfig = createMemo(() => {
    const tag = adderSelectedTypeTag();
    return tag ? EFFECTS.find((e): e is EffectConfig => e.type === tag) : null;
  });

  return (
    <div>
    </div>
  )
}
export default EffectManager;

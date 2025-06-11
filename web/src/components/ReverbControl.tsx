import { Component, createSignal, createEffect, Show, Accessor, untrack } from 'solid-js';
import Dial from './Dial';
import NumericParameterInput from './NumericParameterInput';

export type FrequencyMode = 'ratio' | 'fixedFrequency';

// --- Props for FrequencyManager ---
interface ReverbControlProps {
  id?: string;
}

const ReverbControl: Component<ReverbControlProps> = (props) => {

  return (
    <div>
    </div>
  )
}
export default ReverbControl;

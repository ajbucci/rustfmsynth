import { Component, Accessor, createSignal, createEffect, on, untrack } from 'solid-js';
import { clampValue } from '../utils';

interface NumericParameterInputProps {
  label: string;
  id: string;
  numericValue: Accessor<number>; // The source of truth from the parent
  onCommit: (newValue: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: Accessor<boolean>;
}

const NumericParameterInput: Component<NumericParameterInputProps> = (props) => {
  const [inputValue, setInputValue] = createSignal<string>('');

  createEffect(() => {
    const propNumValue = props.numericValue() ?? props.min;
    const propStringValue = String(propNumValue);

    // Only update the internal signal if the prop's string representation
    // differs from the current internal value. This prevents loops where
    // typing updates inputValue -> triggers onCommit -> updates prop -> triggers effect -> updates inputValue
    // Use untrack to read the current inputValue without making this effect depend on it.
    if (untrack(inputValue) !== propStringValue) {
      setInputValue(propStringValue);
    }
  });
  const handleInput = (event: InputEvent) => {
    const target = event.currentTarget as HTMLInputElement;
    const currentString = target.value;

    // Allow user to type intermediate valid states (like "-", ".", "1.")
    const isValidIntermediate = /^-?\d*\.?\d*$/.test(currentString);

    if (isValidIntermediate) {
      setInputValue(currentString);

      const numericValue = parseFloat(currentString);
      let valueToCommit: number | null = null;

      if (!isNaN(numericValue)) {
        valueToCommit = clampValue(numericValue, props.min, props.max);
      } else if (currentString === '' || currentString === '-' || currentString === '.' || currentString === '-.') {
        // If input is empty or in an intermediate state that parses to NaN,
        // maybe commit the minimum value or wait for blur? Let's commit min for now.
        // valueToCommit = props.min;
      }

      if (valueToCommit !== null) {
        const currentPropValue = props.numericValue();
        // Use tolerance for float comparison
        if (Math.abs(valueToCommit - currentPropValue) > 1e-9) {
          props.onCommit(valueToCommit);
        }
      }
    }
  };

  const handleBlur = () => {
    // On blur, ensure the input displays the *definitive* value from the prop
    // This cleans up any intermediate states (like ending with ".")
    const finalNumericValue = props.numericValue() ?? props.min;
    setInputValue(String(finalNumericValue));
  };

  return (
    <div class={`param param-${props.id}`}>
      <label for={props.id}>
        {props.label}{" "}
        {props.unit && `(${props.unit})`}
      </label>
      <input
        type="text"
        inputmode="decimal"
        id={props.id}
        name={props.id}
        value={inputValue()}
        onInput={handleInput}
        onBlur={handleBlur}
        autocomplete="off"
        disabled={props.disabled ? props.disabled() : false}
        class="number-input"
      />
    </div>
  );
};

export default NumericParameterInput;

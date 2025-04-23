import { Component, Accessor, createSignal, onMount } from 'solid-js';
import { clampValue } from '../utils';

interface NumericParameterInputProps {
  label: string;
  id: string;
  numericValue: Accessor<number>;
  onCommit: (newValue: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: Accessor<boolean>;
}

const NumericParameterInput: Component<NumericParameterInputProps> = (props) => {
  const [inputValue, setInputValue] = createSignal<string>('');

  onMount(() => {
    const initialNumericValue = props.numericValue() ?? props.min;
    setInputValue(String(initialNumericValue));
  });

  const handleInput = (event: InputEvent) => {
    const target = event.currentTarget as HTMLInputElement;
    const currentString = target.value;
    let valueToCommit: number | null = null;

    const isValidInputFormat = /^-?\d*\.?\d*$/.test(currentString);

    if (isValidInputFormat) {
      setInputValue(currentString);

      const numericValue = parseFloat(currentString);
      if (!isNaN(numericValue)) {
        valueToCommit = clampValue(numericValue, props.min, props.max);
      } else if (currentString === '' || currentString === '.' || currentString === '-' || currentString === '-.') {
        valueToCommit = props.min;
      } else if (/^[-]?0\.0*$/.test(currentString)) {
        valueToCommit = clampValue(0, props.min, props.max);
      }
    } else {
      console.warn(`Invalid input format "${currentString}", commit skipped.`);
    }

    const parentNumericValue = props.numericValue();
    if (valueToCommit !== null && valueToCommit !== parentNumericValue) {
      props.onCommit(valueToCommit);
    }
  };

  const handleBlur = () => {
    const finalNumericValue = props.numericValue() ?? props.min;
    const formattedFinalValue = String(finalNumericValue);
    const currentVisual = inputValue();

    if (currentVisual !== formattedFinalValue) {
      setInputValue(formattedFinalValue);
    }
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

import { Component, Accessor, createSignal, createEffect, on, untrack } from 'solid-js';
import { clampValue, formatNumberToMinDecimals } from '../utils';
const DEFAULT_MIN_DECIMAL_PLACES = 0;

interface NumericParameterInputProps {
  label: string;
  id: string;
  numericValue: Accessor<number>; // The source of truth from the parent
  onCommit: (newValue: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  minDecimalPlaces?: number;
  disabled?: Accessor<boolean>;
}
const numbersAreEqual = (num1: number | undefined | null, num2: number | undefined | null): boolean => {
  if (num1 == null || num2 == null) return num1 === num2;
  if (isNaN(num1) && isNaN(num2)) return true;
  if (isNaN(num1) || isNaN(num2)) return false;
  return Math.abs(num1 - num2) < 1e-9;
};
const NumericParameterInput: Component<NumericParameterInputProps> = (props) => {
  const [inputValue, setInputValue] = createSignal<string>('');
  const [isFocused, setIsFocused] = createSignal<boolean>(false);

  const displayMinDecimalPlaces = () => props.minDecimalPlaces ?? DEFAULT_MIN_DECIMAL_PLACES;

  createEffect(() => {
    // This effect *only* syncs the input display when it's NOT focused.
    const focused = untrack(isFocused);

    if (!focused) {
      const propNumValue = props.numericValue() ?? props.min;
      const formattedPropStringValue = formatNumberToMinDecimals(propNumValue, displayMinDecimalPlaces());
      const currentInputString = untrack(inputValue);

      // If not focused, and the display doesn't match the formatted prop, update it.
      if (currentInputString !== formattedPropStringValue) {
        // console.log(`Sync (Not Focused): Input ${currentInputString} -> ${formattedPropStringValue}`);
        setInputValue(formattedPropStringValue);
      }
    }
  });

  const handleInput = (event: InputEvent) => {
    const target = event.currentTarget as HTMLInputElement;
    const currentString = target.value;
    const isValidIntermediateOrFinal = /^-?\d*\.?\d*$/.test(currentString) || currentString === '';

    if (isValidIntermediateOrFinal) {
      setInputValue(currentString); // Show exactly what user types

      const numericValue = parseFloat(currentString);
      if (!isNaN(numericValue)) {
        const valueToCommit = clampValue(numericValue, props.min, props.max);
        const currentPropValue = props.numericValue() ?? props.min;

        if (!numbersAreEqual(valueToCommit, currentPropValue)) {
          // console.log(`Committing: ${valueToCommit} (from input ${currentString})`);
          props.onCommit(valueToCommit);
        }
      }
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    // On blur, always format the definitive prop value using the helper.
    const finalNumericValue = props.numericValue() ?? props.min;
    const finalFormattedStringValue = formatNumberToMinDecimals(finalNumericValue, displayMinDecimalPlaces());
    // console.log(`Blur: Setting input to ${finalFormattedStringValue}`);
    setInputValue(finalFormattedStringValue);

    // Optional: Re-commit clamped value on blur if needed
    const currentPropValue = props.numericValue() ?? props.min;
    const clampedFinalValue = clampValue(finalNumericValue, props.min, props.max);
    if (!numbersAreEqual(clampedFinalValue, currentPropValue)) {
      // console.log(`Blur commit: ${clampedFinalValue}`);
      props.onCommit(clampedFinalValue);
    }
  };
  const handleWheel = (event: WheelEvent) => {
    // Ignore if disabled or no valid step is provided
    if (props.disabled?.() || props.step === undefined || props.step <= 0 || event.target !== document.activeElement) {
      return;
    }

    // Prevent the default page scrolling behavior
    event.preventDefault();

    const currentValue = props.numericValue() ?? props.min;
    const step = props.step; // Safe to use now

    let change = 0;
    if (event.deltaY < 0) { // Wheel scroll up
      change = step;
    } else if (event.deltaY > 0) { // Wheel scroll down
      change = -step;
    } else {
      return; // No vertical scroll detected
    }

    // Calculate the potential new value
    // Handle potential floating point inaccuracies by rounding based on step's precision
    const stepString = String(step);
    const decimalPlaces = stepString.includes('.') ? stepString.split('.')[1].length : 0;
    const multiplier = Math.pow(10, decimalPlaces);
    const newValue = (Math.round(currentValue * multiplier) + Math.round(change * multiplier)) / multiplier;


    // Clamp the new value
    const clampedNewValue = clampValue(newValue, props.min, props.max);

    // Commit the change if the value actually changed
    if (!numbersAreEqual(clampedNewValue, currentValue)) {
      // console.log(`Committing Wheel: ${clampedNewValue}`);
      props.onCommit(clampedNewValue);

      // If the input is currently focused, update its display value immediately
      // Otherwise, the createEffect will handle it when the prop updates
      if (isFocused()) {
        const formattedNewValue = formatNumberToMinDecimals(clampedNewValue, displayMinDecimalPlaces());
        setInputValue(formattedNewValue);
      }
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
        onFocus={handleFocus}
        onWheel={handleWheel}
        autocomplete="off"
        disabled={props.disabled ? props.disabled() : false}
        class="number-input"
      />
    </div>
  );
};

export default NumericParameterInput;

import { createEffect, Component, Accessor, For, createSignal } from 'solid-js';
import { SetStoreFunction, Store } from 'solid-js/store'; // Import Store types if passing parts of store
import { EnvelopeState, OperatorState, AppState, WAVEFORM_NAMES, WAVEFORM_NAME_TO_ID, WAVEFORM_ID_TO_NAME, WaveformName, WaveformId } from '../state'; // Import state types
import { appStore, setAppStore } from '../App'; // Import the app store and setter
import Dial from './Dial'; // Import the Dial component
import { DialMode } from './Dial'; // Import the DialMode type
import Crossfader from './Crossfader'; // Import the Crossfader component
import WaveformSelect from './WaveformSelect'; // Import the WaveformSelect component
import EnvelopeControl from './EnvelopeControl'; // Import the EnvelopeControl component
import { NUM_OPERATORS } from '../config'; // Import the number of operators
import * as SynthInputHandler from '../synthInputHandler'; // Import the synth input handler
import FilterManager from './FilterManager';
import NumericParameterInput from './NumericParameterInput';
// Define props for the OperatorControl
interface OperatorControlProps {
  operatorIndex: number;
  isFineModeActive: Accessor<boolean>;
}

// Configuration specific to the Ratio dial (could be imported)
const RATIO_COARSE_STRINGS = ['1/128', '1/64', '1/32', '1/16', '1/8', '1/4', '1/2', ...Array.from({ length: 32 }, (_, i) => (i + 1).toString())];
const RATIO_COARSE_VALUES = RATIO_COARSE_STRINGS.map(v => {
  try { return eval(v); } catch { return 1; } // Basic eval, handle errors
});
const RATIO_MIN = RATIO_COARSE_VALUES[0];
const RATIO_MAX = RATIO_COARSE_VALUES[RATIO_COARSE_VALUES.length - 1];
const FIXED_FREQ_MIN = 0.0001;
const FIXED_FREQ_MAX = 20000.0; // Example
const DEFAULT_FIXED_FREQ_ON_SWITCH = 440.0; // Default value when switching to fixed frequency mode

const MOD_INDEX_MIN = 0.0;
const MOD_INDEX_MAX = 10.0; // Example
const MOD_INDEX_STEP = 0.01;

const OperatorControl: Component<OperatorControlProps> = (props) => {
  // --- Create local accessors/handlers using IMPORTED store/setter ---
  const ratioValue = () => appStore.operators[props.operatorIndex]?.ratio; // Read imported store
  const fixedFreqValue = () => appStore.operators[props.operatorIndex]?.fixedFrequency; // Read imported store
  const detuneValue = () => appStore.operators[props.operatorIndex]?.detune; // Read imported store
  const modIndexValue = () => appStore.operators[props.operatorIndex]?.modulationIndex;
  const waveformValue = () => appStore.operators[props.operatorIndex]?.waveform;
  const envelopeValue = () => appStore.operators[props.operatorIndex]?.envelope;
  let [dialMode, setDialMode] = createSignal('ratio' as DialMode); // Local state for dial mode
  createEffect(() => {
    const freq = fixedFreqValue();
    // If fixed frequency is non-zero, set mode to fixedFrequency, otherwise ratio.
    // This runs initially and whenever fixedFreqValue changes.
    if (freq !== 0) {
      setDialMode('fixedFrequency');
    } else {
      setDialMode('ratio');
    }
  });
  const handleRatioChange = (newValue: number) => {
    // Use imported setAppStore
    console.log(`Setting ratio for ${props.operatorIndex}: ${newValue}`);
    SynthInputHandler.setOperatorRatio(props.operatorIndex, newValue); // Call synth handler
    setAppStore('operators', props.operatorIndex, 'ratio', newValue);
    // Reset Fixed Freq to 0 when Ratio is set
    if (fixedFreqValue() !== 0) {
      setAppStore('operators', props.operatorIndex, 'fixedFrequency', 0);
      SynthInputHandler.setOperatorFixedFrequency(props.operatorIndex, 0);
      // The createEffect will automatically switch dialMode back to 'ratio'
    }
  };
  const handleFixedFreqChange = (newValue: number) => {
    SynthInputHandler.setOperatorFixedFrequency(props.operatorIndex, newValue); // Call synth handler
    setAppStore('operators', props.operatorIndex, 'fixedFrequency', newValue);
  };
  const handleDetuneChange = (newValue: number) => {
    SynthInputHandler.setOperatorDetune(props.operatorIndex, newValue); // Call synth handler
    setAppStore('operators', props.operatorIndex, 'detune', newValue);
  };
  const handleModIndexChange = (newValue: number) => {
    SynthInputHandler.setOperatorModIndex(props.operatorIndex, newValue); // Call synth handler
    setAppStore('operators', props.operatorIndex, 'modulationIndex', newValue);
  };
  const handleWaveformChange = (waveformId: WaveformId) => {
    SynthInputHandler.setOperatorWaveform(props.operatorIndex, waveformId); // Call synth handler
    setAppStore('operators', props.operatorIndex, 'waveform', waveformId);
  };
  const handleEnvelopeParamChange = (
    paramKey: keyof EnvelopeState, // 'attack', 'decay', etc.
    numericValue: number          // The validated numeric value from EnvelopeControl's input
  ) => {
    // Validation might have already happened, but double-check is ok
    if (typeof numericValue === 'number' && numericValue >= 0) {
      setAppStore('operators', props.operatorIndex, 'envelope', paramKey, numericValue);
      let attack = envelopeValue().attack;
      let decay = envelopeValue().decay;
      let sustain = envelopeValue().sustain;
      let release = envelopeValue().release;
      SynthInputHandler.setOperatorEnvelope(props.operatorIndex, attack, decay, sustain, release);
    } else {
      console.error(`OperatorControl received invalid value for ${paramKey}: ${numericValue}`);
    }
  };
  // Handler for the Dial's mode toggle button
  const handleModeToggle = (newMode: DialMode) => {
    if (newMode === 'fixedFrequency') {
      // If switching TO fixed mode and current fixed freq is 0,
      // set a default non-zero value.
      if (fixedFreqValue() === 0) {
        // Use handleFixedFreqChange to update store and synth
        handleFixedFreqChange(DEFAULT_FIXED_FREQ_ON_SWITCH);
        // Note: The createEffect will run because fixedFreqValue changed,
        // setting the mode correctly. We don't strictly need setDialMode here,
        // but it makes the immediate UI update slightly faster.
        setDialMode('fixedFrequency');
      } else {
        // If fixed freq is already non-zero, just update the local mode state
        setDialMode('fixedFrequency');
      }
    } else { // Switching to 'ratio' mode
      // Ensure fixed frequency becomes 0 when explicitly switching to ratio mode
      if (fixedFreqValue() !== 0) {
        handleFixedFreqChange(0); // This updates store+synth, effect handles mode
        handleRatioChange(ratioValue()); // Ensure ratio is set correctly
      } else {
        // If fixed freq is already 0, just update the local mode state
        setDialMode('ratio');
      }
    }
  };
  const isActive = () => appStore.algorithm[props.operatorIndex]?.[NUM_OPERATORS] === 1; // Read imported store
  // ------------------------------------------------------------------

  return (
    <div class="operator-control" /* ... */>
      <h3>Operator {props.operatorIndex + 1}</h3>
      <Dial
        label={dialMode() === 'ratio' ? 'Ratio' : 'Fixed'}
        id={`dial-` + props.operatorIndex}
        mode={dialMode} // Pass local state
        onModeChange={handleModeToggle} // Pass local setter
        value={dialMode() === 'ratio' ? ratioValue : fixedFreqValue} // Pass local accessor
        onChange={dialMode() === 'ratio' ? handleRatioChange : handleFixedFreqChange} // Pass local handler
        isActive={isActive}
        isFineModeActive={props.isFineModeActive}
        minVal={dialMode() === 'ratio' ? RATIO_MIN : FIXED_FREQ_MIN} // Pass min value based on mode
        maxVal={dialMode() === 'ratio' ? RATIO_MAX : FIXED_FREQ_MAX} // Pass max value based on mode
        coarseValues={RATIO_COARSE_VALUES}
      />
      <NumericParameterInput
        label="Detune"
        id={`detune-` + props.operatorIndex}
        numericValue={detuneValue}
        onCommit={handleDetuneChange}
        category="detune"
        min={-1200}
        max={1200}
        default={0.0}
        step={0.5} />
      <hr
        style={{
          "border-top": "1px solid red;",
          width: 100 + "%",
        }}
      />
      <Crossfader
        label={`Mod Index`}
        id={`mod-` + props.operatorIndex}
        value={modIndexValue}
        onChange={handleModIndexChange}
        isFineModeActive={props.isFineModeActive} // Pass fine mode down
        // Pass fader-specific config
        minVal={MOD_INDEX_MIN}
        maxVal={MOD_INDEX_MAX}
        step={MOD_INDEX_STEP}
      />
      <hr />
      <WaveformSelect
        value={waveformValue}
        onChange={handleWaveformChange}
        operatorIndex={props.operatorIndex}
      //{/* isActive={isActive} // Pass isActive to disable the select */}
      />
      <hr />
      <EnvelopeControl
        operatorIndex={props.operatorIndex} // Still needed for IDs maybe? Or just for context?
        //isActive={isActive}
        value={envelopeValue} // Pass the accessor for the whole envelope object
        onParamChange={handleEnvelopeParamChange} // Pass the single handler
      />
      <hr />
      <FilterManager
        operatorIndex={props.operatorIndex}
      />
    </div>
  );
};
export default OperatorControl;

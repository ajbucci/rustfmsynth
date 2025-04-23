import { Component, Accessor, For } from 'solid-js';
import { SetStoreFunction, Store } from 'solid-js/store'; // Import Store types if passing parts of store
import { EnvelopeState, OperatorState, AppState, WAVEFORM_NAMES, WAVEFORM_NAME_TO_ID, WAVEFORM_ID_TO_NAME, WaveformName, WaveformId } from '../state'; // Import state types
import { appStore, setAppStore } from '../App'; // Import the app store and setter
import Dial from './Dial'; // Import the Dial component
import Crossfader from './Crossfader'; // Import the Crossfader component
import WaveformSelect from './WaveformSelect'; // Import the WaveformSelect component
import EnvelopeControl from './EnvelopeControl'; // Import the EnvelopeControl component
import { NUM_OPERATORS } from '../config'; // Import the number of operators
import * as SynthInputHandler from '../synthInputHandler'; // Import the synth input handler
import FilterManager from './FilterManager';
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

const MOD_INDEX_MIN = 0.0;
const MOD_INDEX_MAX = 10.0; // Example
const MOD_INDEX_STEP = 0.01;

const OperatorControl: Component<OperatorControlProps> = (props) => {
  // --- Create local accessors/handlers using IMPORTED store/setter ---
  const ratioValue = () => appStore.operators[props.operatorIndex]?.ratio; // Read imported store
  const modIndexValue = () => appStore.operators[props.operatorIndex]?.modulationIndex;
  const waveformValue = () => appStore.operators[props.operatorIndex]?.waveform;
  const envelopeValue = () => appStore.operators[props.operatorIndex]?.envelope;
  const handleRatioChange = (newValue: number) => {
    // Use imported setAppStore
    SynthInputHandler.setOperatorRatio(props.operatorIndex, newValue); // Call synth handler
    setAppStore('operators', props.operatorIndex, 'ratio', newValue);
  };
  const handleModIndexChange = (newValue: number) => {
    SynthInputHandler.setOperatorModIndex(props.operatorIndex, newValue); // Call synth handler
    setAppStore('operators', props.operatorIndex, 'modulationIndex', newValue);
  };
  const handleWaveformChange = (waveformId: WaveformId) => {
    console.log(waveformId);
    SynthInputHandler.setOperatorWaveform(props.operatorIndex, waveformId); // Call synth handler
    setAppStore('operators', props.operatorIndex, 'waveform', waveformId);
  };
  const handleEnvelopeParamChange = (
    paramKey: keyof EnvelopeState, // 'attack', 'decay', etc.
    numericValue: number          // The validated numeric value from EnvelopeControl's input
  ) => {
    // Validation might have already happened, but double-check is ok
    if (typeof numericValue === 'number' && numericValue >= 0) {
      console.log(`OperatorControl: Setting Op ${props.operatorIndex} Envelope ${paramKey} to ${numericValue}`);
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
  const isActive = () => appStore.algorithm[props.operatorIndex]?.[NUM_OPERATORS] === 1; // Read imported store
  // ------------------------------------------------------------------

  return (
    <div class="operator-control" /* ... */>
      <h3>Operator {props.operatorIndex + 1}</h3>
      <Dial
        label={`Ratio`}
        id={`dial-` + props.operatorIndex}
        value={ratioValue} // Pass local accessor
        onChange={handleRatioChange} // Pass local handler
        isActive={isActive}
        isFineModeActive={props.isFineModeActive}
        minVal={RATIO_MIN}
        maxVal={RATIO_MAX}
        coarseValues={RATIO_COARSE_VALUES}

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
      <WaveformSelect
        value={waveformValue}
        onChange={handleWaveformChange}
        operatorIndex={props.operatorIndex}
      //{/* isActive={isActive} // Pass isActive to disable the select */}
      />
      <EnvelopeControl
        operatorIndex={props.operatorIndex} // Still needed for IDs maybe? Or just for context?
        //isActive={isActive}
        value={envelopeValue} // Pass the accessor for the whole envelope object
        onParamChange={handleEnvelopeParamChange} // Pass the single handler
      />
      <FilterManager
        operatorIndex={props.operatorIndex}
      />
    </div>
  );
};
export default OperatorControl;

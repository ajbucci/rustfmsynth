import { Component, For, Accessor } from "solid-js";
import { WAVEFORM_NAMES, WAVEFORM_NAME_TO_ID, WAVEFORM_ID_TO_NAME, WaveformId } from "../state";
interface WaveformProps {
  value: Accessor<number>;
  onChange: (waveformId: WaveformId) => void;

  operatorIndex: number;
}
const WaveformSelect: Component<WaveformProps> = (props) => {
  return (
    <div class="parameter-container">
      <label class="parameter-title" for={`waveform-${props.operatorIndex}`}>Waveform</label>
      <select
        id={`waveform-${props.operatorIndex}`}
        //* disabled={!isActive()} */
        value={props.value()}
        onChange={(e) => {
          const target = e.currentTarget as HTMLSelectElement;
          const selectedIdString = target.value;
          const selectedId = parseInt(selectedIdString, 10);

          // Validate and call the main handler
          if (!isNaN(selectedId) && WAVEFORM_ID_TO_NAME.hasOwnProperty(selectedId)) {
            props.onChange(selectedId as WaveformId); // Call the single handler
          } else {
            console.error("Invalid waveform ID selected from dropdown:", selectedIdString);
          }
        }}
      >
        <For each={WAVEFORM_NAMES}>
          {(name) => {
            const id = WAVEFORM_NAME_TO_ID[name];
            return (
              <option value={id}>{name}</option>
            );
          }}
        </For>
      </select>
    </div>
  )
}
export default WaveformSelect;

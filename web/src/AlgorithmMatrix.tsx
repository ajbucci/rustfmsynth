import { Component, For, createSignal } from 'solid-js';
import { Store, unwrap } from 'solid-js/store';
import { produce } from 'solid-js/store';
import * as SynthInputHandler from '../synthInputHandler';
import { AlgorithmSetterArg } from '../state';
import '../style.css';
interface AlgorithmMatrixProps {
  numOperators: number;
  // Pass the algorithm part of the store and its setter
  algorithm: Store<number[][]>; // The reactive matrix state
  setAlgorithmState: (valueOrUpdater: AlgorithmSetterArg) => void; // Function to update the store
}

const AlgorithmMatrix: Component<AlgorithmMatrixProps> = (props) => {
  const [hoverText, setHoverText] = createSignal<string>('Hover over a cell...');
  const numOps = () => props.numOperators; // Make prop access reactive if needed later

  // --- Click Handler ---
  const handleCellClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const cell = target.closest('td');
    if (!cell) return;

    // Use produce for the update
    props.setAlgorithmState(produce(matrix => {
      // 'matrix' is the draft proxy here

      // --- Perform modifications on the draft proxy 'matrix' ---
      if (cell.dataset.outputOp) {
        const opIndex = parseInt(cell.dataset.outputOp) - 1;
        const outColIndex = numOps();
        if (opIndex >= 0 && opIndex < numOps() && matrix[opIndex]) { // Add row check
          // Toggle value in the draft
          matrix[opIndex][outColIndex] = 1 - (matrix[opIndex][outColIndex] || 0); // Handle potential undefined
        }
      } else if (cell.dataset.modulator && cell.dataset.modulated) {
        const modulatorRowUI = parseInt(cell.dataset.modulator);
        const modulatedColUI = parseInt(cell.dataset.modulated);
        const modulatorIndex = modulatorRowUI - 1;
        const modulatedIndex = modulatedColUI - 1;

        if (modulatorIndex >= 0 && modulatorIndex < numOps() &&
          modulatedIndex >= 0 && modulatedIndex < numOps() &&
          matrix[modulatedIndex]) // Add row check
        {
          // Toggle value in the draft
          matrix[modulatedIndex][modulatorIndex] = 1 - (matrix[modulatedIndex][modulatorIndex] || 0); // Handle potential undefined
        }
      }
      // 'produce' implicitly returns the next immutable state based on draft modifications.
    }));

    SynthInputHandler.setAlgorithm(unwrap(props.algorithm));
  };

  const handleMouseOver = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const cell = target.closest('td');
    if (!cell) return;

    let textToShow = 'Hover over a cell...'; // Default
    if (cell.dataset.outputOp) {
      textToShow = `Toggle Operator ${cell.dataset.outputOp} as audio output (carrier)`;
    } else if (cell.dataset.modulator && cell.dataset.modulated) {
      const modulatorOp = cell.dataset.modulator;
      const modulatedOp = cell.dataset.modulated;
      if (cell.classList.contains('feedback-cell')) {
        textToShow = `Toggle Feedback for Operator ${modulatorOp}`;
      } else {
        textToShow = `Operator ${modulatorOp} modulates Operator ${modulatedOp}`;
      }
    }
    setHoverText(textToShow);
  };
  const handleMouseOut = (event: MouseEvent) => {
    const matrixElement = (event.currentTarget as HTMLElement);
    if (!matrixElement.contains(event.relatedTarget as Node)) {
      setHoverText('Hover over a cell...');
    }
  };


  // --- Rendering ---
  const operatorIndices = () => Array.from({ length: numOps() }, (_, i) => i + 1); // 1-based for labels

  return (
    <div class="algorithm-matrix" onMouseOver={handleMouseOver} onMouseOut={handleMouseOut}>
      <table>
        <thead>
          <tr>
            <th>Modulator</th>
            <For each={operatorIndices()}>{(opNum) => <th>{opNum}</th>}</For>
            <th class="out-header">OUT</th>
          </tr>
        </thead>
        <tbody>
          <For each={operatorIndices()}>{(modulatorOpNum) => // Row loop (Modulator)
            <tr>
              <th>{modulatorOpNum}</th>
              <For each={operatorIndices()}>{(modulatedOpNum) => { // Cell loop (Modulated)
                const isFeedbackCell = modulatorOpNum === modulatedOpNum;
                const isActive = () => {
                  const modIndex = modulatorOpNum - 1;
                  const modulatedIndex = modulatedOpNum - 1;
                  return props.algorithm[modulatedIndex]?.[modIndex] === 1;
                };
                return (
                  <td
                    data-modulator={modulatorOpNum}
                    data-modulated={modulatedOpNum}
                    class={isFeedbackCell ? 'feedback-cell' : ''}
                    classList={{ active: isActive() }} // Reactive class
                    onClick={handleCellClick}
                  >
                    <div class="connection-point"></div>
                  </td>
                );
              }}</For>
              {/* Output Cell */}
              {(() => { // Use IIFE or helper for complex conditional logic
                const opIndex = modulatorOpNum - 1; // 0-based row index
                const outColIndex = numOps();
                const isOutputActive = () => props.algorithm[opIndex]?.[outColIndex] === 1;
                return (
                  <td
                    data-output-op={modulatorOpNum}
                    class="output-cell"
                    classList={{ active: isOutputActive() }} // Reactive class
                    onClick={handleCellClick}
                  >
                    <div class="connection-point output-point"></div>
                  </td>
                );
              })()}
            </tr>
          }</For>
        </tbody>
      </table>
      <div id="matrix-hover-info" class="matrix-info-box">{hoverText()}</div>
    </div>
  );
};

export default AlgorithmMatrix;

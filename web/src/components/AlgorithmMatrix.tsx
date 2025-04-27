import { Component, For, createSignal } from 'solid-js';
import { Store, unwrap } from 'solid-js/store';
import { produce } from 'solid-js/store';
import * as SynthInputHandler from '../synthInputHandler';
import { AlgorithmSetterArg } from '../state';
import '../style.css';

interface AlgorithmMatrixProps {
  numOperators: number;
  algorithm: Store<number[][]>;
  setAlgorithmState: (valueOrUpdater: AlgorithmSetterArg) => void;
}

const AlgorithmMatrix: Component<AlgorithmMatrixProps> = (props) => {
  const [hoverText, setHoverText] = createSignal<string>('Hover over a cell...');
  const numOps = () => props.numOperators;

  const handleCellClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const cell = target.closest('td');
    if (!cell) return;

    props.setAlgorithmState(produce(matrix => {
      if (cell.dataset.outputOp) {
        const opIndex = parseInt(cell.dataset.outputOp) - 1;
        const outColIndex = numOps();
        // Ensure row and column exist before access
        if (opIndex >= 0 && opIndex < numOps() && matrix[opIndex] && matrix[opIndex].length > outColIndex) {
          matrix[opIndex][outColIndex] = 1 - (matrix[opIndex][outColIndex] || 0);
        } else {
          console.warn(`AlgorithmMatrix: Invalid output access: row ${opIndex}, col ${outColIndex}`);
        }
      } else if (cell.dataset.modulator && cell.dataset.modulated) {
        const modulatorRowUI = parseInt(cell.dataset.modulator);
        const modulatedColUI = parseInt(cell.dataset.modulated);
        const sourceIndex = modulatorRowUI - 1;   // Modulator is the Source
        const targetIndex = modulatedColUI - 1;   // Modulated is the Target

        // Ensure row and column exist before access
        if (sourceIndex >= 0 && sourceIndex < numOps() &&
          targetIndex >= 0 && targetIndex < numOps() &&
          matrix[sourceIndex] && matrix[sourceIndex].length > targetIndex) {
          matrix[sourceIndex][targetIndex] = 1 - (matrix[sourceIndex][targetIndex] || 0);
        } else {
          console.warn(`AlgorithmMatrix: Invalid op-op access: row ${sourceIndex}, col ${targetIndex}`);
        }
      }
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
    // Check if the mouse moved outside the table entirely
    if (!matrixElement.contains(event.relatedTarget as Node)) {
      setHoverText('Hover over a cell...');
    }
  };


  const operatorIndices = () => Array.from({ length: numOps() }, (_, i) => i + 1);

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
          <For each={operatorIndices()}>{(modulatorOpNum) => // Row loop (Source)
            <tr>
              <th>{modulatorOpNum}</th>
              <For each={operatorIndices()}>{(modulatedOpNum) => { // Cell loop (Target)
                const isFeedbackCell = modulatorOpNum === modulatedOpNum;
                const sourceIndex = modulatorOpNum - 1;
                const targetIndex = modulatedOpNum - 1;
                const isActive = () => {
                  // Add bounds check for safety during render
                  return props.algorithm[sourceIndex]?.[targetIndex] === 1;
                };
                return (
                  <td
                    data-modulator={modulatorOpNum}
                    data-modulated={modulatedOpNum}
                    class={isFeedbackCell ? 'feedback-cell' : ''}
                    classList={{ active: isActive() }}
                    onClick={handleCellClick}
                  >
                    <div class="connection-point"></div>
                  </td>
                );
              }}</For>
              {(() => {
                const opIndex = modulatorOpNum - 1; // Source row index
                const outColIndex = numOps();
                const isOutputActive = () => {
                  return props.algorithm[opIndex]?.[outColIndex] === 1;
                };
                return (
                  <td
                    data-output-op={modulatorOpNum}
                    class="output-cell"
                    classList={{ active: isOutputActive() }}
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

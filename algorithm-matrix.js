/**
 * Generates the HTML structure for the algorithm matrix including an OUT column.
 * @param {number} numOperators - The number of operators.
 * @param {HTMLElement} container - The container element to populate.
 */

import { resumeAudioContext } from './app.js'; // Import synth starter
import { tryEnsureSynthAndSendMessage } from './keyboard-input.js'; // Import message sending function

export function createAlgorithmMatrixUI(numOperators, container, onStateChangeCallback) {
  if (!container) {
    console.error("Algorithm Matrix: Container element not provided.");
    return;
  }
  // Ensure callback is a function
  if (typeof onStateChangeCallback !== 'function') {
    console.warn("Algorithm Matrix: No valid onStateChangeCallback provided.");
    onStateChangeCallback = () => { }; // Default no-op
  }

  let tableHtml = `
        <div class="algorithm-matrix">
            <table>
                <thead>
                    <tr>
                        <th>Modulator</th>`; // This label refers to the ROW header now
  // Column headers for modulated operators
  for (let j = 1; j <= numOperators; j++) {
    tableHtml += `<th>${j}</th>`; // Modulated Operator Index
  }
  // Add the OUT column header
  tableHtml += `<th class="out-header">OUT</th>`;
  tableHtml += `
                    </tr>
                </thead>
                <tbody>`;
  // Rows for modulating operators
  for (let i = 1; i <= numOperators; i++) {
    tableHtml += `<tr><th>${i}</th>`; // Modulator Operator Index (Row Header)
    // Cells for modulation connections
    for (let j = 1; j <= numOperators; j++) {
      const isFeedbackCell = (i === j);
      // data-modulator = row index 'i', data-modulated = column index 'j'
      tableHtml += `<td data-modulator="${i}" data-modulated="${j}" class="${isFeedbackCell ? 'feedback-cell' : ''}">`;
      tableHtml += `<span class="connection-point"></span>`;
      tableHtml += `</td>`;
    }
    // Add the OUT cell for this operator row
    // data-output-op corresponds to the modulator operator index 'i' (the row)
    tableHtml += `<td data-output-op="${i}" class="output-cell ${i == 1 ? 'active' : ''}">`;
    tableHtml += `<span class="connection-point output-point"></span>`;
    tableHtml += `</td>`;
    tableHtml += `</tr>`;
  }
  tableHtml += `
                </tbody>
            </table>`;


  // Add Hover Info display area
  tableHtml += `<div id="matrix-hover-info" class="matrix-info-box">Hover over a cell...</div>`;

  tableHtml += `</div>`; // Close algorithm-matrix

  container.innerHTML = tableHtml;
  console.log(`Algorithm Matrix UI created for ${numOperators} operators including OUT column.`);

  setupMatrixEventListeners(container, onStateChangeCallback); // Set up event listeners for the matrix
}

const sendMatrixUpdate = async (matrix, onStateChangeCallback) => {
  resumeAudioContext(); // Ensure context is running

  const message = {
    type: 'set-algorithm',
    matrix: matrix,
  };
  const messageId = `set-matrix`;
  const success = await tryEnsureSynthAndSendMessage(messageId, message);
  if (success) {
    console.log(`Sent matrix update`);
    onStateChangeCallback(); // Call callback on success
  } else {
    console.warn(`Matrix Controls: Failed to send set-algorithm for connection matrix`);
  }
  // Return success status (optional, but can be useful)
  return success;
};

/**
 * Reads the current state of the matrix UI and returns the combined algorithm configuration
 * as a single matrix: matrix[row][column] including an extra column for carriers.
 * Dimensions: opCount x (opCount + 1)
 * Value: 1 for connection/feedback/carrier, 0 otherwise.
 * matrix[row][col] = 1 means:
 *      if col < opCount: Operator 'col' modulates Operator 'row'
 *      if col == opCount: Operator 'row' is a carrier
 * @param {HTMLElement} container - The container element holding the matrix UI.
 * @returns {number[][] | null} A 2D array representing the combined algorithm matrix, or null.
 */
export function getAlgorithmFromMatrix(container) {
  if (!container) return null;

  // opCount is based on actual operator columns (thead th count), excluding 'Modulator' and 'OUT' headers
  const opCount = container.querySelectorAll('thead th').length - 2;
  if (opCount <= 0) return null;

  // Initialize opCount x (opCount + 1) matrix with zeros
  const resultMatrix = Array.from({ length: opCount }, () => Array(opCount + 1).fill(0));

  // Process connections & feedback (populate columns 0 to opCount-1)
  container.querySelectorAll('td[data-modulator][data-modulated].active').forEach(cell => {
    const row_modulator = parseInt(cell.dataset.modulator) - 1; // The OP doing the modulating (row index)
    const col_modulated = parseInt(cell.dataset.modulated) - 1; // The OP being modulated (col index)

    if (row_modulator >= 0 && row_modulator < opCount && col_modulated >= 0 && col_modulated < opCount) {
      // Set connection or feedback flag: matrix[modulated][modulator] = 1
      // Note: Swapped row/col indices here compared to previous attempt
      resultMatrix[col_modulated][row_modulator] = 1;
    }
  });

  // Process carriers (populate the last column, index opCount)
  container.querySelectorAll('td.output-cell.active').forEach(cell => {
    // The data-output-op corresponds to the operator index (row)
    const opIndex_row = parseInt(cell.dataset.outputOp) - 1;

    if (opIndex_row >= 0 && opIndex_row < opCount) {
      // Set carrier flag in the last column for this operator's row
      resultMatrix[opIndex_row][opCount] = 1;
    }
  });

  // console.log("Generated Combined Algorithm Matrix (Carriers in Col):", JSON.stringify(resultMatrix));
  return resultMatrix; // Return the combined 2D array
}

/**
 * Sets up event listeners for the matrix UI (including OUT column clicks).
 * @param {HTMLElement} container - The container element holding the matrix UI.
 */
function setupMatrixEventListeners(container, onStateChangeCallback) {
  const hoverInfoBox = container.querySelector('#matrix-hover-info');
  const defaultHoverText = "Hover over a cell...";

  // --- Click Listener (Handles Connections, Feedback, and Output Cells) ---
  container.addEventListener('click', (event) => {
    const target = event.target.closest('td'); // Get the TD element clicked
    if (!target || !(target.dataset.modulator || target.dataset.outputOp)) return;

    target.classList.toggle('active');

    const currentCombinedMatrix = getAlgorithmFromMatrix(container);
    if (currentCombinedMatrix) {
      sendMatrixUpdate(currentCombinedMatrix, onStateChangeCallback); // Send the combined matrix only if valid
    } else {
      console.warn("Matrix click occurred, but getAlgorithmFromMatrix returned nullish value. Update not sent.");
    }
  });

  // --- Hover Listeners (Updated slightly for clarity) ---
  container.addEventListener('mouseover', (event) => {
    const target = event.target.closest('td');
    if (!target || !hoverInfoBox) return;
    if (target.classList.contains('output-cell') && target.dataset.outputOp) {
      hoverInfoBox.textContent = `Toggle Operator ${target.dataset.outputOp} as audio output (carrier)`;
    } else if (target.dataset.modulator && target.dataset.modulated) {
      const modulatorOp = target.dataset.modulator; // Operator doing the modulation (row)
      const modulatedOp = target.dataset.modulated; // Operator being modulated (column)
      if (target.classList.contains('feedback-cell')) {
        hoverInfoBox.textContent = `Toggle Feedback for Operator ${modulatorOp}`;
      } else {
        hoverInfoBox.textContent = `Operator ${modulatorOp} modulates Operator ${modulatedOp}`;
      }
    }
  });
  container.addEventListener('mouseout', (event) => {
    const target = event.target.closest('td');
    if (target || event.target === container || event.relatedTarget === null) {
      const relatedTarget = event.relatedTarget ? event.relatedTarget.closest('td') : null;
      if (!relatedTarget || (!relatedTarget.dataset.modulator && !relatedTarget.dataset.outputOp)) {
        if (hoverInfoBox) hoverInfoBox.textContent = defaultHoverText;
      }
    }
  });

  console.log("Algorithm Matrix event listeners attached (incl. OUT column and hover).");
}

/**
 * Updates the matrix UI to reflect a given combined algorithm matrix.
 * Matrix dimensions: opCount x (opCount + 1)
 * @param {HTMLElement} container - The container element holding the matrix UI.
 * @param {number[][]} combinedMatrix - The combined algorithm matrix.
 */
export function displayAlgorithm(container, combinedMatrix) {
  if (!container || !combinedMatrix || !Array.isArray(combinedMatrix) || combinedMatrix.length === 0) {
    console.warn("Algorithm Matrix: Cannot display algorithm - container or valid combined matrix missing.");
    return;
  }

  const opCount = combinedMatrix.length; // Number of rows = opCount
  if (opCount <= 0) return;
  const numCols = combinedMatrix[0]?.length; // Num cols should be opCount + 1

  if (numCols !== opCount + 1) {
    console.warn(`Algorithm Matrix display: Matrix dimensions mismatch (${opCount}x${numCols}, expected ${opCount}x${opCount + 1}).`);
    return;
  }

  // Optional: Check if UI matches opCount
  const uiOpCount = container.querySelectorAll('thead th').length - 2; // Exclude Modulator and OUT
  if (uiOpCount !== opCount) {
    console.warn(`Algorithm Matrix: UI op count (${uiOpCount}) doesn't match data (${opCount}). Might need UI regen.`);
  }

  // Clear existing state from all cells
  container.querySelectorAll('td.active').forEach(cell => cell.classList.remove('active'));

  // Iterate through the combined matrix to set active states
  // combinedMatrix[i][j] = 1 means operator j modulates operator i (or op i is carrier if j=opCount)
  for (let i = 0; i < opCount; i++) {       // Iterate rows (INDEX of the MODULATED or OUTPUTTING operator 'i')
    if (!combinedMatrix[i]) continue;
    for (let j = 0; j < opCount + 1; j++) { // Iterate columns (INDEX of the MODULATING operator 'j', or OUT column)
      if (combinedMatrix[i][j] === 1) {
        // i = 0-based index of the operator being modulated (or outputting)
        // j = 0-based index of the operator doing the modulation (or OUT flag)

        let cell;
        if (j < opCount) { // Connection or Feedback column (j is the modulator index)
          const modulatedOpNum = i + 1; // 1-based index for UI data attribute (operator being modulated)
          const modulatorOpNum = j + 1; // 1-based index for UI data attribute (operator doing the modulation)

          // The UI stores connections based on the visual layout:
          // data-modulator = the ROW number (operator DOING the modulation)
          // data-modulated = the COLUMN number (operator BEING modulated)
          // Feedback cells only have data-modulator (as modulator === modulated visually on the diagonal)

          if (i === j) { // Feedback (diagonal): Modulator Index === Modulated Index
            // Find the cell on the diagonal corresponding to this operator index
            // The feedback cell's data-modulator attribute holds the operator index.
            cell = container.querySelector(`td.feedback-cell[data-modulator="${modulatorOpNum}"]`); // or modulatedOpNum, they are the same here
          } else { // Connection
            // Find the cell using the correct modulator (row) and modulated (column) numbers
            cell = container.querySelector(`td[data-modulator="${modulatorOpNum}"][data-modulated="${modulatedOpNum}"]`);
          }
        } else { // Carrier flag (j == opCount - the last column)
          // i = 0-based index of the operator that is outputting
          const outputOpNum = i + 1; // 1-based index for UI data attribute
          // The output cell's data-output-op attribute holds the operator index.
          cell = container.querySelector(`td.output-cell[data-output-op="${outputOpNum}"]`);
        }

        if (cell) {
          cell.classList.add('active');
        } else {
          // console.warn(`Algorithm Matrix display: Could not find UI cell for matrix[${i}][${j}]`);
        }
      }
    }
  }
  console.log("Algorithm Matrix UI updated from combined matrix data."); // Removed specific format mention for simplicity
}

/**
 * Resets the algorithm matrix UI to a default state (e.g., Op 1 carrier only).
 * @param {HTMLElement} container - The container element holding the matrix UI.
 */
export function resetAlgorithmMatrixUI(container) {
  if (!container) {
    console.error("Algorithm Matrix: Cannot reset UI - container missing.");
    return;
  }
  console.log("Resetting algorithm matrix UI to default (Op 1 carrier)...");

  // Clear all active states first
  container.querySelectorAll('td.active').forEach(cell => cell.classList.remove('active'));

  // Activate the output cell for Operator 1 (index 0)
  const op1OutputCell = container.querySelector(`td.output-cell[data-output-op="1"]`);
  if (op1OutputCell) {
    op1OutputCell.classList.add('active');
    console.log("Activated Op 1 output cell for default state.");
  } else {
    console.warn("Could not find Op 1 output cell during UI reset.");
  }
} 

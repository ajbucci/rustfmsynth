/**
 * Generates the HTML structure for the algorithm matrix including an OUT column.
 * @param {number} numOperators - The number of operators.
 * @param {HTMLElement} container - The container element to populate.
 */

import { resumeAudioContext } from './app.js'; // Import synth starter
import { tryEnsureSynthAndSendMessage } from './keyboard-input.js'; // Import message sending function
import { dialToggleActive, dialSetActive } from './dial.js'
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
 * Pre-calculated mapping from matrix dimension n (where 2 <= n <= 12)
 * to information needed for Base64URL encoding.
 * - bits: Total bits in the n x (n+1) matrix (B = n * (n+1))
 * - length: Expected length of the Base64URL encoded string (L = ceil(B / 6))
 * - padding: Number of zero bits needed for padding ((L * 6) - B)
 */
const n_to_info = {
  2: { bits: 6, length: 1, padding: 0 },  // 2x3 matrix
  3: { bits: 12, length: 2, padding: 0 },  // 3x4 matrix
  4: { bits: 20, length: 4, padding: 4 },  // 4x5 matrix (needs 4 padding bits)
  5: { bits: 30, length: 5, padding: 0 },  // 5x6 matrix
  6: { bits: 42, length: 7, padding: 0 },  // 6x7 matrix
  7: { bits: 56, length: 10, padding: 4 },  // 7x8 matrix (needs 4 padding bits)
  8: { bits: 72, length: 12, padding: 0 },  // 8x9 matrix
  9: { bits: 90, length: 15, padding: 0 },  // 9x10 matrix
  10: { bits: 110, length: 19, padding: 4 }, // 10x11 matrix (needs 4 padding bits)
  11: { bits: 132, length: 22, padding: 0 }, // 11x12 matrix
  12: { bits: 156, length: 26, padding: 0 }  // 12x13 matrix
};
/**
 * Pre-calculated mapping from Base64URL encoded string length (L)
 * back to the original matrix dimension n (where 2 <= n <= 12).
 * L = ceil(n * (n + 1) / 6)
 */
const length_to_n = {
  1: 2,   // n=2 -> 6 bits -> L=1
  2: 3,   // n=3 -> 12 bits -> L=2
  4: 4,   // n=4 -> 20 bits -> L=4
  5: 5,   // n=5 -> 30 bits -> L=5
  7: 6,   // n=6 -> 42 bits -> L=7
  10: 7,  // n=7 -> 56 bits -> L=10
  12: 8,  // n=8 -> 72 bits -> L=12
  15: 9,  // n=9 -> 90 bits -> L=15
  19: 10, // n=10 -> 110 bits -> L=19
  22: 11, // n=11 -> 132 bits -> L=22
  26: 12  // n=12 -> 156 bits -> L=26
};
/**
 * Encodes an n x (n+1) binary matrix (where 2 <= n <= 12)
 * into a compact Base64URL string.
 * @param {number[][]} matrix - The input matrix (e.g., [[1,0,1],[0,1,0]])
 * @returns {string} The Base64URL encoded string.
 * @throws {Error} if n is out of range [2, 12] or matrix dimensions are wrong.
 */
export function encodeAlgorithmMatrix(matrix) {
  if (!matrix || !matrix.length) {
    throw new Error("Invalid matrix input.");
  }
  const n = matrix.length;

  if (!(n >= 2 && n <= 12)) {
    throw new Error(`Matrix size n=${n} is out of the allowed range [2, 12].`);
  }
  if (!n_to_info[n]) {
    // This should not happen if the range check passes, but belt-and-suspenders
    throw new Error(`Internal error: No encoding info found for n=${n}.`);
  }
  const expectedCols = n + 1;
  if (!matrix.every(row => row && row.length === expectedCols)) {
    throw new Error(`Invalid matrix dimensions. Expected ${n}x${expectedCols}, check all rows.`);
  }
  if (!matrix.every(row => row.every(cell => cell === 0 || cell === 1))) {
    throw new Error(`Matrix must contain only 0s and 1s.`);
  }

  const info = n_to_info[n];
  const B = info.bits;
  const L = info.length;
  const padding_bits_count = info.padding;

  // 1. Flatten (row-major) and create bit string
  let bit_string = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < expectedCols; c++) {
      bit_string += matrix[r][c]; // Append '0' or '1'
    }
  }

  if (bit_string.length !== B) {
    throw new Error(`Internal error: Flattened bit string length ${bit_string.length} does not match expected ${B} for n=${n}.`);
  }

  // 2. Pad with trailing zeros
  const padded_bit_string = bit_string + '0'.repeat(padding_bits_count);

  if (padded_bit_string.length !== L * 6) {
    throw new Error(`Internal error: Padded bit string length ${padded_bit_string.length} does not match expected ${L * 6}.`);
  }

  // 3. Convert padded bit string to bytes (Uint8Array)
  const bytes = new Uint8Array(L * 6 / 8); // L*6 must be multiple of 8? NO. It's multiple of 6. Math.ceil(L*6/8)
  // const bytes = new Uint8Array(Math.ceil(L * 6 / 8)); // Correct number of bytes needed
  let byteIndex = 0;
  for (let i = 0; i < padded_bit_string.length; i += 8) {
    const chunk = padded_bit_string.substring(i, Math.min(i + 8, padded_bit_string.length));
    // Pad the last chunk if needed to make it 8 bits before parsing
    const paddedChunk = chunk.padEnd(8, '0');
    bytes[byteIndex++] = parseInt(paddedChunk, 2);
  }

  // Workaround for btoa needing a binary *string*
  let binaryString = '';
  bytes.forEach(byte => {
    binaryString += String.fromCharCode(byte);
  });

  // 4. Base64 Encode (standard)
  let base64String = btoa(binaryString);

  // 5. Convert to Base64URL
  base64String = base64String
    .replace(/\+/g, '-') // Replace + with -
    .replace(/\//g, '_') // Replace / with _
    .replace(/=/g, '');  // Remove padding '='

  // Final check
  if (base64String.length !== L) {
    console.warn(`Warning: Expected encoded length ${L} for n=${n}, but got ${base64String.length}. Review byte conversion/padding.`);
  }

  return base64String;
}

/**
 * Decodes a Base64URL string back into an n x (n+1) matrix.
 * @param {string} encodedString - The Base64URL encoded string.
 * @returns {{matrix: number[][], n: number}} An object containing the decoded matrix and its dimension n.
 * @throws {Error} if the encoded string length is invalid or decoding fails.
 */
export function decodeAlgorithmMatrix(encodedString) {
  if (typeof encodedString !== 'string' || encodedString.length === 0) {
    throw new Error("Invalid or empty encoded string input.");
  }

  const L = encodedString.length;
  const n = length_to_n[L];

  if (n === undefined) {
    throw new Error(`Invalid encoded string length: ${L}. No corresponding matrix size found.`);
  }

  const info = n_to_info[n];
  const B = info.bits; // Expected number of *original* bits

  // 1. Convert Base64URL back to standard Base64
  let base64String = encodedString
    .replace(/-/g, '+') // Replace - with +
    .replace(/_/g, '/'); // Replace _ with /

  // 2. Add standard Base64 padding '=' back
  const paddingRequired = (4 - (base64String.length % 4)) % 4;
  base64String += '='.repeat(paddingRequired);

  // 3. Base64 Decode (standard) -> results in a "binary string"
  let decodedBinaryString;
  try {
    decodedBinaryString = atob(base64String);
  } catch (e) {
    throw new Error(`Base64 decoding failed. Invalid input string. Original error: ${e.message}`);
  }

  // 4. Convert binary string to full bit string
  let full_bit_string = '';
  for (let i = 0; i < decodedBinaryString.length; i++) {
    const byteValue = decodedBinaryString.charCodeAt(i);
    full_bit_string += byteValue.toString(2).padStart(8, '0');
  }

  // 5. Trim to the expected number of bits after encoding (L*6)
  // This accounts for potential extra bits from the byte conversion if L*6 wasn't a multiple of 8
  const expectedTotalBits = L * 6;
  if (full_bit_string.length < expectedTotalBits) {
    // This might happen if atob truncates null bytes? Pad just in case.
    full_bit_string = full_bit_string.padEnd(expectedTotalBits, '0');
    // console.warn("Needed to pad decoded bit string");
  }
  full_bit_string = full_bit_string.substring(0, expectedTotalBits);


  // 6. Extract the original B data bits (remove padding 0s added during encoding)
  const original_bit_string = full_bit_string.substring(0, B);

  if (original_bit_string.length !== B) {
    throw new Error(`Internal error: Extracted bit length ${original_bit_string.length} does not match expected ${B} for n=${n}.`);
  }

  // 7. Reshape bits into the n x (n+1) matrix
  const matrix = [];
  let bitIndex = 0;
  const expectedCols = n + 1;
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < expectedCols; c++) {
      if (bitIndex >= original_bit_string.length) {
        throw new Error(`Internal error: Ran out of bits while reshaping matrix at row ${r}, col ${c}.`);
      }
      row.push(parseInt(original_bit_string[bitIndex], 10)); // Convert '0'/'1' char to number 0/1
      bitIndex++;
    }
    matrix.push(row);
  }

  return matrix;
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
    if (target.dataset.outputOp) {
      let internalIndex = parseInt(target.dataset.outputOp) - 1;
      dialToggleActive(internalIndex); // Toggle the dial state
    }

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
          dialSetActive(i);
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

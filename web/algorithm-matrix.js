/**
 * Generates the HTML structure for the algorithm matrix including an OUT column.
 * @param {number} numOperators - The number of operators.
 * @param {HTMLElement} container - The container element to populate.
 */
export function createAlgorithmMatrixUI(numOperators, container) {
    if (!container) {
        console.error("Algorithm Matrix: Container element not provided.");
        return;
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
        tableHtml += `<td data-output-op="${i}" class="output-cell">`;
        tableHtml += `<span class="connection-point output-point"></span>`;
        tableHtml += `</td>`;
        tableHtml += `</tr>`;
    }
    tableHtml += `
                </tbody>
            </table>`;

    // REMOVED Carrier Selectors Div

    // Add Hover Info display area
    tableHtml += `<div id="matrix-hover-info" class="matrix-info-box">Hover over a cell...</div>`;

    tableHtml += `</div>`; // Close algorithm-matrix

    container.innerHTML = tableHtml;
    console.log(`Algorithm Matrix UI created for ${numOperators} operators including OUT column.`);
}

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
 * @param {function(object): void} onUpdateCallback - Callback function receiving the combined matrix.
 */
export function setupMatrixEventListeners(container, onUpdateCallback) {
    if (!container || typeof onUpdateCallback !== 'function') {
        console.error("Algorithm Matrix: Invalid arguments for setupMatrixEventListeners.");
        return;
    }

    const hoverInfoBox = container.querySelector('#matrix-hover-info');
    const defaultHoverText = "Hover over a cell...";

    // --- Click Listener (Handles Connections, Feedback, and Output Cells) ---
    container.addEventListener('click', (event) => {
        const target = event.target.closest('td'); // Get the TD element clicked
        if (!target || !(target.dataset.modulator || target.dataset.outputOp)) return;

        let needsUpdate = false;
        target.classList.toggle('active');
        needsUpdate = true;

        if (needsUpdate) {
            const currentCombinedMatrix = getAlgorithmFromMatrix(container);
            if (currentCombinedMatrix) {
                 onUpdateCallback(currentCombinedMatrix); // Send the combined matrix only if valid
            } else {
                 console.warn("Matrix click occurred, but getAlgorithmFromMatrix returned nullish value. Update not sent.");
            }
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
    for (let i = 0; i < opCount; i++) {       // Iterate rows (modulator op / carrier op)
        if (!combinedMatrix[i]) continue;
        for (let j = 0; j < opCount + 1; j++) { // Iterate columns (modulated op or OUT column)
            if (combinedMatrix[i][j] === 1) {
                const modulatorNum = i + 1; // 1-based row index

                let cell;
                if (j < opCount) { // Connection or Feedback column
                    const modulatedNum = j + 1; // 1-based col index
                    if (i === j) { // Feedback (diagonal)
                        cell = container.querySelector(`td.feedback-cell[data-modulator="${modulatorNum}"]`);
                    } else { // Connection
                        cell = container.querySelector(`td[data-modulator="${modulatorNum}"][data-modulated="${modulatedNum}"]`);
                    }
                } else { // Carrier flag (j == opCount - the last column)
                    cell = container.querySelector(`td.output-cell[data-output-op="${modulatorNum}"]`);
                }

                if (cell) {
                    cell.classList.add('active');
                } else {
                    // console.warn(`Algorithm Matrix display: Could not find cell for matrix[${i}][${j}]`);
                }
            }
        }
    }
    console.log("Algorithm Matrix UI updated from combined matrix data (Carriers in Col).");
} 
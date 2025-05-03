use super::context::ProcessContext;
use super::envelope::EnvelopeGenerator;
use super::operator::OperatorState;
use crate::synth::prelude::{HashMap, HashSet};

// --- Internal Node ---

#[derive(Debug, Clone)]
struct UnrolledNode {
    original_op_index: usize,
    input_node_indices: Vec<usize>,
}

#[derive(Debug, Clone)]
pub struct FeedbackLoop {
    from_node: usize, // Node index (end)
    to_node: usize,   // Node index (start)
    count: usize,     // How many times to repeat
}

#[derive(Debug, Clone)]
pub struct ConnectionParams {
    pub modulation_envelope: Option<EnvelopeGenerator>,
    pub scale: f32,
}
impl Default for ConnectionParams {
    fn default() -> Self {
        Self {
            // TODO: test that this is actually working
            modulation_envelope: None,
            scale: 1.0,
        }
    }
}

// --- Algorithm ---

pub struct Algorithm {
    matrix: Vec<Vec<Option<ConnectionParams>>>, // Adjacency matrix
    carriers: Vec<usize>,                       // Carrier operator indices
    repeat_rules: Vec<FeedbackLoop>,            // Repeat rules for feedback loops
    unrolled_nodes: Vec<UnrolledNode>,          // Unrolled graph structure
}

impl Algorithm {
    pub fn new(
        matrix: Vec<Vec<Option<ConnectionParams>>>,
        carriers: Vec<usize>,
    ) -> Result<Self, String> {
        let num_ops = matrix.len();
        if num_ops > 0 && !matrix.iter().all(|row| row.len() == num_ops) {
            return Err("Adjacency matrix must be square.".to_string());
        }
        if let Some(&max_carrier) = carriers.iter().max() {
            if max_carrier >= num_ops {
                return Err(format!(
                    "Carrier index {} out of bounds for {} operators.",
                    max_carrier, num_ops
                ));
            }
        }

        let mut algo = Self {
            matrix,
            carriers,
            repeat_rules: Vec::new(),
            unrolled_nodes: Vec::new(),
        };
        algo.rebuild_unrolled_graph();
        Ok(algo)
    }
    pub fn get_carrier_indices(&self) -> &Vec<usize> {
        &self.carriers
    }
    pub fn get_modulator_indices(&self, operator_index: usize) -> Vec<usize> {
        let mut modulator_indices = Vec::new();
        for (i, row) in self.matrix.iter().enumerate() {
            if i != operator_index && row[operator_index].is_some() {
                modulator_indices.push(i);
            }
        }
        modulator_indices
    }
    pub fn add_repeat_rule(&mut self, from_node: usize, to_node: usize, count: usize) {
        self.repeat_rules.push(FeedbackLoop {
            from_node,
            to_node,
            count,
        });
        self.rebuild_unrolled_graph();
    }
    pub fn finished(&self, nodes: &[OperatorState]) -> bool {
        self.carriers.iter().all(|&carrier| nodes[carrier].finished)
    }
    /// Expects `combined_matrix_from_ui` where:
    /// - `[source_index][target_index]` (for `target_index < ui_op_count`) indicates
    ///   if Source operator modulates Target operator (value >= 1 means connected).
    /// - `[source_index][ui_op_count]` indicates if Source operator is a carrier/output
    ///   (value >= 1 means it is).
    pub fn set_matrix(&mut self, combined_matrix_from_ui: &[Vec<u32>]) -> Result<(), String> {
        let ui_op_count = combined_matrix_from_ui.len();
        let synth_op_count = self.matrix.len();

        if ui_op_count == 0 {
            return Ok(());
        }

        // --- Determine New Carriers from UI Matrix *before* modifying state ---
        let mut new_carriers: Vec<usize> = Vec::new();
        for i in 0..ui_op_count {
            // Bounds check UI matrix's last column
            if i >= combined_matrix_from_ui.len() || ui_op_count >= combined_matrix_from_ui[i].len()
            {
                continue;
            }

            if combined_matrix_from_ui[i][ui_op_count] >= 1 {
                // Check the last column
                new_carriers.push(i);
            }
        }

        // --- Update Internal Connection Matrix ---
        // ... (existing logic to update self.matrix based on UI matrix and zero out others) ...
        for i in 0..synth_op_count {
            for j in 0..synth_op_count {
                if i >= self.matrix.len() || j >= self.matrix[i].len() {
                    continue;
                }
                if i < ui_op_count && j < ui_op_count {
                    if combined_matrix_from_ui[i][j] >= 1 {
                        if self.matrix[i][j].is_none() {
                            self.matrix[i][j] = Some(ConnectionParams::default());
                        }
                    } else {
                        self.matrix[i][j] = None;
                    }
                } else {
                    self.matrix[i][j] = None;
                }
            }
        }

        // --- Set Carriers (already calculated and validated non-empty) ---
        new_carriers.sort_unstable(); // Sort is still good practice
        new_carriers.dedup();
        self.carriers = new_carriers;

        // --- Clear Old Feedback Rules ---
        self.repeat_rules.clear();

        // --- Call the helper function to rebuild the graph ---
        // This only runs if the carrier check passed
        self.rebuild_unrolled_graph();

        Ok(())
    }
    pub fn get_matrix(&self) -> &Vec<Vec<Option<ConnectionParams>>> {
        &self.matrix
    }
    pub fn set_connection(
        &mut self,
        from_operator: usize,
        to_operator: usize,
        params: ConnectionParams,
    ) -> Result<(), String> {
        if from_operator >= self.matrix.len() || to_operator >= self.matrix.len() {
            return Err("Operator index out of bounds.".to_string());
        }
        self.matrix[from_operator][to_operator] = Some(params);
        self.rebuild_unrolled_graph();
        Ok(())
    }
    pub fn length(&self) -> usize {
        self.unrolled_nodes.len()
    }

    fn rebuild_unrolled_graph(&mut self) {
        let build_result =
            Self::build_unrolled_graph(&self.matrix, &self.carriers, &self.repeat_rules);

        match build_result {
            Ok(nodes) => {
                self.unrolled_nodes = nodes; // Assign the new nodes
            }
            Err(e) => {
                // Log error both ways for visibility
                eprintln!("Error building unrolled graph: {}", e);
                self.unrolled_nodes.clear(); // Clear nodes on error to prevent panic later
            }
        }
    }

    pub fn default_stack_2(num_operators: usize) -> Result<Self, String> {
        if num_operators < 2 {
            return Self::default_simple(num_operators);
        }
        let mut matrix = vec![vec![None; num_operators]; num_operators];
        matrix[1][0] = Some(ConnectionParams::default());
        Self::new(matrix, vec![0])
    }
    pub fn default_fanout_feedback(num_operators: usize) -> Result<Self, String> {
        if num_operators < 4 {
            return Self::default_simple(num_operators);
        }
        let mut matrix = vec![vec![None; num_operators]; num_operators];
        matrix[3][0] = Some(ConnectionParams::default()); // Mod → A
        matrix[3][1] = Some(ConnectionParams::default()); // Mod → B
        matrix[2][1] = Some(ConnectionParams::default()); // Extra mod → B
        let mut algo = Self::new(matrix, vec![0, 1])?;
        algo.add_repeat_rule(3, 3, 1);
        Ok(algo)
    }
    pub fn default_dual_stack(num_operators: usize) -> Result<Self, String> {
        if num_operators < 4 {
            return Self::default_simple(num_operators);
        }
        let mut matrix = vec![vec![None; num_operators]; num_operators];
        matrix[2][0] = Some(ConnectionParams::default()); // Modulator A -> Carrier A
        matrix[3][1] = Some(ConnectionParams::default()); // Modulator B -> Carrier B
        Self::new(matrix, vec![0, 1])
    }
    pub fn default_fanout(num_operators: usize) -> Result<Self, String> {
        if num_operators < 3 {
            return Self::default_simple(num_operators);
        }
        let mut matrix = vec![vec![None; num_operators]; num_operators];
        matrix[2][0] = Some(ConnectionParams::default());
        matrix[2][1] = Some(ConnectionParams::default());
        Self::new(matrix, vec![0, 1])
    }
    pub fn stack_3_feedback(num_operators: usize) -> Result<Self, String> {
        if num_operators < 3 {
            return Self::default_simple(num_operators);
        }
        let mut matrix = vec![vec![None; num_operators]; num_operators];
        matrix[0][1] = Some(ConnectionParams::default()); // A → B
        matrix[1][2] = Some(ConnectionParams::default()); // B → C

        let carriers = vec![2]; // Output is C
        let mut algo = Self::new(matrix, carriers)?;

        // Add a repeat rule to structurally duplicate B → C chain once after C
        // Resulting chain: A → B → C → A → B → C
        algo.add_repeat_rule(2, 1, 1); // from C (2), back to B (1), repeat 1 time

        Ok(algo)
    }

    pub fn default_simple(num_operators: usize) -> Result<Self, String> {
        let matrix = vec![vec![None; num_operators]; num_operators];
        let carriers = if num_operators > 0 { vec![0] } else { vec![] };
        Self::new(matrix, carriers)
    }

    pub fn default_feedback_1(num_operators: usize) -> Result<Self, String> {
        if num_operators < 1 {
            return Self::default_simple(num_operators);
        }
        let matrix = vec![vec![None; num_operators]; num_operators];
        // TODO: check if this is correct. When I added Repeat Rules did I remove the matrix > 1 -> feedback?
        let mut alg = Self::new(matrix, vec![0])?;
        alg.add_repeat_rule(0, 0, 1);
        Ok(alg)
    }

    pub fn process(
        &self,
        context: &ProcessContext,
        node_states: &mut [OperatorState],
        output: &mut [f32],
    ) {
        let buffer_size = output.len();
        if buffer_size == 0
            || context.operators.is_empty()
            || self.matrix.len() != context.operators.len()
            || self.unrolled_nodes.is_empty()
            || node_states.len() != self.unrolled_nodes.len()
        {
            return;
        }

        // --- Scratch Buffers for Operator Outputs ---
        let mut scratch_buffers: Vec<Vec<f32>> = self
            .unrolled_nodes
            .iter()
            .map(|_| vec![0.0; buffer_size])
            .collect();

        // --- Visited flags to prevent reprocessing nodes in this buffer ---
        // If the graph has cycles after unrolling (shouldn't happen?) or diamonds,
        // we only want to process each node_idx once.
        let mut visited = vec![false; self.unrolled_nodes.len()];

        // --- Evaluate Graph - Ensure correct order by iterating ---
        // Evaluate ALL nodes first to ensure dependencies are met before summing carriers.
        for node_idx in 0..self.unrolled_nodes.len() {
            self.evaluate_node_recursive(
                context,
                node_idx,
                node_states,
                &mut scratch_buffers,
                &mut visited, // Pass visited flags
            );
        }

        // --- Sum Carrier Outputs ---
        output.fill(0.0);
        for &carrier_op_original_idx in &self.carriers {
            for (node_idx, node) in self.unrolled_nodes.iter().enumerate() {
                if node.original_op_index == carrier_op_original_idx {
                    let carrier_output = &scratch_buffers[node_idx];
                    for i in 0..buffer_size {
                        output[i] += carrier_output[i];
                    }
                    break;
                }
            }
        }
    }

    // Renamed to avoid confusion with the previous evaluate_node structure
    fn evaluate_node_recursive(
        &self,
        context: &ProcessContext,
        node_idx: usize,
        node_states: &mut [OperatorState],
        scratch_buffers: &mut [Vec<f32>],
        visited: &mut [bool], // Track visited nodes for this buffer evaluation
    ) {
        // If node already processed in this buffer call, skip.
        if visited[node_idx] {
            return;
        }

        let node = &self.unrolled_nodes[node_idx];
        let buffer_size = scratch_buffers[node_idx].len();

        // --- Ensure Inputs are Evaluated First ---
        let mut modulation_input = vec![0.0; buffer_size];
        for &input_idx in &node.input_node_indices {
            // Recursively evaluate the input node
            self.evaluate_node_recursive(
                context,
                input_idx, // Evaluate the input index
                node_states,
                scratch_buffers,
                visited,
            );

            // --- Combine Input Contributions ---
            // (Keep the modulation combining logic from previous attempts, using connection params)
            let input_output = &scratch_buffers[input_idx]; // Output of the input node
            let source_op_original_idx = self.unrolled_nodes[input_idx].original_op_index;
            let target_op_original_idx = node.original_op_index;

            if let Some(Some(conn)) = self
                .matrix
                .get(source_op_original_idx)
                .and_then(|row| row.get(target_op_original_idx))
            {
                let scale = conn.scale;
                for i in 0..buffer_size {
                    let time_on = (context.samples_elapsed_since_trigger + i as u64) as f32
                        / context.sample_rate;
                    let time_off = context
                        .note_off_sample_index
                        .map(|n| (n + i as u64) as f32 / context.sample_rate);
                    let env_value = conn
                        .modulation_envelope
                        .as_ref()
                        .map(|e| e.evaluate(time_on, time_off))
                        .unwrap_or(1.0);
                    modulation_input[i] += input_output[i] * scale * env_value;
                }
            }
            // Decide how to handle cases where connection isn't in matrix (e.g., implied by feedback unrolling)
            // If unrolling implies connection, modulation should likely still happen.
            // Maybe default to scale=1.0 if matrix doesn't specify? Or ensure matrix reflects all connections?
            // For now, assume matrix covers intended connections.
        }

        // --- Process Current Node ---
        let output_for_this_node = &mut scratch_buffers[node_idx];
        let operator = &context.operators[node.original_op_index];
        // Use the unique temporary state for this specific node instance
        let state_for_this_node = &mut node_states[node_idx];

        operator.process(
            context,
            &modulation_input,
            state_for_this_node,
            output_for_this_node,
        );

        // Mark this node as processed for this buffer evaluation
        visited[node_idx] = true;
    }

    // --- NEW HELPER FUNCTION ---
    /// Recursively builds the unrolled graph structure starting from a target operator.
    /// Tracks the visited path to prevent cycles deeper than MAX_CYCLE_DEPTH.
    /// Creates new nodes even if the operator index has been seen before (up to the depth limit).
    /// Returns Ok(Some(node_idx)) on success, Ok(None) if depth limit reached, Err on true error.
    fn build_node_recursive(
        matrix: &[Vec<Option<ConnectionParams>>],
        target_op_idx: usize,
        nodes: &mut Vec<UnrolledNode>,
        visited_path: &mut Vec<usize>, // Tracks op indices in the current recursion path
    ) -> Result<Option<usize>, String> {
        const MAX_CYCLE_DEPTH: usize = 2; // Define the cycle limit

        // Check for cycles based on depth limit
        let cycle_count = visited_path
            .iter()
            .filter(|&&op| op == target_op_idx)
            .count();
        if cycle_count >= MAX_CYCLE_DEPTH {
            // Reached limit, stop recursion for this path, but it's not an error
            return Ok(None);
        }

        // Bounds check
        if target_op_idx >= matrix.len() {
            // This is a real error
            return Err(format!("Operator index {} out of bounds.", target_op_idx));
        }

        // Mark current node as visited for this path *before* recursive calls
        visited_path.push(target_op_idx);

        // Create new node *unconditionally* (no reuse based on op_idx via a map)
        let current_node_idx = nodes.len();
        nodes.push(UnrolledNode {
            original_op_index: target_op_idx,
            input_node_indices: Vec::new(), // Inputs added after recursive calls
        });

        // Recursively create all input nodes
        let mut input_indices = Vec::new();
        // Iterate through potential sources (columns) for the target operator (row)
        for source_idx in 0..matrix.len() {
            // Check the connection from source_idx to target_op_idx
            if matrix[source_idx][target_op_idx].is_some() {
                // Recursively build the input node
                match Self::build_node_recursive(matrix, source_idx, nodes, visited_path) {
                    Ok(Some(input_node_idx)) => {
                        // Successfully created input node
                        input_indices.push(input_node_idx);
                    }
                    Ok(None) => {
                        // Recursion stopped due to depth limit down this path,
                        // so no input node index to add from this branch.
                    }
                    Err(e) => {
                        // Propagate real errors up the chain
                        // Pop current node before returning Err to keep visited_path consistent
                        visited_path.pop();
                        return Err(e);
                    }
                }
            }
        }

        // Assign inputs to the newly created node
        nodes[current_node_idx].input_node_indices = input_indices;

        // Pop current node from visited path *after* processing inputs and returning from this call
        visited_path.pop();

        Ok(Some(current_node_idx))
    }

    // --- UPDATED BUILD FUNCTION ---
    fn build_unrolled_graph(
        matrix: &[Vec<Option<ConnectionParams>>],
        carriers: &[usize],
        feedback_loops: &[FeedbackLoop],
    ) -> Result<Vec<UnrolledNode>, String> {
        let mut nodes = Vec::new();
        // Keep track of the top-level nodes created for each carrier index
        // to avoid adding the same carrier multiple times if listed multiple times.
        // This doesn't prevent subgraph duplication if carriers share inputs.
        let mut root_node_indices = HashMap::new(); // Map<original_op_index, node_index>

        // --- Step 1: Build base graph by traversing from carriers using new recursive function ---
        for &op_idx in carriers {
            if !root_node_indices.contains_key(&op_idx) {
                let mut visited_path = Vec::new(); // Fresh path for each carrier root
                                                   // Use the new recursive builder
                match Self::build_node_recursive(matrix, op_idx, &mut nodes, &mut visited_path) {
                    Ok(Some(root_node_idx)) => {
                        root_node_indices.insert(op_idx, root_node_idx);
                    }
                    Ok(None) => {
                        // Hitting the depth limit immediately for a carrier.
                        // This could happen if MAX_CYCLE_DEPTH <= 1 and the carrier feeds itself.
                        // Log a warning but don't treat as error - might result in empty path for this carrier.
                        eprintln!(
                            "Warning: Build for carrier {} stopped immediately due to cycle depth limit. No nodes generated for this root.",
                             op_idx
                        );
                    }
                    Err(e) => {
                        // If any carrier encounters a real error, the whole graph build fails.
                        return Err(format!(
                            "Failed building graph from carrier {}: {}",
                            op_idx, e
                        ));
                    }
                }
            }
        }

        // --- Step 2: Apply FeedbackLoops ---
        // NOTE: This logic operates on the graph *after* initial cycle unrolling.
        // Indices in feedback_loops refer to indices in the 'nodes' vec *before* feedback is applied.
        let initial_nodes = nodes.clone(); // State before applying feedback
                                           // Maps original node indices (from initial_nodes) to their *current* index in the 'nodes' vec,
                                           // updating as duplication occurs.
        let mut node_index_mapping = (0..initial_nodes.len())
            .map(|i| (i, i))
            .collect::<HashMap<_, _>>();

        for loop_rule in feedback_loops {
            // Validate node indices against the size of the graph *before* feedback application
            if loop_rule.from_node >= initial_nodes.len()
                || loop_rule.to_node >= initial_nodes.len()
            {
                eprintln!(
                    "Warning: Feedback loop rule {:?} references node indices out of bounds (initial graph size {}). Skipping rule.",
                    loop_rule, initial_nodes.len()
                );
                continue;
            }

            for i in 0..loop_rule.count {
                // Find the *current* node index for from_node (where the input will be added)
                let target_node_idx_for_input = match node_index_mapping.get(&loop_rule.from_node) {
                    Some(&idx) => idx,
                    None => {
                        eprintln!("Warning: Could not map 'from_node' {} to current index for feedback loop {:?} iteration {}. Skipping iteration.", loop_rule.from_node, loop_rule, i);
                        continue; // Should not happen if initial validation passes, but for safety
                    }
                };

                // --- Duplicate subgraph starting from original 'to_node' index ---
                let mut duplication_mapping = HashMap::new(); // original_idx -> new_idx for this duplication pass
                let mut duplication_stack = vec![loop_rule.to_node]; // Stack holds *original* indices to duplicate
                let mut visited_duplication = HashSet::new(); // Track nodes visited *during this duplication pass* to prevent infinite loops in cyclic subgraphs

                // Phase 1: Create duplicated nodes
                while let Some(original_idx) = duplication_stack.pop() {
                    // Check bounds against initial_nodes and if already visited in this duplication pass
                    if original_idx >= initial_nodes.len()
                        || !visited_duplication.insert(original_idx)
                    {
                        continue;
                    }

                    let node_to_copy = &initial_nodes[original_idx];
                    let new_node_idx = nodes.len(); // Index for the new node
                    nodes.push(UnrolledNode {
                        original_op_index: node_to_copy.original_op_index,
                        input_node_indices: Vec::new(), // Links added in Phase 2
                    });
                    duplication_mapping.insert(original_idx, new_node_idx);

                    // Add inputs (original indices) to the stack to be duplicated
                    for &input_original_idx in &node_to_copy.input_node_indices {
                        // Only push if not already visited in this pass
                        if !visited_duplication.contains(&input_original_idx) {
                            duplication_stack.push(input_original_idx);
                        }
                    }
                }

                // Phase 2: Link inputs within the duplicated subgraph
                for (&original_idx, &new_idx) in &duplication_mapping {
                    if original_idx >= initial_nodes.len() || new_idx >= nodes.len() {
                        continue;
                    } // Bounds check

                    let original_node = &initial_nodes[original_idx];
                    let mut new_inputs = Vec::new();
                    for &input_original_idx in &original_node.input_node_indices {
                        // Try to find the duplicated counterpart of the input
                        if let Some(&mapped_input_idx) =
                            duplication_mapping.get(&input_original_idx)
                        {
                            new_inputs.push(mapped_input_idx);
                        } else {
                            // Input refers to a node outside the duplicated segment.
                            // Link to its *current* index using node_index_mapping.
                            if let Some(&current_external_input_idx) =
                                node_index_mapping.get(&input_original_idx)
                            {
                                if current_external_input_idx < nodes.len() {
                                    // Check if mapped target exists
                                    new_inputs.push(current_external_input_idx);
                                } else {
                                    eprintln!("Warning: Mapped external input index {} for original input {} is out of bounds (nodes len {}). Input skipped for duplicated node {}.", current_external_input_idx, input_original_idx, nodes.len(), new_idx);
                                }
                            } else {
                                eprintln!("Warning: Could not map external input {} (from original node {}) for duplicated node {}. Input skipped.", input_original_idx, original_idx, new_idx);
                            }
                        }
                    }
                    nodes[new_idx].input_node_indices = new_inputs;
                }

                // Phase 3: Connect the target node (current version of from_node) to the root of the duplicated chain
                if let Some(&duplicated_chain_root_idx) =
                    duplication_mapping.get(&loop_rule.to_node)
                {
                    if target_node_idx_for_input < nodes.len() {
                        // Bounds check target
                        nodes[target_node_idx_for_input]
                            .input_node_indices
                            .push(duplicated_chain_root_idx);
                    } else {
                        eprintln!("Error: target_node_idx_for_input {} is out of bounds (nodes len {}) during feedback connection. Connection skipped.", target_node_idx_for_input, nodes.len());
                    }
                } else {
                    eprintln!("Warning: Root of duplicated chain (original index {}) not found for feedback rule {:?} iter {}. Connection skipped.", loop_rule.to_node, loop_rule, i);
                }

                // --- Update node_index_mapping for the next iteration/rule ---
                // Nodes that were duplicated now map to their newest copies.
                for (original_idx, new_idx) in duplication_mapping {
                    node_index_mapping.insert(original_idx, new_idx);
                }
            }
        }

        Ok(nodes)
    }

    pub fn print_structure(&self) {
        println!("Algorithm Structure:");
        for (i, node) in self.unrolled_nodes.iter().enumerate() {
            print!("  Node {} → Operator {}", i, node.original_op_index);
            if !node.input_node_indices.is_empty() {
                print!(" | Inputs: ");
                for &input in &node.input_node_indices {
                    print!("Node {} ", input);
                }
            }
            println!();
        }

        print!("Carriers: ");
        for &c in &self.carriers {
            print!("Operator {} ", c);
        }
        println!();

        if !self.repeat_rules.is_empty() {
            println!("Repeat Rules:");
            for rule in &self.repeat_rules {
                let from_op = self.unrolled_nodes[rule.from_node].original_op_index;
                let to_op = self.unrolled_nodes[rule.to_node].original_op_index;
                println!(
                    "  Repeat (Operator {} → Operator {}) × {}",
                    from_op, to_op, rule.count
                );
            }
        }
        println!();
    }

    pub fn print_evaluation_chains(&self) {
        println!("Evaluation Chains:");
        for &carrier_op in &self.carriers {
            println!("Carrier Operator {}:", carrier_op);

            for (i, node) in self.unrolled_nodes.iter().enumerate() {
                if node.original_op_index == carrier_op {
                    let mut chain = Vec::new();
                    self.collect_chain(i, &mut chain);
                }
            }
        }
    }

    fn collect_chain(&self, node_idx: usize, current_chain: &mut Vec<usize>) {
        current_chain.push(self.unrolled_nodes[node_idx].original_op_index);

        let inputs = &self.unrolled_nodes[node_idx].input_node_indices;
        if inputs.is_empty() {
            // Leaf reached → print chain
            let chain_str = current_chain
                .iter()
                .map(|op| format!("Operator {}", op))
                .collect::<Vec<_>>()
                .join(" ← ");
            println!("  {}", chain_str);
        } else {
            for &input_idx in inputs {
                let mut next_chain = current_chain.clone();
                self.collect_chain(input_idx, &mut next_chain);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_self_feedback() {
        println!("\n--- Running test_simple_self_feedback (in-module) ---");
        let num_ops = 1;
        let mut algorithm =
            Algorithm::default_simple(num_ops).expect("Failed to create simple algorithm");

        println!("Initial Structure (1 op, no connections):");
        algorithm.print_structure();

        let ui_matrix: Vec<Vec<u32>> = vec![
            // Mod Targets-> 0   OUT
            /* From Op 0 */ vec![1, 1],
        ];

        println!("\nCalling set_matrix with self-feedback [1, 1]...");
        match algorithm.set_matrix(&ui_matrix) {
            Ok(_) => println!("set_matrix call succeeded."),
            Err(e) => {
                println!("set_matrix call failed: {}", e);
                panic!("set_matrix failed unexpectedly: {}", e);
            }
        }

        println!("\nStructure after set_matrix (Self-Feedback):");
        algorithm.print_structure();

        let unrolled_nodes = &algorithm.unrolled_nodes; // Direct access ok!
        assert_eq!(
            unrolled_nodes.len(),
            2,
            "Expected 2 unrolled nodes for A->A feedback (depth limit 2)"
        );

        if unrolled_nodes.len() == 2 {
            // Check Node 0
            assert_eq!(
                unrolled_nodes[0].original_op_index, 0,
                "Node 0 should be Operator 0"
            );
            assert_eq!(
                unrolled_nodes[0].input_node_indices,
                vec![1],
                "Node 0 should have Node 1 as input"
            );

            // Check Node 1
            assert_eq!(
                unrolled_nodes[1].original_op_index, 0,
                "Node 1 should be Operator 0"
            );
            assert!(
                unrolled_nodes[1].input_node_indices.is_empty(),
                "Node 1 should have no inputs (end of feedback unroll)"
            );
        } else {
            // If the length check failed, provide more info if possible
            panic!("Node count assertion failed, cannot check node details.");
        }

        assert_eq!(algorithm.carriers, vec![0], "Carrier should still be Op 0"); // Direct access ok!
        assert!(
            algorithm.repeat_rules.is_empty(),
            "set_matrix should clear repeat rules"
        ); // Direct access ok!

        println!("--- Test Finished: test_simple_self_feedback (in-module) ---");
    }
}

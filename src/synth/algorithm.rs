use super::envelope::EnvelopeGenerator;
use super::operator::OperatorState;
use super::context::ProcessContext;
use crate::synth::prelude::HashMap;

// --- Internal Node ---

#[derive(Debug)]
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

    pub fn add_repeat_rule(&mut self, from_node: usize, to_node: usize, count: usize) {
        self.repeat_rules.push(FeedbackLoop {
            from_node,
            to_node,
            count,
        });
        self.rebuild_unrolled_graph();
    }
    /// Sets the algorithm structure based on a combined matrix from the UI,
    /// defining connections/carriers for the first `ui_op_count` operators
    /// and clearing connections/carriers/feedback rules for all operators >= `ui_op_count`.
    /// Matrix format: `ui_op_count x (ui_op_count + 1)`, where the last column indicates carriers.
    /// Expects input matrix values to be 0 or 1.
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
            if i >= combined_matrix_from_ui.len() || ui_op_count >= combined_matrix_from_ui[i].len() { continue; }

            if combined_matrix_from_ui[i][ui_op_count] >= 1 { // Check the last column
                new_carriers.push(i);
            }
        }

        // --- *** ADD CHECK FOR NO CARRIERS *** ---
        if new_carriers.is_empty() {
            let warning_msg = "Algorithm update ignored: The provided matrix configuration results in no carrier operators.";
            // Log the warning to both terminals if possible
            eprintln!("Warning: {}", warning_msg);
            // Return Ok(()) to indicate the operation completed without error,
            // even though no change was made.
            return Ok(());
        }
        // --- *** END CHECK *** ---


        // --- If carriers exist, proceed with updating the algorithm state ---

        // --- Update Internal Connection Matrix ---
        // ... (existing logic to update self.matrix based on UI matrix and zero out others) ...
        for i in 0..synth_op_count {
            for j in 0..synth_op_count {
                 if i >= self.matrix.len() || j >= self.matrix[i].len() { continue; }
                if i < ui_op_count && j < ui_op_count {
                    if combined_matrix_from_ui[i][j] >= 1 {
                        if self.matrix[i][j].is_none() { self.matrix[i][j] = Some(ConnectionParams::default()); }
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

        // --- Add New Feedback Rules based on UI matrix diagonal ---
        for i in 0..ui_op_count {
             if i < combined_matrix_from_ui.len() && i < combined_matrix_from_ui[i].len() {
                 if combined_matrix_from_ui[i][i] >= 1 {
                     self.repeat_rules.push(FeedbackLoop { from_node: i, to_node: i, count: 1 });
                 }
             }
        }


        // --- Call the helper function to rebuild the graph ---
        // This only runs if the carrier check passed
        self.rebuild_unrolled_graph();

        Ok(())
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
        self.matrix[to_operator][from_operator] = Some(params);
        self.rebuild_unrolled_graph();
        Ok(())
    }
    pub fn length(&self) -> usize {
        self.unrolled_nodes.len()
    }

    fn rebuild_unrolled_graph(&mut self) {
        let build_result = Self::build_unrolled_graph(
            &self.matrix,
            &self.carriers,
            &self.repeat_rules
        );

        match build_result {
            Ok(nodes) => {
                self.unrolled_nodes = nodes; // Assign the new nodes
            },
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
        matrix[0][1] = Some(ConnectionParams::default());
        Self::new(matrix, vec![0])
    }
    pub fn default_fanout_feedback(num_operators: usize) -> Result<Self, String> {
        if num_operators < 4 {
            return Self::default_simple(num_operators);
        }
        let mut matrix = vec![vec![None; num_operators]; num_operators];
        matrix[0][3] = Some(ConnectionParams::default()); // Mod → A
        matrix[1][3] = Some(ConnectionParams::default()); // Mod → B
        matrix[1][2] = Some(ConnectionParams::default()); // Extra mod → B
        let mut algo = Self::new(matrix, vec![0, 1])?;
        algo.add_repeat_rule(3, 3, 1);
        Ok(algo)
    }
    pub fn default_dual_stack(num_operators: usize) -> Result<Self, String> {
        if num_operators < 4 {
            return Self::default_simple(num_operators);
        }
        let mut matrix = vec![vec![None; num_operators]; num_operators];
        matrix[0][2] = Some(ConnectionParams::default()); // Modulator A -> Carrier A
        matrix[1][3] = Some(ConnectionParams::default()); // Modulator B -> Carrier B
        Self::new(matrix, vec![0, 1])
    }
    pub fn default_fanout(num_operators: usize) -> Result<Self, String> {
        if num_operators < 3 {
            return Self::default_simple(num_operators);
        }
        let mut matrix = vec![vec![None; num_operators]; num_operators];
        matrix[0][2] = Some(ConnectionParams::default());
        matrix[1][2] = Some(ConnectionParams::default());
        Self::new(matrix, vec![0, 1])
    }
    pub fn stack_3_feedback(num_operators: usize) -> Result<Self, String> {
        if num_operators < 3 {
            return Self::default_simple(num_operators);
        }
        let mut matrix = vec![vec![None; num_operators]; num_operators];
        matrix[1][0] = Some(ConnectionParams::default()); // A → B
        matrix[2][1] = Some(ConnectionParams::default()); // B → C

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
                &mut visited,               // Pass visited flags
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
                .get(target_op_original_idx)
                .and_then(|row| row.get(source_op_original_idx))
            {
                let scale = conn.scale;
                for i in 0..buffer_size {
                    let time_on = (context.samples_elapsed_since_trigger + i as u64) as f32 / context.sample_rate;
                    let time_off =
                        context.note_off_sample_index.map(|n| (n + i as u64) as f32 / context.sample_rate);
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

    fn build_unrolled_graph(
        matrix: &[Vec<Option<ConnectionParams>>],
        carriers: &[usize],
        feedback_loops: &[FeedbackLoop],
    ) -> Result<Vec<UnrolledNode>, String> {
        let mut nodes = Vec::new();
        let mut created_nodes = HashMap::new();

        // --- Step 1: Build base graph (DAG) from matrix ---
        for &op_idx in carriers {
            Self::get_or_create_node(
                matrix,
                op_idx,
                &mut nodes,
                &mut created_nodes,
                &mut Vec::new(), // visited stack
            )?;
        }

        // --- Step 2: Apply FeedbackLoops (repeat structural chains) ---
        for loop_rule in feedback_loops {
            for _ in 0..loop_rule.count {
                let mut mapping = HashMap::new();
                let start = loop_rule.to_node;
                let end = loop_rule.from_node;
                let mut stack = vec![start];

                // --- 2a: Copy chain from to_node back to from_node ---
                while let Some(current) = stack.pop() {
                    if mapping.contains_key(&current) {
                        continue; // Already duplicated
                    }
                    let current_idx = nodes.len();
                    mapping.insert(current, current_idx);

                    let inputs = &nodes[current].input_node_indices;
                    for &input in inputs {
                        stack.push(input);
                    }

                    nodes.push(UnrolledNode {
                        original_op_index: nodes[current].original_op_index,
                        input_node_indices: Vec::new(), // filled next
                    });
                }

                // --- 2b: Link duplicated chain inputs ---
                for (&old_idx, &new_idx) in &mapping {
                    let inputs = &nodes[old_idx].input_node_indices;
                    let new_inputs: Vec<usize> = inputs.iter().map(|i| mapping[i]).collect();
                    nodes[new_idx].input_node_indices = new_inputs;
                }

                // --- 2c: Connect end node to start of duplicated chain ---
                nodes[end].input_node_indices.push(mapping[&start]);
            }
        }

        Ok(nodes)
    }

    // --- get_or_create_node: Ignore diagonal elements ---
    fn get_or_create_node(
        matrix: &[Vec<Option<ConnectionParams>>],
        target_op_idx: usize,
        nodes: &mut Vec<UnrolledNode>,
        created_nodes: &mut HashMap<usize, usize>,
        visited: &mut Vec<usize>, // Tracks visited nodes *within this specific build path*
    ) -> Result<usize, String> {
        // --- Check for cycles *excluding* self-reference ---
        if visited.contains(&target_op_idx) {
             // If target is already in visited, it means we have A->B->...->A cycle
            return Err(format!(
                "Cycle detected in modulation graph involving Operator {}. Path: {:?}",
                target_op_idx, visited
            ));
        }

        // If node was already created, return its index
        if let Some(&idx) = created_nodes.get(&target_op_idx) {
            return Ok(idx);
        }

        // Bounds check
        if target_op_idx >= matrix.len() {
            return Err(format!("Operator index {} out of bounds.", target_op_idx));
        }

        // Mark current node as visited for this path
        visited.push(target_op_idx);

        // Create new node
        let current_idx = nodes.len();
        nodes.push(UnrolledNode {
            original_op_index: target_op_idx,
            input_node_indices: Vec::new(),
        });
        created_nodes.insert(target_op_idx, current_idx);

        // Recursively create all input nodes
        let mut input_indices = Vec::new();
        // Iterate through the row corresponding to the target_op_idx
        for source_idx in 0..matrix.len() {
            // Skip if source is the same as target (ignore diagonal/self-reference)
            if source_idx == target_op_idx {
                continue;
            }

            // Check the connection from source_idx (column) to target_op_idx (row)
            if matrix[target_op_idx][source_idx].is_some() {
                let input_idx =
                    Self::get_or_create_node(matrix, source_idx, nodes, created_nodes, visited)?;
                input_indices.push(input_idx);
            }
        }

        // Assign inputs to current node
        nodes[current_idx].input_node_indices = input_indices;

        // Pop visited stack *after* processing all inputs for this node
        visited.pop();

        Ok(current_idx)
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

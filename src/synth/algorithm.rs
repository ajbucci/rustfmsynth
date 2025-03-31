use super::{envelope::EnvelopeGenerator, operator::Operator};
use std::collections::HashMap;

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
    matrix: Vec<Vec<Option<ConnectionParams>>>,
    carriers: Vec<usize>,
    repeat_rules: Vec<FeedbackLoop>,
    unrolled_nodes: Vec<UnrolledNode>,
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

    fn rebuild_unrolled_graph(&mut self) {
        let (unrolled_nodes) =
            Self::build_unrolled_graph(&self.matrix, &self.carriers, &self.repeat_rules);
        self.unrolled_nodes = unrolled_nodes.unwrap();
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
        let mut matrix = vec![vec![None; num_operators]; num_operators];
        // TODO: check if this is correct. When I added Repeat Rules did I remove the matrix > 1 -> feedback?
        let mut alg = Self::new(matrix, vec![0])?;
        alg.add_repeat_rule(0, 0, 1);
        Ok(alg)
    }

    pub fn process(
        &self,
        operators: &[Operator],
        base_frequency: f32,
        output: &mut [f32],
        sample_rate: f32,
        start_sample_index: u64,
        samples_since_note_off: Option<u64>,
    ) {
        let buffer_size = output.len();
        if buffer_size == 0 || operators.is_empty() || self.matrix.len() != operators.len() {
            return;
        }

        let mut scratch_buffers: Vec<Vec<f32>> = self
            .unrolled_nodes
            .iter()
            .map(|_| vec![0.0; buffer_size])
            .collect();

        output.fill(0.0);

        for &carrier_op in &self.carriers {
            for (i, node) in self.unrolled_nodes.iter().enumerate() {
                if node.original_op_index == carrier_op {
                    self.evaluate_node(
                        operators,
                        &mut scratch_buffers,
                        i,
                        base_frequency,
                        sample_rate,
                        start_sample_index,
                        samples_since_note_off,
                    );
                    let carrier_output = &scratch_buffers[i];
                    for (out_sample, &carrier_sample) in
                        output.iter_mut().zip(carrier_output.iter())
                    {
                        *out_sample += carrier_sample;
                    }
                }
            }
        }
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

    fn get_or_create_node(
        matrix: &[Vec<Option<ConnectionParams>>],
        target_op_idx: usize,
        nodes: &mut Vec<UnrolledNode>,
        created_nodes: &mut HashMap<usize, usize>,
        visited: &mut Vec<usize>,
    ) -> Result<usize, String> {
        // --- Prevent structural cycles (should never happen in matrix) ---
        if visited.contains(&target_op_idx) {
            return Err(format!(
                "Cycle detected in modulation graph at Operator {}.",
                target_op_idx
            ));
        }

        // --- If node was already created, return its index ---
        if let Some(&idx) = created_nodes.get(&target_op_idx) {
            return Ok(idx);
        }

        // --- Mark current node as visited ---
        visited.push(target_op_idx);

        // --- Create new node ---
        let current_idx = nodes.len();
        nodes.push(UnrolledNode {
            original_op_index: target_op_idx,
            input_node_indices: Vec::new(),
        });
        created_nodes.insert(target_op_idx, current_idx);

        // --- Recursively create all input nodes ---
        let mut input_indices = Vec::new();
        for source_idx in 0..matrix.len() {
            if matrix[target_op_idx][source_idx].is_some() {
                let input_idx =
                    Self::get_or_create_node(matrix, source_idx, nodes, created_nodes, visited)?;
                input_indices.push(input_idx);
            }
        }

        // --- Assign inputs to current node ---
        nodes[current_idx].input_node_indices = input_indices;

        // --- Pop visited stack when done ---
        visited.pop();

        Ok(current_idx)
    }

    fn evaluate_node(
        &self,
        operators: &[Operator],
        scratch_buffers: &mut [Vec<f32>],
        node_idx: usize,
        base_frequency: f32,
        sample_rate: f32,
        start_sample_index: u64,
        samples_since_note_off: Option<u64>,
    ) {
        let node = &self.unrolled_nodes[node_idx];
        let buffer_size = scratch_buffers[node_idx].len();

        let mut modulation_input = vec![0.0; buffer_size];
        for &input_idx in &node.input_node_indices {
            self.evaluate_node(
                operators,
                scratch_buffers,
                input_idx,
                base_frequency,
                sample_rate,
                start_sample_index,
                samples_since_note_off,
            );
            let input_output = &scratch_buffers[input_idx];

            let source_op = self.unrolled_nodes[input_idx].original_op_index;
            let target_op = node.original_op_index;
            if let Some(Some(conn)) = self
                .matrix
                .get(target_op)
                .and_then(|row| row.get(source_op))
            {
                let scale = conn.scale;
                for i in 0..buffer_size {
                    let time_on = (start_sample_index + i as u64) as f32 / sample_rate;
                    let time_off =
                        samples_since_note_off.map(|n| (n + i as u64) as f32 / sample_rate);
                    let env_value = conn
                        .modulation_envelope
                        .as_ref()
                        .map(|e| e.evaluate(time_on, time_off))
                        .unwrap_or(1.0);
                    modulation_input[i] += input_output[i] * scale * env_value;
                }
            }
        }

        let current_output = &mut scratch_buffers[node_idx];
        operators[node.original_op_index].process(
            base_frequency,
            current_output,
            &modulation_input,
            sample_rate,
            start_sample_index,
            samples_since_note_off,
        );
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


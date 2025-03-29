use super::operator::Operator;
use std::collections::HashMap;

// --- Internal Node ---

#[derive(Debug)]
struct UnrolledNode {
    original_op_index: usize,
    input_node_indices: Vec<usize>,
}

#[derive(Debug, Clone)]
pub struct RepeatRule {
    from_node: usize, // Node index (end)
    to_node: usize,   // Node index (start)
    count: usize,     // How many times to repeat
}

// --- Algorithm ---

pub struct Algorithm {
    matrix: Vec<Vec<Option<usize>>>,
    carriers: Vec<usize>,
    repeat_rules: Vec<RepeatRule>,
    unrolled_nodes: Vec<UnrolledNode>,
}

impl Algorithm {
    pub fn new(matrix: Vec<Vec<Option<usize>>>, carriers: Vec<usize>) -> Result<Self, String> {
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
        self.repeat_rules.push(RepeatRule {
            from_node,
            to_node,
            count,
        });
        self.rebuild_unrolled_graph();
    }

    fn rebuild_unrolled_graph(&mut self) {
        let (unrolled_nodes) = Self::build_unrolled_graph(&self.matrix, &self.carriers, &self.repeat_rules);
        self.unrolled_nodes = unrolled_nodes;
    }

    pub fn default_stack_2(num_operators: usize) -> Result<Self, String> {
        if num_operators < 2 {
            return Self::default_simple(num_operators);
        }
        let mut matrix = vec![vec![None; num_operators]; num_operators];
        matrix[0][1] = Some(1);
        Self::new(matrix, vec![0])
    }

    pub fn stack_3_feedback(num_operators: usize) -> Result<Self, String> {
        if num_operators < 3 {
            return Self::default_simple(num_operators);
        }
        let mut matrix = vec![vec![None; num_operators]; num_operators];
        matrix[1][0] = Some(1); // A → B
        matrix[2][1] = Some(1); // B → C

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
        matrix[0][0] = Some(2);
        Self::new(matrix, vec![0])
    }

    pub fn process(
        &self,
        operators: &[Operator],
        base_frequency: f32,
        output: &mut [f32],
        sample_rate: f32,
        start_sample_index: u64,
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
        matrix: &[Vec<Option<usize>>],
        carriers: &[usize],
        repeat_rules: &[RepeatRule],
    ) -> (Vec<UnrolledNode>) {
        let mut nodes = Vec::new();
        let mut created_nodes = HashMap::new();

        let max_level = matrix
            .iter()
            .flatten()
            .filter_map(|&n| n)
            .map(|n| n.saturating_sub(1))
            .max()
            .unwrap_or(0);

        let mut carrier_indices = Vec::with_capacity(carriers.len());
        for &op_idx in carriers {
            let carrier_node_idx =
                Self::get_or_create_node(matrix, op_idx, max_level, &mut nodes, &mut created_nodes);
            carrier_indices.push(carrier_node_idx);
        }

        // Apply repeat rules
        for rule in repeat_rules {
            for _ in 0..rule.count {
                let mut mapping = HashMap::new();
                let start = rule.to_node;
                let end = rule.from_node;
                let mut stack = vec![start];

                while let Some(current) = stack.pop() {
                    if mapping.contains_key(&current) {
                        continue;
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

                for (&old_idx, &new_idx) in &mapping {
                    let inputs = &nodes[old_idx].input_node_indices;
                    let new_inputs: Vec<usize> = inputs.iter().map(|i| mapping[i]).collect();
                    nodes[new_idx].input_node_indices = new_inputs;
                }

                // Link end node to repeated chain start
                nodes[end].input_node_indices.push(mapping[&start]);
            }
        }

        (nodes)
    }

    fn get_or_create_node(
        matrix: &[Vec<Option<usize>>],
        target_op_idx: usize,
        target_level: usize,
        nodes: &mut Vec<UnrolledNode>,
        created_nodes: &mut HashMap<(usize, usize), usize>,
    ) -> usize {
        let key = (target_op_idx, target_level);
        if let Some(&idx) = created_nodes.get(&key) {
            return idx;
        }

        let current_idx = nodes.len();
        nodes.push(UnrolledNode {
            original_op_index: target_op_idx,
            input_node_indices: Vec::new(),
        });
        created_nodes.insert(key, current_idx);

        let mut input_indices = Vec::new();
        for source_idx in 0..matrix.len() {
            if let Some(n) = matrix[target_op_idx][source_idx] {
                if n == 0 {
                    continue;
                }
                let source_level = if n == 1 {
                    0
                } else if target_level > 0 {
                    target_level - 1
                } else {
                    continue;
                };
                let input_idx =
                    Self::get_or_create_node(matrix, source_idx, source_level, nodes, created_nodes);
                input_indices.push(input_idx);
            }
        }
        nodes[current_idx].input_node_indices = input_indices;
        current_idx
    }

    fn evaluate_node(
        &self,
        operators: &[Operator],
        scratch_buffers: &mut [Vec<f32>],
        node_idx: usize,
        base_frequency: f32,
        sample_rate: f32,
        start_sample_index: u64,
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
            );
            let input_output = &scratch_buffers[input_idx];
            let mod_idx = operators[self.unrolled_nodes[input_idx].original_op_index].modulation_index;
            for i in 0..buffer_size {
                modulation_input[i] += input_output[i] * mod_idx;
            }
        }

        let current_output = &mut scratch_buffers[node_idx];
        operators[node.original_op_index].process(
            base_frequency,
            current_output,
            &modulation_input,
            sample_rate,
            start_sample_index,
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
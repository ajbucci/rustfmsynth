// Import the Algorithm struct (and potentially others) from your crate's public API
// Adjust the path based on how Algorithm is exposed in your lib.rs or synth/mod.rs
use rustfmsynth::synth::algorithm::Algorithm;
// If you need other items like ConnectionParams, import them too
// use rustfmsynth::synth::algorithm::ConnectionParams;

// Note: No need for #[cfg(test)] here, files in tests/ are automatically treated as tests

#[test]
fn test_set_matrix_with_feedback() {
    println!("\n--- Running test_set_matrix_with_feedback ---");

    // Assuming Synth::default() creates Algorithm::default_fanout_feedback(4)
    // Or create a specific initial state if needed:
    let num_ops = 4;
    // let mut algorithm = Algorithm::default_simple(num_ops).unwrap();
    let mut algorithm = Algorithm::default_fanout_feedback(num_ops).unwrap(); // Start with a known state
    println!("Initial Structure:");
    algorithm.print_structure(); // Use the existing print method

    // Define the 4x5 UI matrix with Op 0 feedback ON, Op 0 carrier ON
    let ui_matrix_feedback_on: Vec<Vec<u32>> = vec![
        // Modulated Ops ->  0  1  2  3   OUT
        /* From Op 0 */ vec![1, 0, 0, 0,  1], // Feedback on 0, Carrier on 0
        /* From Op 1 */ vec![0, 0, 0, 0,  0],
        /* From Op 2 */ vec![0, 0, 0, 0,  0],
        /* From Op 3 */ vec![0, 0, 0, 0,  0],
    ];

    println!("\nCalling set_matrix with feedback ON...");
    match algorithm.set_matrix(&ui_matrix_feedback_on) {
        Ok(_) => println!("set_matrix call succeeded."),
        Err(e) => {
            println!("set_matrix call failed: {}", e);
            panic!("set_matrix failed: {}", e); // Fail the test on error
        }
    }

    println!("\nStructure after set_matrix (Feedback ON):");
    algorithm.print_structure(); // See the resulting structure

    // Add assertions if you know what to expect:
    // assert!(!algorithm.unrolled_nodes.is_empty(), "Unrolled graph should not be empty");
    // assert_eq!(algorithm.carriers, vec![0], "Carrier should be Op 0");
    // assert!(algorithm.repeat_rules.iter().any(|r| r.from_node == 0 && r.to_node == 0), "Should have feedback rule for Op 0");

    // --- Now test toggling feedback OFF ---

     // Define the 4x5 UI matrix with Op 0 feedback OFF, Op 0 carrier ON
    let ui_matrix_feedback_off: Vec<Vec<u32>> = vec![
        // Modulated Ops ->  0  1  2  3   OUT
        /* From Op 0 */ vec![0, 0, 0, 0,  1], // Feedback OFF, Carrier ON
        /* From Op 1 */ vec![0, 0, 0, 0,  0],
        /* From Op 2 */ vec![0, 0, 0, 0,  0],
        /* From Op 3 */ vec![0, 0, 0, 0,  0],
    ];

    println!("\nCalling set_matrix with feedback OFF...");
    match algorithm.set_matrix(&ui_matrix_feedback_off) {
        Ok(_) => println!("set_matrix call succeeded."),
        Err(e) => {
            println!("set_matrix call failed: {}", e);
            panic!("set_matrix failed: {}", e);
        }
    }

    println!("\nStructure after set_matrix (Feedback OFF):");
    algorithm.print_structure(); // See the resulting structure
    // assert!(algorithm.repeat_rules.is_empty(), "Feedback rules should be empty now");


    println!("--- Test Finished ---");
}

// You can add more #[test] functions in this file
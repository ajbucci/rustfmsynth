use core::fmt;
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum ReverbType {
    ParallelDelayFeedback,  // The previous, potentially unstable one
    StableParallelFeedback, // The new one based on the literature
}

pub trait ReverbStateTrait: Clone + 'static + fmt::Debug {
    fn reset(&mut self);
    fn process(&mut self, input: f32) -> f32;
    // Optional: Add methods to set parameters if needed by the trait
    // fn set_feedback_gain(&mut self, gain: f32);
    // fn set_dry_wet(&mut self, mix: f32);
}

// --- Keep the potentially unstable ParallelDelayFeedbackState for comparison if needed ---
#[derive(Clone, Debug)]
pub struct ParallelDelayFeedbackState {
    // ... (previous implementation as before) ...
}
impl ParallelDelayFeedbackState {
    // ... (constructor and methods as before) ...
}
impl ReverbStateTrait for ParallelDelayFeedbackState {
    // ... (process method as before) ...
    fn reset(&mut self) { /* ... */
    }
    fn process(&mut self, input_sample: f32) -> f32 {
        /* ... */
        input_sample
    } // Placeholder
}

// --- NEW Stable Implementation ---

/// State and parameters for a parallel delay feedback reverb based on Figure 7.15 structure.
/// Designed for better stability with sustained input and high feedback gain.
#[derive(Clone, Debug)]
pub struct StableParallelFeedbackState {
    // --- Parameters ---
    delay_lengths: Vec<usize>,
    feedback_gain: f32, // g
    dry_wet: f32,
    // --- Pre-calculated ---
    output_scale: f32, // Scales the wet output sum for mixing
    // --- Mutable State ---
    delay_lines: Vec<Vec<f32>>,
    write_pointers: Vec<usize>,
}

impl StableParallelFeedbackState {
    /// Creates a new state instance for the stable parallel delay feedback reverb.
    pub fn new(delay_lengths: &[usize], feedback_gain: f32, dry_wet: f32) -> Self {
        assert!(
            !delay_lengths.is_empty(),
            "Must provide at least one delay length."
        );
        assert!(
            delay_lengths.iter().all(|&len| len > 0),
            "Delay lengths must be greater than zero."
        );
        assert!(
            feedback_gain >= 0.0 && feedback_gain <= 1.0,
            "Feedback gain must be between 0.0 and 1.0."
        );
        assert!(
            dry_wet >= 0.0 && dry_wet <= 1.0,
            "Dry/wet mix must be between 0.0 and 1.0."
        );

        let num_delays = delay_lengths.len();
        // Scale the summed output to prevent clipping in the final mix
        let output_scale = if num_delays > 0 {
            1.0 / (num_delays as f32).sqrt()
        } else {
            1.0
        };

        let delay_lines = delay_lengths.iter().map(|&len| vec![0.0; len]).collect();
        let write_pointers = vec![0; num_delays];

        Self {
            delay_lengths: delay_lengths.to_vec(),
            feedback_gain,
            dry_wet: dry_wet.clamp(0.0, 1.0),
            output_scale,
            delay_lines,
            write_pointers,
        }
    }

    // --- Methods to update parameters (implement if needed via trait or directly) ---
    pub fn set_feedback_gain(&mut self, gain: f32) {
        assert!(
            gain >= 0.0 && gain <= 1.0,
            "Feedback gain must be between 0.0 and 1.0."
        );
        self.feedback_gain = gain;
    }

    pub fn set_dry_wet(&mut self, mix: f32) {
        assert!(
            mix >= 0.0 && mix <= 1.0,
            "Dry/wet mix must be between 0.0 and 1.0."
        );
        self.dry_wet = mix;
    }
}

impl ReverbStateTrait for StableParallelFeedbackState {
    /// Resets the delay lines and write pointers to zero.
    fn reset(&mut self) {
        for line in self.delay_lines.iter_mut() {
            line.fill(0.0);
        }
        self.write_pointers.fill(0);
    }

    /// Processes a single sample based on the Figure 7.15 structure.
    #[inline]
    fn process(&mut self, input_sample: f32) -> f32 {
        let num_delays = self.delay_lengths.len();
        if num_delays == 0 {
            return input_sample;
        }

        // --- 1. Read delayed samples (y) & Calculate Mixed Output (m) ---
        // Simple mixing: sum the outputs. A matrix would be better but more complex.
        let mut mixed_output_sum = 0.0; // Represents 'm' in the description
        for i in 0..num_delays {
            let write_pos = self.write_pointers[i];
            let delayed_sample = self.delay_lines[i][write_pos]; // y_i[n]
            mixed_output_sum += delayed_sample;
        }

        // --- 2. Calculate Attenuated Feedback Signal (m_g) ---
        // Gain 'g' is applied *after* mixing the delay outputs
        let feedback_signal = mixed_output_sum * self.feedback_gain; // m_g = m * g

        // --- 3. Calculate Signal to Write into Delay Input (x + m_g) ---
        // Sum the original input with the attenuated feedback signal
        let value_to_write = input_sample + feedback_signal;

        // --- 4. Write to Delay Lines and Update Pointers ---
        for i in 0..num_delays {
            let write_pos = self.write_pointers[i];
            // Add basic saturation/clipping *inside* the loop as a safety measure
            // This prevents the internal state from exploding, even if g=1.0
            let limited_value = value_to_write.tanh(); // Apply tanh saturation
                                                       // Or hard clip: let limited_value = value_to_write.clamp(-1.0, 1.0);

            if !limited_value.is_finite() {
                eprintln!("Warning: Non-finite value detected before writing to reverb delay. Writing 0.0.");
                self.delay_lines[i][write_pos] = 0.0;
            } else {
                self.delay_lines[i][write_pos] = limited_value; // Write the potentially limited value
            }
            self.write_pointers[i] = (write_pos + 1) % self.delay_lengths[i];
        }

        // --- 5. Calculate Final Output (Dry/Wet Mix) ---
        // The 'wet' signal for mixing should be based on the delay outputs *before*
        // the feedback gain 'g' was applied. We use the mixed_output_sum ('m').
        let scaled_wet_signal = mixed_output_sum * self.output_scale; // Scale 'm' for mixing
        let output_sample =
            (input_sample * (1.0 - self.dry_wet)) + (scaled_wet_signal * self.dry_wet);

        // Final safety check
        if !output_sample.is_finite() {
            eprintln!("Warning: Non-finite output sample detected. Returning 0.0.");
            0.0
        } else {
            output_sample.clamp(-1.0, 1.0) // Optional final clamp on output
        }
    }
}

// --- Update the top-level Reverb Enum ---

#[derive(Clone, Debug)]
pub enum Reverb {
    ParallelDelayFeedback(ParallelDelayFeedbackState), // Keep the old one if needed
    StableParallelFeedback(StableParallelFeedbackState), // Add the new one
}

impl Reverb {
    pub fn get_type(&self) -> ReverbType {
        match self {
            Reverb::ParallelDelayFeedback(_) => ReverbType::ParallelDelayFeedback,
            Reverb::StableParallelFeedback(_) => ReverbType::StableParallelFeedback,
        }
    }

    pub fn reset(&mut self) {
        match self {
            Reverb::ParallelDelayFeedback(s) => s.reset(),
            Reverb::StableParallelFeedback(s) => s.reset(),
        }
    }

    #[inline]
    pub fn process(&mut self, input: f32) -> f32 {
        match self {
            Reverb::ParallelDelayFeedback(s) => s.process(input),
            Reverb::StableParallelFeedback(s) => s.process(input),
        }
    }

    // --- Constructors ---
    pub fn new_parallel_delay_feedback(
        delay_lengths: &[usize],
        feedback_gain: f32,
        dry_wet: f32,
    ) -> Self {
        Reverb::ParallelDelayFeedback(ParallelDelayFeedbackState::new(
            delay_lengths,
            feedback_gain,
            dry_wet,
        ))
    }

    pub fn new_stable_parallel_feedback(
        delay_lengths: &[usize],
        feedback_gain: f32,
        dry_wet: f32,
    ) -> Self {
        Reverb::StableParallelFeedback(StableParallelFeedbackState::new(
            delay_lengths,
            feedback_gain,
            dry_wet,
        ))
    }

    // --- Optional: Methods to modify parameters ---
    pub fn set_feedback_gain(&mut self, gain: f32) {
        match self {
            Reverb::ParallelDelayFeedback(s) => { /* s.set_feedback_gain(gain) */ } // Implement if needed
            Reverb::StableParallelFeedback(s) => s.set_feedback_gain(gain),
        }
    }

    pub fn set_dry_wet(&mut self, mix: f32) {
        match self {
            Reverb::ParallelDelayFeedback(s) => { /* s.set_dry_wet(mix) */ } // Implement if needed
            Reverb::StableParallelFeedback(s) => s.set_dry_wet(mix),
        }
    }
}

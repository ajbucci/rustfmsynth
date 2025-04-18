use super::algorithm::Algorithm;
use super::config::SynthConfig;
use super::note::NoteEvent;
use super::operator::Operator;
use super::operator::OperatorEvent;
use super::voice::Voice;
use super::voice_config::VoiceConfig;
use super::waveform::Waveform;

/// The main synthesizer engine that manages voices and audio processing
pub struct Synth {
    voices: Vec<Voice>,
    pub config: SynthConfig,
    pub voice_config: VoiceConfig, // Configuration for the voices
    algorithm: Algorithm,          // The algorithm defining operator connections
    operators: Vec<Operator>,      // The set of operators shared by all voices
    master_volume: f32,
    current_gain: f32, // Track the current gain for smooth transitions
    buffer_size: usize,
}

impl Synth {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn note_on(&mut self, event: &NoteEvent) {
        let voice_config = self.voice_config.clone();
        // Find a free voice or steal one
        let voice = if let Some(v) = self.find_free_voice() {
            v
        } else {
            self.steal_voice()
        };

        // Activate the voice with the note details
        voice.activate(event, &voice_config);
    }
    pub fn note_off(&mut self, event: &NoteEvent) {
        for voice in self.voices.iter_mut() {
            // Check if the voice is active OR still releasing (envelope not finished)
            // and matches the note number and source.
            if (!voice.releasing || voice.active) // Check if it's making sound or just triggered
                        && voice.note_number == event.note_number
                        && voice.note_source == Some(event.source)
            {
                voice.release(); // Initiate the release phase
            }
        }
    }
    fn update_voice_algorithm(&mut self) {
        for voice in self.voices.iter_mut() {
            voice.update_algorithm(&self.algorithm);
        }
    }
    pub fn set_algorithm(&mut self, combined_matrix: &[Vec<u32>]) {
        if let Err(e) = self.algorithm.set_matrix(combined_matrix) {
            eprintln!("Synth Error: Failed to set algorithm matrix: {}", e);
            // Depending on the error, maybe log more or take other action
        } else {
            // Only update voices if setting the algorithm structure succeeded
            self.update_voice_algorithm();
            println!("Synth: Algorithm updated successfully.");
            // self.algorithm.print_structure(); // Optional debug print
        }
    }

    /// Find an available voice (one that is completely finished)
    fn find_free_voice(&mut self) -> Option<&mut Voice> {
        self.voices.iter_mut().find(|voice| !voice.active)
    }
    pub fn set_operator_ratio(&mut self, op_index: usize, ratio: f32) {
        if op_index < self.operators.len() {
            self.operators[op_index].set_ratio(ratio);
        } else {
            eprintln!("Operator index out of bounds");
        }
    }
    pub fn set_operator_modulation_index(&mut self, op_index: usize, modulation_index: f32) {
        if op_index < self.operators.len() {
            self.operators[op_index].set_modulation_index(modulation_index);
        } else {
            eprintln!("Operator index out of bounds");
        }
    }

    pub fn set_operator_envelope(&mut self, op_index: usize, a: f32, d: f32, s: f32, r: f32) {
        if op_index < self.operators.len() {
            self.operators[op_index].set_envelope(a, d, s, r);
        }
    }

    /// Set the waveform for a specific operator index.
    pub fn set_operator_waveform(&mut self, op_index: usize, waveform: Waveform) {
        if op_index < self.operators.len() {
            self.operators[op_index].set_waveform(waveform);
            // println!( // Keep logging minimal unless debugging
            //     "Synth core: Set operator {} waveform to {:?}",
            //     op_index, waveform
            // );
        } else {
            eprintln!(
                "Error: set_operator_waveform index {} out of bounds ({} operators)",
                op_index,
                self.operators.len()
            );
        }
    }

    // TODO: Implement a better voice stealing strategy (e.g., oldest note, quietest voice)
    fn steal_voice(&mut self) -> &mut Voice {
        // Simple strategy: steal the first voice. Replace with a better heuristic.
        eprintln!("Warning: Stealing voice 0"); // Log voice stealing
        &mut self.voices[0]
    }

    /// Set the master volume level (0.0 to 1.0)
    pub fn set_master_volume(&mut self, volume: f32) {
        self.master_volume = volume.clamp(0.0, 1.0);
    }

    pub fn set_voice_config(&mut self, config: VoiceConfig) {
        self.voice_config = config;
    }
    /// Process operator events
    pub fn process_operator_events(&mut self, event: &OperatorEvent) {
        match event {
            OperatorEvent::CycleWaveform { direction } => {
                println!("Processing CycleWaveform event: {:?}", direction);
                // Cycle the waveform for *all* operators managed by the engine
                for (_i, operator) in self.operators.iter_mut().enumerate() {
                    operator.cycle_waveform(*direction);
                    // Log the waveform of the first operator as an example
                    // println!(
                    //     "Operator {:?} waveform changed to: {:?}",
                    //     i, operator.waveform_generator
                    // );
                }
            } // Add other OperatorEvent cases here
        }
    }

    /// Process audio for the current buffer
    pub fn process(&mut self, output: &mut [f32], sample_rate: f32) {
        // Clear output buffer
        output.fill(0.0); // Clear the main output buffer first

        // Process voices, generate their audio into temporary buffers, and calculate energy
        let (total_energy, voice_buffers) = self.process_voices(output.len(), sample_rate);

        // Calculate target gain based on the combined energy of active voices
        let target_gain = self.calculate_target_gain(total_energy);

        // Mix voices and apply gain with anti-pop processing
        self.mix_voices_with_gain(output, voice_buffers, target_gain, sample_rate);

        // Apply soft knee limiter for safety
        self.apply_limiter(output);
    }

    /// Process all voices that are not finished, return their total energy and individual buffers.
    fn process_voices(&mut self, buffer_size: usize, sample_rate: f32) -> (f32, Vec<Vec<f32>>) {
        let mut total_energy = 0.0;
        // Pre-allocate buffers for voices that will be processed
        let active_voice_count = self.voices.iter().filter(|v| v.active).count();
        let mut voice_buffers = Vec::with_capacity(active_voice_count);

        // Process only voices that are not fully finished (active or releasing)
        for voice in self.voices.iter_mut().filter(|v| v.active) {
            let mut voice_buffer = vec![0.0; buffer_size];

            // Process the voice using the engine's algorithm and operators
            voice.process(
                &self.algorithm,
                &self.operators,
                &mut voice_buffer,
                sample_rate,
            );

            // Calculate voice energy (RMS power) after processing
            let voice_energy = voice_buffer.iter().map(|s| s * s).sum::<f32>() / buffer_size as f32;

            total_energy += voice_energy;
            voice_buffers.push(voice_buffer); // Add the processed buffer
        }

        (total_energy, voice_buffers) // Return total energy and the buffers of processed voices
    }

    /// Calculate the target gain based on total energy and master volume
    fn calculate_target_gain(&self, total_energy: f32) -> f32 {
        let energy_gain = if total_energy > 0.0 {
            1.0 / (1.0 + total_energy.sqrt() * 2.5)
        } else {
            1.0
        };

        // Apply master volume
        energy_gain * self.master_volume
    }

    /// Mix all voice buffers with gain and apply crossfade to prevent pops
    fn mix_voices_with_gain(
        &mut self,
        output: &mut [f32],
        voice_buffers: Vec<Vec<f32>>,
        target_gain: f32,
        sample_rate: f32,
    ) {
        // Create a temporary buffer for mixing
        let mut temp_buffer = vec![0.0; output.len()];

        // Mix all voice buffers into the temporary buffer
        for voice_buffer in voice_buffers {
            for (i, sample) in voice_buffer.iter().enumerate() {
                temp_buffer[i] += *sample;
            }
        }

        // Calculate crossfade parameters
        let gain_ratio = if self.current_gain > 0.0 {
            target_gain / self.current_gain
        } else {
            1.0
        };

        // Determine crossfade length based on gain change magnitude
        let base_crossfade_ms = 5.0;
        let max_crossfade_ms = 20.0;
        let gain_change_factor = (1.0 - gain_ratio.abs()).abs().min(1.0);
        let crossfade_ms =
            base_crossfade_ms + gain_change_factor * (max_crossfade_ms - base_crossfade_ms);
        let crossfade_samples = (crossfade_ms / 1000.0 * sample_rate) as usize;
        let crossfade_samples = crossfade_samples.min(output.len());

        // Apply crossfade at the beginning of the buffer
        for i in 0..crossfade_samples {
            // Use a smoother curve for the crossfade (cubic easing)
            let t = i as f32 / crossfade_samples as f32;
            let smooth_t = t * t * (3.0 - 2.0 * t); // Cubic easing function
            let fade_in_gain = self.current_gain * (1.0 - smooth_t) + target_gain * smooth_t;
            output[i] = temp_buffer[i] * fade_in_gain;
        }

        // Apply target gain to the rest of the buffer
        for i in crossfade_samples..output.len() {
            output[i] = temp_buffer[i] * target_gain;
        }

        // Update current gain
        self.current_gain = target_gain;
    }

    /// Apply a soft knee limiter to prevent clipping
    fn apply_limiter(&self, output: &mut [f32]) {
        for sample in output.iter_mut() {
            if sample.abs() > 0.9 {
                let excess = (sample.abs() - 0.9) / 0.1;
                let scale = 1.0 - excess * 0.1;
                *sample *= scale;
            }
        }
    }

    /// Set the buffer size for the synth engine
    pub fn set_buffer_size(&mut self, buffer_size: usize) {
        // You can store this buffer size in the engine if needed
        println!("Buffer size set to: {}", buffer_size);
        self.buffer_size = buffer_size;
    }
}
impl Default for Synth {
    fn default() -> Self {
        let config = SynthConfig::default();

        // Initialize operators
        let mut operators: Vec<Operator> = (0..config.operators_per_voice)
            .map(|_| Operator::new())
            .collect();

        // Carrier A
        operators[0].set_waveform(Waveform::Sine);
        // operators[0].set_envelope(0.01, 1.0, 0.7, 0.5);
        // operators[0].set_gain(0.5);
        // operators[0].set_ratio(1.0);

        // Carrier B (slightly detuned)
        // operators[1].set_waveform(Waveform::Sine);
        // operators[1].set_envelope(0.01, 1.0, 0.7, 0.5);
        // operators[1].set_gain(0.5);
        // operators[1].set_ratio(1.01);
        // operators[1].set_modulation_index(2.0);

        // Modulator A
        // operators[2].set_waveform(Waveform::Sine);
        // operators[2].set_envelope(0.005, 0.3, 0.0, 0.2);
        // operators[2].set_gain(1.0);
        // operators[2].set_ratio(2.0);
        // operators[2].set_modulation_index(3.0);

        // Modulator B
        // operators[3].set_waveform(Waveform::Sine);
        // operators[3].set_envelope(0.005, 0.3, 0.0, 0.2);
        // operators[3].set_gain(1.0);
        // operators[3].set_ratio(2.02);
        // operators[3].set_modulation_index(3.0);

        // Initialize with a default algorithm (e.g., a simple 2-operator stack)
        // let default_algorithm = Algorithm::default_fanout_feedback(operators.len()).unwrap();
        // let default_algorithm = Algorithm::default_feedback_1(operators.len()).unwrap();
        let default_algorithm = Algorithm::default_simple(operators.len()).unwrap();
        // let default_algorithm = Algorithm::default_stack_2(operators.len()).unwrap();
        default_algorithm.print_evaluation_chains();
        default_algorithm.print_structure();
        // Initialize voices
        let mut voices: Vec<Voice> = (0..config.max_voices)
            .map(|_| Voice::new(operators.len()))
            .collect();

        for voice in voices.iter_mut() {
            voice.update_algorithm(&default_algorithm);
        }

        Self {
            voices,
            config,
            voice_config: VoiceConfig::default(), // Default voice config
            algorithm: default_algorithm,
            operators, // Store the operators
            master_volume: 0.65,
            current_gain: 0.65,
            buffer_size: 1024, // Default, can be updated by set_buffer_size
        }
    }
}

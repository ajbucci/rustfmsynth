use super::algorithm::Algorithm;
use super::config::SynthConfig;
use super::filter::{Filter, FilterType};
use super::note::NoteEvent;
use super::operator::Operator;
use super::operator::OperatorEvent;
use super::reverb::Reverb;
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
    buffer_size: usize,
}

const MAX_MODULATION_INDEX: f32 = 10.0;
pub const MODULATION_INDEX_GAIN_OFFSET: f32 = 1.0 / MAX_MODULATION_INDEX;

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
    pub fn set_operator_fixed_frequency(&mut self, op_index: usize, frequency: f32) {
        if op_index < self.operators.len() {
            self.operators[op_index].set_fixed_frequency(frequency);
        } else {
            eprintln!("Operator index out of bounds");
        }
    }
    pub fn set_operator_detune(&mut self, op_index: usize, detune: f32) {
        if op_index < self.operators.len() {
            self.operators[op_index].set_detune(detune);
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
    pub fn set_operator_filter(&mut self, op_index: usize, filter: Filter) {
        if op_index < self.operators.len() {
            self.operators[op_index].set_filter(filter);
        } else {
            eprintln!("Operator index out of bounds");
        }
    }

    pub fn remove_operator_filter(&mut self, op_index: usize, filter_type: FilterType) {
        if op_index < self.operators.len() {
            self.operators[op_index].remove_filter(filter_type);
        } else {
            eprintln!("Operator index out of bounds");
        }
    }
    pub fn set_operator_reverb(&mut self, op_index: usize, reverb: Option<Reverb>) {
        if op_index < self.operators.len() {
            self.operators[op_index].set_reverb(reverb);
        } else {
            eprintln!("Operator index out of bounds");
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

    pub fn process(&mut self, output: &mut [f32], sample_rate: f32) {
        output.fill(0.0); // Clear output buffer before mixing
        let mut temp_buffer = vec![0.0; output.len()];
        let voice_scaling_factor = self.get_voice_scaling_factor();
        for voice in self.voices.iter_mut().filter(|v| v.active) {
            voice.process(
                &self.algorithm,
                &self.operators,
                &mut temp_buffer,
                sample_rate,
                voice_scaling_factor,
            );

            for i in 0..output.len() {
                output[i] += temp_buffer[i];
                temp_buffer[i] = 0.0; // Clear temp buffer for next voice
            }
        }
        for sample in output.iter_mut() {
            // Modulation Index is allowed to go from 0 to (1/MODULATION_INDEX_GAIN_OFFSET),
            // back out that gain increase here
            *sample *= self.master_volume * MODULATION_INDEX_GAIN_OFFSET;
        }
    }
    fn get_voice_scaling_factor(&self) -> f32 {
        let carrier_indices = self.algorithm.get_carrier_indices();
        let mut max_modulation_index: f32 = 0.0;
        let mut total_modulation_index = 0.0;
        for carrier_idx in carrier_indices {
            let mod_index = self.operators[*carrier_idx].get_modulation_index();
            if self.operators[*carrier_idx].get_waveform() == Waveform::Input {
                // NOTE: if the operator is a pass through, sum the effective modulation indices of its Modulators
                let modulator_indices = self.algorithm.get_modulator_indices(*carrier_idx);
                for modulator_idx in modulator_indices {
                    let modulator_effective_mod_index = mod_index
                        * MODULATION_INDEX_GAIN_OFFSET
                        * self.operators[modulator_idx].get_modulation_index();
                    max_modulation_index = max_modulation_index.max(modulator_effective_mod_index);
                    total_modulation_index += modulator_effective_mod_index;
                }
            } else {
                max_modulation_index = max_modulation_index.max(mod_index);
                total_modulation_index += mod_index;
            }
        }
        max_modulation_index / total_modulation_index
    }

    /// Set the buffer size for the synth engine
    pub fn set_buffer_size(&mut self, buffer_size: usize) {
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
        let sr = 44100.0;
        let delay_times_ms = [31.3, 41.1, 53.0, 67.7, 73.3, 80.9];
        let delay_lengths: Vec<usize> = delay_times_ms
            .iter()
            .map(|&t| (t / 1000.0 * sr) as usize)
            .collect();
        println!("Delay lengths: {:?}", delay_lengths);
        let reverb = Reverb::new_parallel_delay_feedback(&delay_lengths, 0.12, 0.5);
        operators[0].set_waveform(Waveform::Sine);
        operators[0].set_reverb(Some(reverb));
        // operators[0].set_envelope(0.01, 1.0, 0.7, 0.5);
        // operators[0].set_gain(0.5);
        // operators[0].set_ratio(1.0);
        // operators[0].set_filter(Filter::new_pitched_comb(0.99));

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
            master_volume: 0.8,
            buffer_size: 1024, // Default, can be updated by set_buffer_size
        }
    }
}

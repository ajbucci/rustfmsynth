use super::algorithm::Algorithm;
use super::config::SynthConfig;
use super::filter::{Filter, FilterType};
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
        let (total_energy, voice_buffers) = self.process_voices(output.len(), sample_rate);

        let energy_gain = if total_energy > 1e-9 {
            // Use .recip() for 1.0 / x, add small epsilon to avoid division by zero / instability near zero
            (1.0 + total_energy.sqrt() * 2.5).recip()
        } else {
            1.0
        };
        let target_gain = energy_gain * self.master_volume;

        self.mix_and_apply_gain(output, voice_buffers, target_gain, sample_rate);

        self.apply_limiter(output);
        // Optional safety clamp (if the limiter logic isn't perfect)
        // for sample in output.iter_mut() {
        //     *sample = sample.clamp(-1.0, 1.0);
        // }
    }

    /// Process active voices, returning their total energy and individual audio buffers.
    fn process_voices(&mut self, buffer_size: usize, sample_rate: f32) -> (f32, Vec<Vec<f32>>) {
        let mut total_energy = 0.0;
        let active_voice_count = self.voices.iter().filter(|v| v.active).count();
        let mut voice_buffers = Vec::with_capacity(active_voice_count); // Consider pre-allocating here

        // Process only active voices
        for voice in self.voices.iter_mut().filter(|v| v.active) {
            let mut voice_buffer = vec![0.0; buffer_size];
            voice.process(
                &self.algorithm,
                &self.operators,
                &mut voice_buffer,
                sample_rate,
            );

            // Calculate voice energy (mean squared amplitude)
            let energy = voice_buffer.iter().map(|s| s * s).sum::<f32>() / buffer_size as f32;
            total_energy += energy;
            voice_buffers.push(voice_buffer);
        }

        (total_energy, voice_buffers)
    }

    /// Mix voice buffers and apply target gain with smoothing (crossfade).
    fn mix_and_apply_gain(
        &mut self,
        output: &mut [f32],
        voice_buffers: Vec<Vec<f32>>,
        target_gain: f32,
        sample_rate: f32,
    ) {
        let buffer_len = output.len();
        output.fill(0.0); // Clear output buffer before mixing *into* it

        // Mix voice buffers directly into the output buffer
        for voice_buffer in voice_buffers {
            for (i, sample) in voice_buffer.iter().enumerate().take(buffer_len) {
                output[i] += *sample;
            }
        }

        // Calculate crossfade parameters
        let gain_ratio_abs = if self.current_gain.abs() > 1e-9 {
            (target_gain / self.current_gain).abs()
        } else {
            1.0 // Assume large change if current gain is near zero
        };
        // Crossfade duration depends on how much the gain changes
        let gain_change_factor = (1.0 - gain_ratio_abs).abs().min(1.0); // Factor from 0 to 1
        let crossfade_ms = 5.0f32.mul_add(gain_change_factor, 5.0); // Lerp between 5ms and 10ms - Adjust if needed
                                                                    // let crossfade_ms = 5.0 + gain_change_factor * (20.0 - 5.0); // Original: 5ms to 20ms based on change
        let crossfade_samples = (crossfade_ms / 1000.0 * sample_rate).round() as usize;
        let crossfade_samples = crossfade_samples.min(buffer_len); // Clamp to buffer length

        // Apply gain: smoothed for crossfade_samples, then target_gain
        let inv_crossfade_len = if crossfade_samples > 0 {
            1.0 / crossfade_samples as f32
        } else {
            0.0 // Avoid division by zero; won't be used if samples == 0
        };

        for i in 0..buffer_len {
            let gain = if i < crossfade_samples {
                // Interpolate gain during crossfade using cubic easing
                let t = (i + 1) as f32 * inv_crossfade_len; // Easing input t from (0, 1]
                let smooth_t = t * t * (3.0 - 2.0 * t); // Cubic ease-in-out curve
                                                        // Lerp: start * (1-t) + end * t
                self.current_gain
                    .mul_add(1.0 - smooth_t, target_gain * smooth_t)
            } else {
                // Use target gain after crossfade
                target_gain
            };
            // Apply calculated gain to the mixed sample
            output[i] *= gain;
        }

        // Update current gain for the next buffer
        self.current_gain = target_gain;
    }
    pub fn apply_limiter(&mut self, output: &mut [f32]) {
        // Apply soft knee limiter
        for sample in output.iter_mut() {
            let abs_sample = sample.abs();
            // Apply limiter only if sample exceeds the threshold (0.9)
            if abs_sample > 0.9 {
                *sample *= (1.9 - abs_sample).max(0.0); // Ensure scale doesn't go negative
            }
        }
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
        operators[0].set_waveform(Waveform::Sine);
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
            master_volume: 0.65,
            current_gain: 0.65,
            buffer_size: 1024, // Default, can be updated by set_buffer_size
        }
    }
}

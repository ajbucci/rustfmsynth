use super::context::ProcessContext;
use super::envelope::EnvelopeGenerator;
use super::filter::{self, Filter};
use super::waveform::{Waveform, WaveformGenerator};
use crate::synth::prelude::TAU;

#[derive(Clone, Copy, Debug)]
pub enum CycleDirection {
    Forward,
    Backward,
}

#[derive(Clone, Copy, Debug)]
pub enum OperatorEvent {
    CycleWaveform { direction: CycleDirection },
    // We can add more operator events here in the future
}

const RATIO_SMOOTHING_FACTOR: f32 = 0.001;
const MODULATION_INDEX_SMOOTHING_FACTOR: f32 = 0.001; // Add a factor for modulation index

#[derive(Clone, Debug)]
pub struct OperatorState {
    current_phase: f32,
    current_ratio: Option<f32>,
    current_modulation_index: Option<f32>, // Add field for smoothed mod index
    filters: Vec<Filter>,
}
impl Default for OperatorState {
    fn default() -> Self {
        Self {
            current_phase: 0.0,
            current_ratio: None,
            current_modulation_index: None, // Initialize as None
            filters: vec![Filter::biquad(20000.0, 44100.0)], // Default filter state
        }
    }
}

pub struct Operator {
    pub waveform_generator: WaveformGenerator,
    frequency_ratio: f32, // Ratio relative to the voice's base frequency
    pub fixed_frequency: Option<f32>, // Optional fixed frequency in Hz
    pub envelope: EnvelopeGenerator, // Operator-specific envelope (optional)
    pub modulation_index: f32,
    pub gain: f32, // Output gain of this operator
}

impl Operator {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn process(
        &self,
        context: &ProcessContext,
        modulation: &[f32],
        state: &mut OperatorState,
        output: &mut [f32],
    ) {
        let buffer_len = output.len();
        if buffer_len == 0 || modulation.len() != buffer_len {
            // Basic validation
            return;
        }
        let sample_rate = context.sample_rate;
        // --- State Initialization ---
        state.current_ratio.get_or_insert(self.frequency_ratio);
        state
            .current_modulation_index
            .get_or_insert(self.modulation_index);

        let mut current_smoothed_ratio = state.current_ratio.unwrap_or(self.frequency_ratio);
        let mut current_smoothed_modulation_index = state
            .current_modulation_index
            .unwrap_or(self.modulation_index); // Get current smoothed mod index

        // Generate the waveform using the WaveformGenerator
        for (i, sample) in output.iter_mut().enumerate() {
            // --- Smooth Ratio ---
            current_smoothed_ratio +=
                (self.frequency_ratio - current_smoothed_ratio) * RATIO_SMOOTHING_FACTOR;
            // --- Smooth Modulation Index ---
            current_smoothed_modulation_index += (self.modulation_index
                - current_smoothed_modulation_index)
                * MODULATION_INDEX_SMOOTHING_FACTOR;

            // Determine the actual frequency for this operator
            let actual_frequency = match self.fixed_frequency {
                Some(fixed_freq) => fixed_freq,
                None => context.base_frequency * current_smoothed_ratio,
            };
            let phase_increment = TAU * actual_frequency / sample_rate;
            state.current_phase += phase_increment;
            state.current_phase %= TAU;
            let modulated_phase = state.current_phase + modulation[i];
            let wave = self.waveform_generator.evaluate(modulated_phase);

            // --- Envelope Calculation ---
            let current_sample_abs_idx = context.samples_elapsed_since_trigger + i as u64;
            let time_since_on = current_sample_abs_idx as f32 / sample_rate;
            let time_since_off = context
                .note_off_sample_index
                .map(|off_idx| current_sample_abs_idx.saturating_sub(off_idx) as f32 / sample_rate);
            let env = self.envelope.evaluate(time_since_on, time_since_off);
            let raw_output = wave * env * self.gain * current_smoothed_modulation_index;

            let filtered_output = state
                .filters
                .iter_mut()
                .fold(raw_output, |acc, filter| filter.process(acc));
            *sample = filtered_output; // Assign filtered output
        }
        // Store the final smoothed values back into the state
        state.current_ratio = Some(current_smoothed_ratio);
        state.current_modulation_index = Some(current_smoothed_modulation_index);
    }

    pub fn set_amplitude(&mut self, amp: f32) {
        println!("Setting amplitude: {}", amp);
        self.gain = amp;
    }
    pub fn set_envelope(&mut self, attack: f32, decay: f32, sustain: f32, release: f32) {
        println!(
            "Operator envelope set to: {}, {}, {}, {}",
            attack, decay, sustain, release
        );
        self.envelope.set_params(attack, decay, sustain, release);
    }

    pub fn cycle_waveform(&mut self, direction: CycleDirection) {
        match direction {
            CycleDirection::Forward => {
                println!("Cycling waveform forward");
                self.waveform_generator.get_next_waveform();
            }
            CycleDirection::Backward => {
                println!("Cycling waveform backward");
                self.waveform_generator.get_previous_waveform();
            }
        };
        // println!("New waveform: {:?}", self.waveform_generator.waveform); // Access waveform field if needed
    }

    // Method to update the waveform directly
    pub fn set_waveform(&mut self, waveform: Waveform) {
        println!("Operator waveform set to: {:?}", waveform);
        self.waveform_generator.set_waveform(waveform);
    }

    pub fn set_gain(&mut self, gain: f32) {
        println!("Operator gain set to: {}", gain);
        self.gain = gain;
    }

    pub fn set_ratio(&mut self, ratio: f32) {
        println!("Operator frequency ratio set to: {}", ratio);
        if ratio < 0.0 {
            eprintln!("Frequency ratio must be non-negative. Frequency clamped to 0.0");
            self.frequency_ratio = 0.0;
        } else {
            self.frequency_ratio = ratio;
        }
    }

    pub fn set_modulation_index(&mut self, modulation_index: f32) {
        println!("Operator modulation index set to: {}", modulation_index);
        if modulation_index < 0.0 {
            eprintln!("Modulation index must be non-negative. Modulation index clamped to 0.0");
            self.modulation_index = 0.0;
        } else {
            self.modulation_index = modulation_index;
        }
    }
    pub fn finished(&self, context: &ProcessContext) -> bool {
        let time_since_off = context
            .note_off_sample_index
            .map(|off| (context.samples_elapsed_since_trigger - off) as f32 / context.sample_rate);

        self.envelope.finished(time_since_off)
    }
}

// Implement Default trait for easy preallocation
impl Default for Operator {
    fn default() -> Self {
        Self {
            waveform_generator: WaveformGenerator::new(Waveform::Sine),
            frequency_ratio: 1.0,  // Target ratio
            fixed_frequency: None, // Default to using ratio
            modulation_index: 1.0,
            envelope: EnvelopeGenerator::new(),
            gain: 1.0,
        }
    }
}

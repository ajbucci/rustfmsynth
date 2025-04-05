use super::envelope::EnvelopeGenerator;
use super::filter::{self, FilterType};
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
    // --- Biquad Filter State ---
    filter_x1: f32, // Previous input sample x[n-1]
    filter_x2: f32, // Input sample before previous x[n-2]
    filter_y1: f32, // Previous output sample y[n-1]
    filter_y2: f32, // Output sample before previous y[n-2]
}
impl Default for OperatorState {
    fn default() -> Self {
        Self {
            current_phase: 0.0,
            current_ratio: None,
            current_modulation_index: None, // Initialize as None
            // Initialize filter state to zero
            filter_x1: 0.0,
            filter_x2: 0.0,
            filter_y1: 0.0,
            filter_y2: 0.0,
        }
    }
}
pub struct Operator {
    pub waveform_generator: WaveformGenerator,
    frequency_ratio: f32, // Ratio relative to the voice's base frequency
    pub fixed_frequency: Option<f32>, // Optional fixed frequency in Hz
    pub envelope: EnvelopeGenerator, // Operator-specific envelope (optional)
    pub modulation_index: f32,
    pub gain: f32,          // Output gain of this operator
    pub filter: FilterType, // Filter applied to this operator's output
}

impl Operator {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn process(
        &self,
        base_frequency: f32, // Base frequency from the voice/note
        output: &mut [f32],
        modulation: &[f32], // Input modulation signal
        sample_rate: f32,
        samples_since_note_on: u64,
        samples_since_note_off: Option<u64>,
        state: &mut OperatorState,
    ) {
        // --- State Initialization ---
        if state.current_ratio.is_none() {
            state.current_ratio = Some(self.frequency_ratio);
        }
        if state.current_modulation_index.is_none() { // Initialize mod index state
            state.current_modulation_index = Some(self.modulation_index);
        }
        let mut current_smoothed_ratio = state.current_ratio.unwrap_or(self.frequency_ratio);
        let mut current_smoothed_modulation_index = state.current_modulation_index.unwrap_or(self.modulation_index); // Get current smoothed mod index

        // Define a default Q factor for filters (e.g., Butterworth)
        // You might want to make this configurable per operator later
        const DEFAULT_Q: f32 = 0.70710678; // 1.0 / sqrt(2.0)

        // Generate the waveform using the WaveformGenerator
        for (i, sample) in output.iter_mut().enumerate() {
            // --- Smooth Ratio ---
            current_smoothed_ratio +=
                (self.frequency_ratio - current_smoothed_ratio) * RATIO_SMOOTHING_FACTOR;
            // --- Smooth Modulation Index ---
            current_smoothed_modulation_index +=
                (self.modulation_index - current_smoothed_modulation_index) * MODULATION_INDEX_SMOOTHING_FACTOR;

            // Determine the actual frequency for this operator
            let actual_frequency = match self.fixed_frequency {
                Some(fixed_freq) => fixed_freq,
                None => base_frequency * current_smoothed_ratio,
            };
            let phase_increment = TAU * actual_frequency / sample_rate;
            state.current_phase += phase_increment;
            state.current_phase %= TAU;
            let modulated_phase = state.current_phase + modulation[i];
            let wave = self.waveform_generator.evaluate(modulated_phase);

            // --- Envelope Calculation ---
            let time_since_on = (samples_since_note_on + i as u64) as f32 / sample_rate;
            let time_since_off =
                samples_since_note_off.map(|off| (off + i as u64) as f32 / sample_rate);
            let env = self.envelope.evaluate(time_since_on, time_since_off);
            // Use the smoothed modulation index here
            let raw_output = wave * env * self.gain * current_smoothed_modulation_index;

            // --- Apply Filter (Stateful Biquad, per-sample) ---
            let filtered_output = match self.filter {
                FilterType::LowPass(cutoff) => filter::process_biquad_lpf(
                    raw_output,
                    cutoff,
                    sample_rate,
                    DEFAULT_Q, // Use default Q for now
                    &mut state.filter_x1,
                    &mut state.filter_x2,
                    &mut state.filter_y1,
                    &mut state.filter_y2,
                ),
                // TODO: Implement other filter types using biquad state if needed
                // FilterType::HighPass(cutoff) => filter::process_biquad_hpf(...),
                // FilterType::BandPass(center, bw) => filter::process_biquad_bpf(...),
                _ => raw_output, // Pass through if type not handled
            };

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
            filter: FilterType::LowPass(20000.0), // Default: wide open low-pass
        }
    }
}

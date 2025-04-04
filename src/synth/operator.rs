use super::envelope::EnvelopeGenerator;
use super::filter::FilterType;
use super::waveform::{Waveform, WaveformGenerator};
use crate::synth::prelude::PI;

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

#[derive(Clone, Debug)]
pub struct OperatorState {
    current_phase: f32,
    current_ratio: f32,
}
impl Default for OperatorState {
    fn default() -> Self {
        Self {
            current_phase: 0.0,
            current_ratio: 1.0,
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
    ) {
        // Determine the actual frequency for this operator
        let actual_frequency = match self.fixed_frequency {
            Some(fixed_freq) => fixed_freq,
            None => base_frequency * self.frequency_ratio,
        };

        // Calculate the phase offset based on the starting sample index
        let phase_increment = 2.0 * PI * actual_frequency / sample_rate;

        // Generate the waveform using the WaveformGenerator
        for (i, sample) in output.iter_mut().enumerate() {
            let sample_index = samples_since_note_on + i as u64;
            // NOTE: can wrap phase if it grows large: let wrapped_phase = phase % (2.0 * PI);
            let phase = phase_increment * (sample_index as f32) + modulation[i];
            let wave = self.waveform_generator.evaluate(phase);

            let time_since_on = sample_index as f32 / sample_rate;
            let time_since_off =
                samples_since_note_off.map(|off| (off + i as u64) as f32 / sample_rate);
            let env = self.envelope.evaluate(time_since_on, time_since_off);
            *sample = wave * env * self.gain * self.modulation_index;
            // TODO: apply filter
        }
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
            panic!("Frequency ratio must be non-negative");
        }
        self.frequency_ratio = ratio;
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

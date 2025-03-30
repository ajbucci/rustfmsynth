use super::filter::FilterType;
use super::envelope::EnvelopeGenerator;
use super::waveform::{Waveform, WaveformGenerator};
use std::f32::consts::PI;

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

pub struct Operator {
    pub waveform_generator: WaveformGenerator,
    pub frequency: f32,
    pub frequency_ratio: f32, // Ratio relative to the voice's base frequency
    pub fixed_frequency: Option<f32>, // Optional fixed frequency in Hz
    // TODO: for operator specific envelopes the voice needs to pass the current envelope state, as
    // well as the time since that state begain, to the Algorithm, which will pass it on to the
    // operator
    //
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
            let time_since_off = samples_since_note_off.map(|off| (off + i as u64) as f32 / sample_rate);
            let env = self.envelope.evaluate(time_since_on, time_since_off);
            *sample = wave * env * self.gain;
        }

        // Apply operator-specific envelope if it exists and is active
        // self.envelope.apply(output, sample_rate);

        // Apply gain
        apply_gain(output, self.gain);

        // Apply filter
        //apply_filter(output, self.filter, sample_rate); // Pass filter by value if it's Copy
    }

    pub fn set_amplitude(&mut self, amp: f32) {
        println!("Setting amplitude: {}", amp);
        self.gain = amp;
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
}

// Implement Default trait for easy preallocation
impl Default for Operator {
    fn default() -> Self {
        Self {
            waveform_generator: WaveformGenerator::new(Waveform::Sine),
            frequency: 440.0, // Default base frequency (may not be used directly)
            frequency_ratio: 1.0,
            fixed_frequency: None, // Default to using ratio
            modulation_index: 1.0,
            envelope: EnvelopeGenerator::new(),
            gain: 1.0,
            filter: FilterType::LowPass(20000.0), // Default: wide open low-pass
        }
    }
}

// Helper function to apply gain to a buffer
fn apply_gain(output: &mut [f32], gain: f32) {
    for sample in output.iter_mut() {
        *sample *= gain;
    }
}

// Removed generate_with_modulation function as its logic is now in Operator::process

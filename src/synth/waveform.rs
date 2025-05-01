use crate::synth::prelude::{random_range, PI};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Waveform {
    Sine,
    Square,
    Sawtooth,
    SawtoothSmooth,
    Triangle,
    Noise,
    Input,
}

#[derive(Debug, Clone)] // Added Debug and Clone
pub struct WaveformGenerator {
    pub waveform: Waveform, // Made public for inspection/logging if needed
}

impl WaveformGenerator {
    pub fn new(waveform: Waveform) -> Self {
        Self { waveform }
    }
    pub fn evaluate(&self, phase: f32) -> f32 {
        match self.waveform {
            Waveform::Sine => phase.sin(),
            Waveform::Square => {
                if phase.sin() >= 0.0 {
                    1.0
                } else {
                    -1.0
                }
            }
            Waveform::Sawtooth => {
                let cycles = phase / (2.0 * PI);
                2.0 * (cycles - (cycles + 0.5).floor())
            }
            Waveform::SawtoothSmooth => 0.75 * phase.sin() / (1.25 + phase.cos()),
            Waveform::Triangle => (2.0 / PI) * (phase.sin()).asin(),
            Waveform::Noise => random_range(-1.0, 1.0),
            Waveform::Input => 0.0,
        }
    }
    pub fn generate(
        &self,
        frequency: f32,
        sample_rate: f32,
        // TODO: externally should wrap phase_offset if it grows large -- phase_offset = phase_offset % (2.0 * std::f32::consts::PI)
        phase_offset: f32,
        output: &mut [f32],
        modulation: &[f32],
    ) {
        // TODO: this implementation relies on slightly more expensive transcendental functions such as asin()
        // in the future may want to look into modulo arithmetic and other optimizations (PolyBLEP etc.)
        let generate_wave = match self.waveform {
            Waveform::Sine => |phase: f32| phase.sin(),
            Waveform::Square => |phase: f32| if phase.sin() >= 0.0 { 1.0 } else { -1.0 },
            Waveform::Sawtooth => |phase: f32| {
                let cycles = phase / (2.0 * PI);
                2.0 * (cycles - (cycles + 0.5).floor())
            },
            Waveform::SawtoothSmooth => |phase: f32| 0.75 * phase.sin() / (1.25 + phase.cos()),
            Waveform::Triangle => |phase: f32| (2.0 / PI) * (phase.sin()).asin(),
            Waveform::Noise => |_phase: f32| random_range(-1.0, 1.0),
            Waveform::Input => |_phase: f32| 0.0,
        };

        let phase_increment = 2.0 * PI * frequency / sample_rate;

        for (i, sample) in output.iter_mut().enumerate() {
            let current_phase = phase_offset + phase_increment * (i as f32);
            *sample = generate_wave(current_phase + modulation[i]);
        }
    }
    pub fn get_next_waveform(&mut self) {
        self.waveform = match self.waveform {
            Waveform::Noise => Waveform::Sine,
            Waveform::Sine => Waveform::Square,
            Waveform::Square => Waveform::Sawtooth,
            Waveform::Sawtooth => Waveform::SawtoothSmooth,
            Waveform::SawtoothSmooth => Waveform::Triangle,
            Waveform::Triangle => Waveform::Noise,
            // TODO: fix none
            Waveform::Input => Waveform::Noise,
        };
    }
    pub fn get_previous_waveform(&mut self) {
        self.waveform = match self.waveform {
            Waveform::Noise => Waveform::Triangle,
            Waveform::Sine => Waveform::Noise,
            Waveform::Square => Waveform::Sine,
            Waveform::Sawtooth => Waveform::Square,
            Waveform::SawtoothSmooth => Waveform::Sawtooth,
            Waveform::Triangle => Waveform::SawtoothSmooth,
            //TODO:fix none
            Waveform::Input => Waveform::Noise,
        };
    }
    pub fn set_waveform(&mut self, waveform: Waveform) {
        self.waveform = waveform;
    }
    pub fn get_waveform(&self) -> Waveform {
        self.waveform
    }
}

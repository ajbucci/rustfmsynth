use crate::synth::note::{NoteEvent, NoteSource};
use crate::synth::waveform::Waveform;
use crate::synth::Synth;
use js_sys::Float32Array;
use wasm_bindgen::prelude::*;

/// WASM Synth runtime (no threads, no channels, direct API)
#[wasm_bindgen]
pub struct WasmSynth {
    synth: Synth,
    temp_buffer: Vec<f32>,
}

#[wasm_bindgen]
impl WasmSynth {
    #[wasm_bindgen(constructor)]
    pub fn new() -> WasmSynth {
        WasmSynth {
            synth: Synth::new(),
            temp_buffer: Vec::new(),
        }
    }

    /// Render audio buffer into a JS-friendly Float32Array
    #[wasm_bindgen]
    pub fn render(&mut self, length: usize, sample_rate: f32) -> Float32Array {
        if self.temp_buffer.len() != length {
            self.temp_buffer = vec![0.0; length];
        }
        self.synth.process(&mut self.temp_buffer, sample_rate);

        // Return a view without copy
        Float32Array::from(self.temp_buffer.as_slice())
    }

    #[wasm_bindgen]
    pub fn note_on(&mut self, note: u8, velocity: u8) {
        if let Ok(event) = NoteEvent::new(note, velocity, true, NoteSource::Midi) {
            self.synth.note_on(&event);
        }
    }

    #[wasm_bindgen]
    pub fn note_off(&mut self, note: u8) {
        if let Ok(event) = NoteEvent::new(note, 0, false, NoteSource::Midi) {
            self.synth.note_off(&event);
        }
    }

    #[wasm_bindgen]
    pub fn set_operator_ratio(&mut self, operator_index: usize, ratio: f32) {
        self.synth.set_operator_ratio(operator_index, ratio);
    }

    /// Set the waveform for a specific operator using an integer code from JS.
    /// Mapping: 0: Sine, 1: Triangle, 2: Square, 3: Sawtooth, 4: Noise
    #[wasm_bindgen]
    pub fn set_operator_waveform(&mut self, operator_index: usize, waveform_value: u8) {
        let waveform = match waveform_value {
            0 => Waveform::Sine,
            1 => Waveform::Triangle,
            2 => Waveform::Square,
            3 => Waveform::Sawtooth,
            4 => Waveform::Noise,
            _ => {
                eprintln!(
                    "WasmSynth Error: Invalid waveform value received: {}",
                    waveform_value
                );
                // Optionally default to Sine or return without changing
                Waveform::Sine // Defaulting to Sine on invalid input
                // return; // Alternative: do nothing if value is invalid
            }
        };

        // Call the core synth method with the mapped enum
        self.synth.set_operator_waveform(operator_index, waveform);
    }

    #[wasm_bindgen]
    pub fn set_operator_modulation_index(&mut self, operator_index: usize, modulation_index: f32) {
        self.synth.set_operator_modulation_index(operator_index, modulation_index);
    }

    #[wasm_bindgen]
    pub fn set_buffer_size(&mut self, buffer_size: usize) {
        self.synth.set_buffer_size(buffer_size);
        self.temp_buffer = vec![0.0; buffer_size];
    }
}

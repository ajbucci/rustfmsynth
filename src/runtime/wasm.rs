use crate::synth::filter::{Filter, FilterType};
use crate::synth::note::{NoteEvent, NoteSource};
use crate::synth::waveform::Waveform;
use crate::synth::Synth;
use js_sys::Float32Array;
use serde_wasm_bindgen;
use wasm_bindgen::prelude::*;
extern crate web_sys;
/// WASM Synth runtime (no threads, no channels, direct API)
#[wasm_bindgen]
pub struct WasmSynth {
    synth: Synth,
    temp_buffer: Vec<f32>,
    sample_rate: f32,
}

#[wasm_bindgen]
impl WasmSynth {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> WasmSynth {
        WasmSynth {
            synth: Synth::new(),
            temp_buffer: Vec::new(),
            sample_rate,
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

    #[wasm_bindgen]
    pub fn set_operator_filter_lowpass(&mut self, operator_index: usize, cutoff: f32, q: f32) {
        let filter = Filter::new_lowpass_biquad(cutoff, self.sample_rate);
        self.synth.set_operator_filter(operator_index, filter);

        web_sys::console::log_1(&12.into()); // LowPass Set OK
    }
    #[wasm_bindgen]
    pub fn set_operator_filter_comb(&mut self, operator_index: usize, alpha: f32, k: usize) {
        let filter = Filter::new_comb(alpha, k);
        self.synth.set_operator_filter(operator_index, filter);

        web_sys::console::log_1(&12.into()); // LowPass Set OK
    }
    #[wasm_bindgen]
    pub fn set_operator_filter_pitched_comb(&mut self, operator_index: usize, alpha: f32) {
        let filter = Filter::new_pitched_comb(alpha);
        self.synth.set_operator_filter(operator_index, filter);

        web_sys::console::log_1(&12.into()); // LowPass Set OK
    }
    #[wasm_bindgen]
    pub fn remove_operator_filter_lowpass(&mut self, operator_index: usize) {
        self.synth
            .remove_operator_filter(operator_index, FilterType::LowPassBiquad);
        web_sys::console::log_1(&13.into()); // LowPass Set OK
    }
    #[wasm_bindgen]
    pub fn remove_operator_filter_comb(&mut self, operator_index: usize) {
        self.synth
            .remove_operator_filter(operator_index, FilterType::Comb);
        web_sys::console::log_1(&13.into()); // LowPass Set OK
    }
    #[wasm_bindgen]
    pub fn remove_operator_filter_pitched_comb(&mut self, operator_index: usize) {
        self.synth
            .remove_operator_filter(operator_index, FilterType::PitchedComb);
        web_sys::console::log_1(&13.into()); // LowPass Set OK
    }
    #[wasm_bindgen]
    pub fn set_operator_envelope(&mut self, operator_index: usize, a: f32, d: f32, s: f32, r: f32) {
        self.synth.set_operator_envelope(operator_index, a, d, s, r);
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
            5 => Waveform::Input,
            _ => {
                eprintln!(
                    "WasmSynth Error: Invalid waveform value received: {}",
                    waveform_value
                );
                Waveform::Sine // Defaulting to Sine on invalid input
            }
        };
        self.synth.set_operator_waveform(operator_index, waveform);
    }

    #[wasm_bindgen]
    pub fn set_operator_modulation_index(&mut self, operator_index: usize, modulation_index: f32) {
        self.synth
            .set_operator_modulation_index(operator_index, modulation_index);
    }

    #[wasm_bindgen]
    pub fn set_buffer_size(&mut self, buffer_size: usize) {
        self.synth.set_buffer_size(buffer_size);
        self.temp_buffer = vec![0.0; buffer_size];
    }

    /// Accepts the combined algorithm matrix (connections + carriers) from JavaScript.
    /// Expects a JsValue representing a number[][] (specifically Vec<Vec<u32>>).
    /// Dimensions: opCount x (opCount + 1)
    #[wasm_bindgen]
    pub fn set_algorithm(&mut self, combined_matrix_js: JsValue) {
        match serde_wasm_bindgen::from_value::<Vec<Vec<u32>>>(combined_matrix_js) {
            Ok(combined_matrix) => {
                // Pass a slice reference (&[Vec<u32>]) as expected by Synth::set_algorithm
                self.synth.set_algorithm(&combined_matrix);
            }
            Err(e) => {
                eprintln!(
                    "WasmSynth Error: Failed to deserialize algorithm matrix: {}",
                    e
                );
            }
        }
    }
}

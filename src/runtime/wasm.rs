use super::wasm_serialize::{CombParams, LowPassParams, PitchedCombParams};
use crate::synth::filter::Filter;
use crate::synth::note::{NoteEvent, NoteSource};
use crate::synth::waveform::Waveform;
use crate::synth::Synth;
use js_sys::{Float32Array, Object};
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
    pub fn set_operator_filter(
        &mut self,
        operator_index: usize,
        filter_value: u8, // e.g., 0=LP, 1=Comb, 2=PitchedComb, 3=None
        params: JsValue,  // The JSON object like { cutoff: 1k, q: 1 } or { alpha: 0.5, k: 100 }
    ) {
        // web_sys::console::log_1(&operator_index.into());
        web_sys::console::log_1(&filter_value.into());
        web_sys::console::log_1(&params);
        match filter_value {
            0 => {
                web_sys::console::log_1(&filter_value.into());
                match serde_wasm_bindgen::from_value::<LowPassParams>(params) {
                    Ok(p) => {
                        web_sys::console::log_1(&"Deserialization succeeded".into());
                    }
                    Err(e) => {
                        web_sys::console::log_1(&format!("Deserialization failed: {}", e).into());
                    }
                };
                web_sys::console::log_1(&"After".into());
            }
            _ => {
                web_sys::console::log_1(&"Errorish".into());
            }
        }
        // let new_filter_result: Result<Filter, String> = match filter_value {
        //     // _ => {
        //     //     web_sys::console::log_1(
        //     //         &format!("Inside match: filter_value is {}", filter_value).into(),
        //     //     );
        //     // } // Temporary default arm
        //     0 => {
        //         // Low Pass
        //         serde_wasm_bindgen::from_value::<LowPassParams>(params)
        //             .map_err(|e| format!("Deserialize LowPassParams failed: {}", e))
        //             .map(|p| {
        //                 Filter::new_lowpass_biquad(p.cutoff, self.sample_rate)
        //             })
        //     }
        //     1 => {
        //         // Comb
        //         serde_wasm_bindgen::from_value::<CombParams>(params)
        //             .map_err(|e| format!("Deserialize CombParams failed: {}", e))
        //             .map(|p| {
        //                 // Use params 'p' to create the state
        //                 Filter::new_comb(p.alpha, p.k)
        //             })
        //     }
        //     2 => {
        //         // Pitched Comb
        //         serde_wasm_bindgen::from_value::<PitchedCombParams>(params)
        //             .map_err(|e| format!("Deserialize PitchedCombParams failed: {}", e))
        //             .map(|p| {
        //                 // Use param 'p.alpha'. Frequency is set at note_on,
        //                 Filter::new_pitched_comb(p.alpha)
        //             })
        //     }
        //     // 3 => {
        //     //     // None
        //     //     // Params object might be empty or null, ignore it.
        //     //     Ok(Filter::new_none())
        //     // }
        //     _ => {
        //         Err(format!("Unknown filter_value: {}", filter_value))
        //     }
        // };
        //
        // match new_filter_result {
        //     Ok(filter) => {
        //         // Get mutable access to the Operator (might need error handling)
        //         self.synth.set_operator_filter(operator_index, filter);
        //     }
        //     Err(e) => {
        //         eprintln!("WasmSynth Error: Failed to create filter: {}", e);
        //     }
        // }
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

use crate::synth::core::EffectSlot;
use crate::synth::filter::{Filter, FilterType};
use crate::synth::note::{NoteEvent, NoteSource};
use crate::synth::waveform::Waveform;
use crate::synth::Synth;
use core::str;
use js_sys::Float32Array;
use serde::Deserialize;
use serde_wasm_bindgen;
use wasm_bindgen::prelude::*;
// #[wasm_bindgen]
// extern "C" {
//     #[wasm_bindgen(js_namespace = console)]
//     fn log(s: &str);
// }
// macro_rules! console_log {
//     // Note that this is using the `log` function imported above during
//     // `bare_bones`
//     ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
// }
/// WASM Synth runtime (no threads, no channels, direct API)
#[derive(Deserialize, Debug, Clone)]
pub struct LowPassParams {
    cutoff: f32,
    #[allow(dead_code)]
    q: f32,
}
#[derive(Deserialize, Debug, Clone)]
pub struct CombParams {
    alpha: f32,
    k: usize,
}
#[derive(Deserialize, Debug, Clone)]
pub struct PitchedCombParams {
    alpha: f32,
}
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReverbParams {
    predelay_ms: f32,
    decay_ms: f32,
    wet_mix: f32,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(tag = "type", content = "params")]
pub enum FilterParams {
    LowPass(LowPassParams),
    Comb(CombParams),
    PitchedComb(PitchedCombParams),
}
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
    pub fn set_master_volume(&mut self, volume: f32) {
        self.synth.set_master_volume(volume);
    }

    #[wasm_bindgen]
    pub fn set_operator_ratio(&mut self, operator_index: usize, ratio: f32) {
        self.synth.set_operator_ratio(operator_index, ratio);
    }

    #[wasm_bindgen]
    pub fn set_operator_fixed_frequency(&mut self, operator_index: usize, frequency: f32) {
        self.synth
            .set_operator_fixed_frequency(operator_index, frequency);
    }
    #[wasm_bindgen]
    pub fn set_operator_detune(&mut self, operator_index: usize, detune: f32) {
        self.synth.set_operator_detune(operator_index, detune);
    }
    #[wasm_bindgen]
    pub fn set_operator_filter(&mut self, operator_index: usize, params_bytes: &[u8]) {
        let filter_params: FilterParams = serde_json::from_slice(params_bytes)
            .expect("PANIC: Tagged JSON deserialize FilterParams failed");

        let filter = match filter_params {
            FilterParams::LowPass(p) => Filter::new_lowpass_biquad(p.cutoff, self.sample_rate),
            FilterParams::Comb(p) => Filter::new_comb(p.alpha, p.k),
            FilterParams::PitchedComb(p) => Filter::new_pitched_comb(p.alpha),
        };

        self.synth.set_operator_filter(operator_index, filter);
    }
    #[wasm_bindgen]
    pub fn set_effect_reverb(&mut self, params_bytes: &[u8], effect_slot: usize) {
        let reverb_params: ReverbParams = serde_json::from_slice(params_bytes)
            .expect("PANIC: Tagged JSON deserialize ReverbParams failed");
        let ReverbParams {
            predelay_ms,
            decay_ms,
            wet_mix,
        } = reverb_params;
        self.synth.set_effect_reverb(
            predelay_ms,
            decay_ms,
            wet_mix,
            match effect_slot {
                2 => EffectSlot::Two,
                3 => EffectSlot::Three,
                _ => EffectSlot::One,
            },
        )
    }
    #[wasm_bindgen]
    pub fn remove_effect(&mut self, effect_slot: usize) {
        self.synth.remove_effect(match effect_slot {
            2 => EffectSlot::Two,
            3 => EffectSlot::Three,
            _ => EffectSlot::One,
        });
    }
    #[wasm_bindgen]
    pub fn remove_operator_filter(&mut self, operator_index: usize, filter_type_bytes: &[u8]) {
        let filter_type_str = str::from_utf8(filter_type_bytes);
        let filter_type = match filter_type_str {
            Ok("LowPass") => FilterType::LowPassBiquad,
            Ok("Comb") => FilterType::Comb,
            Ok("PitchedComb") => FilterType::PitchedComb,
            _ => {
                eprintln!("WasmSynth Error: Invalid filter type received");
                return;
            }
        };
        self.synth
            .remove_operator_filter(operator_index, filter_type);
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

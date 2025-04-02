use crate::synth::note::{NoteEvent, NoteSource};
use crate::synth::operator::{CycleDirection, OperatorEvent};
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
    pub fn process_operator_event(&mut self, event_code: u8) {
        let event = OperatorEvent::CycleWaveform {
            direction: if event_code == 0 {
                CycleDirection::Backward
            } else {
                CycleDirection::Forward
            },
        };
        self.synth.process_operator_events(&event);
    }

    #[wasm_bindgen]
    pub fn set_buffer_size(&mut self, buffer_size: usize) {
        self.synth.set_buffer_size(buffer_size);
        self.temp_buffer = vec![0.0; buffer_size];
    }
}

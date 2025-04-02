use crate::synth::note::{NoteEvent, NoteSource};
use crate::synth::operator::{CycleDirection, OperatorEvent};
use device_query::{DeviceQuery, DeviceState, Keycode};
use std::collections::HashMap;
use std::sync::mpsc::Sender;

pub struct KeyboardHandler {
    device_state: DeviceState,
    key_states: HashMap<Keycode, bool>,
    key_to_note: HashMap<Keycode, u8>,
    control_keys: HashMap<Keycode, bool>, // Track control keys separately
    note_sender: Sender<NoteEvent>,
    operator_sender: Sender<OperatorEvent>,
}

impl KeyboardHandler {
    pub fn new(note_sender: Sender<NoteEvent>, operator_sender: Sender<OperatorEvent>) -> Self {
        let device_state = DeviceState::new();
        let mut key_states: HashMap<Keycode, bool> = HashMap::new();
        let mut control_keys: HashMap<Keycode, bool> = HashMap::new();

        // Define keyboard to note mapping
        let key_to_note: HashMap<Keycode, u8> = [
            // Bottom row - natural notes (A, B, C, D, E, F, G, A, B, C)
            (Keycode::A, 57),         // A3
            (Keycode::S, 59),         // B3
            (Keycode::D, 60),         // C4
            (Keycode::F, 62),         // D4
            (Keycode::G, 64),         // E4
            (Keycode::H, 65),         // F4
            (Keycode::J, 67),         // G4
            (Keycode::K, 69),         // A4
            (Keycode::L, 71),         // B4
            (Keycode::Semicolon, 72), // C5
            // Top row - sharp/flat notes
            (Keycode::W, 58),           // A#3/Bb3
            (Keycode::R, 61),           // C#4/Db4
            (Keycode::T, 63),           // D#4/Eb4
            (Keycode::U, 66),           // F#4/Gb4
            (Keycode::I, 68),           // G#4/Ab4
            (Keycode::O, 70),           // A#4/Bb4
            (Keycode::LeftBracket, 73), // C#5/Db5
        ]
        .iter()
        .cloned()
        .collect();

        // Initialize all keys as not pressed
        for key in key_to_note.keys() {
            key_states.insert(*key, false);
        }

        // Initialize control keys
        control_keys.insert(Keycode::Comma, false);
        control_keys.insert(Keycode::Dot, false);

        Self {
            device_state,
            key_states,
            key_to_note,
            control_keys,
            note_sender,
            operator_sender,
        }
    }

    pub fn update(&mut self) {
        let keys: Vec<Keycode> = self.device_state.get_keys();

        // Check each mapped key for notes
        for (key, note) in &self.key_to_note {
            let is_pressed = keys.contains(key);
            let was_pressed = self.key_states.get(key).cloned().unwrap_or(false);

            if is_pressed != was_pressed {
                if is_pressed {
                    println!(
                        "Key '{:?}' pressed - sending note on for note {}",
                        key, note
                    );
                    if let Ok(event) = NoteEvent::new(*note, 100, true, NoteSource::Keyboard) {
                        if let Err(e) = self.note_sender.send(event) {
                            eprintln!("Error sending note on event: {}", e);
                        }
                    }
                } else {
                    println!(
                        "Key '{:?}' released - sending note off for note {}",
                        key, note
                    );
                    if let Ok(event) = NoteEvent::new(*note, 0, false, NoteSource::Keyboard) {
                        if let Err(e) = self.note_sender.send(event) {
                            eprintln!("Error sending note off event: {}", e);
                        }
                    }
                }
                self.key_states.insert(*key, is_pressed);
            }
        }

        // Check control keys for waveform cycling
        for key in [Keycode::Comma, Keycode::Dot].iter() {
            let is_pressed = keys.contains(key);
            let was_pressed = self.control_keys.get(key).cloned().unwrap_or(false);

            if is_pressed && !was_pressed {
                // Key just pressed
                match key {
                    Keycode::Comma => {
                        println!("Cycling waveform backward");
                        if let Err(e) = self.operator_sender.send(OperatorEvent::CycleWaveform {
                            direction: CycleDirection::Backward,
                        }) {
                            eprintln!("Error sending operator event: {}", e);
                        }
                    }
                    Keycode::Dot => {
                        println!("Cycling waveform forward");
                        if let Err(e) = self.operator_sender.send(OperatorEvent::CycleWaveform {
                            direction: CycleDirection::Forward,
                        }) {
                            eprintln!("Error sending operator event: {}", e);
                        }
                    }
                    _ => {}
                }
            }

            self.control_keys.insert(*key, is_pressed);
        }
    }
}

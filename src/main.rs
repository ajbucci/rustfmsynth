use rustfmsynth::audio::{AudioBackend, CpalBackend};
use rustfmsynth::input::KeyboardHandler;
use rustfmsynth::input::MidiHandler;
use rustfmsynth::synth::engine::SynthEngine;
use std::sync::{Arc, Mutex};

fn main() {
    // Create a shared synth engine
    let synth_engine = Arc::new(Mutex::new(SynthEngine::new()));

    // Create and start audio backend
    let mut audio_backend = CpalBackend::new_with_engine(synth_engine.clone());
    audio_backend.start();

    // Set up keyboard input
    let mut keyboard_handler = KeyboardHandler::new();

    // Set up midi input (will be disabled if initialization fails)
    let mut midi_handler = MidiHandler::new();

    // Main loop for keyboard handling
    loop {
        // Lock the synth engine once per frame
        let mut engine = synth_engine.lock().unwrap();

        // Update keyboard state and send note events
        keyboard_handler.update(&mut engine);
        midi_handler.update(&mut engine);

        // Release the lock
        drop(engine);

        std::thread::sleep(std::time::Duration::from_millis(10));
    }
}

use crate::audio::{AudioBackend, CpalBackend};
use crate::input::{KeyboardHandler, MidiHandler};
use crate::synth::note::NoteEvent;
use crate::synth::operator::OperatorEvent;
use crate::synth::Synth;
use std::sync::mpsc::channel;
use std::sync::mpsc::Receiver;
use std::sync::{Arc, Mutex};
/// Native runtime synth implementation for desktop/CPAL backends.
pub struct NativeSynth {
    synth: Synth,
    note_receiver: Receiver<NoteEvent>,
    operator_receiver: Receiver<OperatorEvent>,
}

impl NativeSynth {
    pub fn new(
        note_receiver: Receiver<NoteEvent>,
        operator_receiver: Receiver<OperatorEvent>,
    ) -> Self {
        Self {
            synth: Synth::new(),
            note_receiver,
            operator_receiver,
        }
    }

    pub fn process(&mut self, output: &mut [f32], sample_rate: f32) {
        self.process_note_events();
        self.process_operator_events();
        self.synth.process(output, sample_rate);
    }

    fn process_note_events(&mut self) {
        while let Ok(event) = self.note_receiver.try_recv() {
            if event.is_on {
                self.synth.note_on(&event);
            } else {
                self.synth.note_off(&event);
            }
        }
    }

    fn process_operator_events(&mut self) {
        while let Ok(event) = self.operator_receiver.try_recv() {
            self.synth.process_operator_events(&event);
        }
    }
    pub fn set_buffer_size(&mut self, buffer_size: usize) {
        self.synth.set_buffer_size(buffer_size);
    }
}

pub fn start() {
    let (note_tx, note_rx) = channel();
    let (op_tx, op_rx) = channel();

    let synth = Arc::new(Mutex::new(NativeSynth::new(note_rx, op_rx)));

    let mut audio_backend = CpalBackend::new(synth.clone());
    audio_backend.start();

    let mut keyboard_handler = KeyboardHandler::new(note_tx.clone(), op_tx.clone());
    let mut midi_handler = MidiHandler::new(note_tx);

    loop {
        {
            keyboard_handler.update();
            midi_handler.update();
        }
    }
}

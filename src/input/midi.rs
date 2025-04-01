use crate::synth::engine::SynthEngine;
use crate::synth::note::{NoteEvent, NoteSource};
use midir::{MidiInput, MidiInputConnection, MidiInputPort};
use std::error::Error;
use std::io::{stdin, stdout, Write};
use std::sync::mpsc::{self, Receiver};

pub struct MidiHandler {
    connection: MidiInputConnection<()>,
    receiver: Receiver<(u8, u8, u8)>, // (status, data1, data2)
}

impl MidiHandler {
    pub fn new() -> Result<Self, Box<dyn Error>> {
        let midi_in = MidiInput::new("RustFMSynth Input")?;
        let port = Self::select_input_port(&midi_in)?;
        let port_name = midi_in.port_name(&port)?; // <-- get port name BEFORE connect

        let (sender, receiver) = mpsc::channel();

        let connection = midi_in.connect(
            &port,
            "midir-read-input",
            move |_, message, _| {
                if message.len() >= 3 {
                    let _ = sender.send((message[0], message[1], message[2]));
                }
            },
            (),
        )?;

        println!("Opened MIDI port: {}", port_name);

        Ok(Self {
            connection,
            receiver,
        })
    }

    fn select_input_port(midi_in: &MidiInput) -> Result<MidiInputPort, Box<dyn Error>> {
        let in_ports = midi_in.ports();
        if in_ports.is_empty() {
            return Err("No MIDI input ports found".into());
        }

        println!("Available MIDI input ports:");
        for (i, port) in in_ports.iter().enumerate() {
            println!("{}: {}", i, midi_in.port_name(port)?);
        }

        print!("Select MIDI input port: ");
        stdout().flush()?;
        let mut input = String::new();
        stdin().read_line(&mut input)?;
        let selection = input.trim().parse::<usize>().unwrap_or(0);

        let port = in_ports
            .get(selection)
            .ok_or("Invalid MIDI port selection")?
            .clone();

        Ok(port)
    }

    pub fn update(&mut self, engine: &mut SynthEngine) {
        while let Ok((status, data1, data2)) = self.receiver.try_recv() {
            let note_on = status & 0xF0 == 0x90 && data2 > 0;
            let note_off = (status & 0xF0 == 0x80) || (status & 0xF0 == 0x90 && data2 == 0);

            if note_on {
                // println!("MIDI Note ON: {} Vel {}", data1, data2);
                if let Ok(event) = NoteEvent::new(data1, data2, true, NoteSource::Midi) {
                    let _ = engine.get_note_sender().send(event);
                }
            } else if note_off {
                // println!("MIDI Note OFF: {}", data1);
                if let Ok(event) = NoteEvent::new(data1, 0, false, NoteSource::Midi) {
                    let _ = engine.get_note_sender().send(event);
                }
            }
        }
    }
}

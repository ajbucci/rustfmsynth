use super::algorithm::Algorithm;
use super::context::ProcessContext;
// use super::envelope::EnvelopeGenerator;
use super::note::{NoteEvent, NoteSource};
use super::operator::{Operator, OperatorState};
use super::voice_config::VoiceConfig;

/// Represents a single polyphonic voice in the synthesizer.
/// TODO: add VoiceState and NoteState to keep more organized?
pub struct Voice {
    node_states: Vec<OperatorState>, // State for the operator (e.g., phase, frequency ratio)
    pub active: bool,                // Is the voice currently playing a note?
    pub releasing: bool,             // If the voice is playing a note, has it been released yet?
    pub note_number: u8,             // MIDI note number (0-127)
    pub note_frequency: f32,         // Frequency derived from note_number
    pub note_velocity: u8,           // MIDI velocity (0-127)
    pub note_source: Option<NoteSource>, // Where the note came from (keyboard, sequencer)
    velocity_scale: f32,             // Relative velocity of the note (0.0-1.0)
    // envelope: EnvelopeGenerator, // Main amplitude envelope for the voice
    samples_elapsed_since_trigger: u64, // Counter for phase calculation
    note_off_sample_index: Option<u64>, // Sample index when the note was released
    config: VoiceConfig,                // Configuration for the voice
}

impl Voice {
    /// Creates a new, inactive voice.
    pub fn new(num_nodes: usize) -> Self {
        Self {
            node_states: vec![OperatorState::default(); num_nodes],
            active: false,
            releasing: false,
            note_number: 0,
            note_frequency: 0.0, // Will be set on activation
            note_source: None,
            note_velocity: 0,
            velocity_scale: 0.0,
            // envelope: EnvelopeGenerator::new(),
            samples_elapsed_since_trigger: 0,
            note_off_sample_index: None,
            config: VoiceConfig::default(),
        }
    }
    /// Fully resets the voice to an inactive state.
    pub fn reset(&mut self) {
        self.active = false;
        self.releasing = false;
        self.note_number = 0;
        self.note_frequency = 0.0;
        self.note_velocity = 0;
        self.velocity_scale = 0.0;
        self.note_source = None;
        self.samples_elapsed_since_trigger = 0;
        self.note_off_sample_index = None;
        self.node_states.iter_mut().for_each(|state| {
            *state = OperatorState::default();
        });
    }
    /// Activates the voice for a given note.
    /// Resets the sample counter and triggers the envelope.
    pub fn activate(&mut self, note_event: &NoteEvent, config: &VoiceConfig) {
        self.reset();
        self.active = true;
        self.note_number = note_event.note_number;
        self.note_source = Some(note_event.source);
        self.note_frequency = note_event.frequency;
        self.note_velocity = note_event.velocity;
        self.velocity_scale = config.velocity_to_scale(self.note_velocity);
        self.config = config.clone();

        // self.envelope
        //     .set_params(config.attack, config.decay, config.sustain, config.release);
        //
        println!(
            "Voice activated note {}, sample counter reset",
            self.note_number
        );
    }

    /// Initiates the release phase of the voice's main envelope.
    pub fn release(&mut self) {
        if !self.releasing {
            self.releasing = true;
            self.note_off_sample_index = Some(self.samples_elapsed_since_trigger);
            println!("Voice released note {}", self.note_number);
        }
    }
    /// Called by Synth when the global algorithm changes.
    /// Resizes the internal state vector to match the new algorithm structure.
    pub fn update_algorithm(&mut self, algorithm: &Algorithm) {
        let new_len = algorithm.length();
        // Resize the state vector. This might discard existing state,
        // which is often desired for phase/filters when structure changes.
        // Or, you could try to intelligently preserve state if nodes match,
        // but that adds significant complexity. Resetting is simpler.
        self.node_states.clear(); // Clear existing state
        self.node_states
            .resize_with(new_len, OperatorState::default); // Resize and fill with defaults
    }
    /// Processes a buffer of audio for this voice using the provided algorithm and operators.
    /// `algorithm`: The FM algorithm defining operator connections.
    /// `operators`: The set of operators configured in the SynthEngine.
    /// `output`: The buffer to add this voice's contribution to.
    /// `sample_rate`: The audio sample rate.
    pub fn process(
        &mut self,
        algorithm: &Algorithm,
        operators: &[Operator],
        output: &mut [f32],
        sample_rate: f32,
    ) {
        let context = ProcessContext {
            sample_rate,
            base_frequency: self.note_frequency,
            samples_elapsed_since_trigger: self.samples_elapsed_since_trigger,
            note_off_sample_index: self.note_off_sample_index,
            operators,
            velocity_scale: self.velocity_scale,
        };

        // If the voice is fully finished (inactive AND envelope done), skip processing.
        if self.is_finished(algorithm, &context) {
            self.reset();
            return;
        }
        algorithm.process(&context, &mut self.node_states, output);

        let buffer_len = output.len();
        for i in 0..buffer_len {
            // let samples_at_this_point = self.samples_elapsed_since_trigger + i as u64;
            // let time_on = samples_at_this_point as f32 / sample_rate;
            // let time_off = self
            //     .note_off_sample_index
            //     .map(|off| samples_at_this_point.saturating_sub(off) as f32 / sample_rate);

            // let env_value = self.envelope.evaluate(time_on, time_off);
            // output[i] *= env_value * self.velocity_scale;
            output[i] *= self.velocity_scale;
        }

        self.samples_elapsed_since_trigger += buffer_len as u64;

        if self.releasing && self.is_finished(algorithm, &context) {
            println!("Voice fully inactive (note {} released)", self.note_number);
            self.reset();
        }
    }

    /// Checks if the voice is completely finished (inactive and envelope has finished).
    pub fn is_finished(&self, algorithm: &Algorithm, context: &ProcessContext) -> bool {
        algorithm.finished(context)
    }
}

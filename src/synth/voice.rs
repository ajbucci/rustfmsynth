use super::algorithm::Algorithm;
use super::envelope::EnvelopeGenerator;
use super::note::{NoteEvent, NoteSource};
use super::operator::{Operator, OperatorState};
use super::voice_config::VoiceConfig;

/// Represents a single polyphonic voice in the synthesizer.
/// TODO: add VoiceState and NoteState to keep more organized?
pub struct Voice {
    operator_states: Vec<OperatorState>, // State for the operator (e.g., phase, frequency ratio)
    pub active: bool,                    // Is the voice currently playing a note?
    pub releasing: bool, // If the voice is playing a note, has it been released yet?
    pub note_number: u8, // MIDI note number (0-127)
    pub note_frequency: f32, // Frequency derived from note_number
    pub note_velocity: u8, // MIDI velocity (0-127)
    pub note_source: Option<NoteSource>, // Where the note came from (keyboard, sequencer)
    velocity_scale: f32, // Relative velocity of the note (0.0-1.0)
    envelope: EnvelopeGenerator, // Main amplitude envelope for the voice
    samples_elapsed_since_trigger: u64, // Counter for phase calculation
    note_off_sample_index: Option<u64>, // Sample index when the note was released
    config: VoiceConfig, // Configuration for the voice
}

impl Voice {
    /// Creates a new, inactive voice.
    pub fn new(num_operators: usize) -> Self {
        Self {
            active: false,
            releasing: false,
            note_number: 0,
            note_frequency: 0.0, // Will be set on activation
            note_source: None,
            note_velocity: 0,
            velocity_scale: 0.0,
            envelope: EnvelopeGenerator::new(),
            samples_elapsed_since_trigger: 0,
            note_off_sample_index: None,
            config: VoiceConfig::default(),
            operator_states: vec![OperatorState::default(); num_operators],
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
        self.operator_states.iter_mut().for_each(|state| {
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

        self.envelope
            .set_params(config.attack, config.decay, config.sustain, config.release);

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

    /// Processes a buffer of audio for this voice using the provided algorithm and operators.
    /// `algorithm`: The FM algorithm defining operator connections.
    /// `operators`: The set of operators configured in the SynthEngine.
    /// `output`: The buffer to add this voice's contribution to.
    /// `sample_rate`: The audio sample rate.
    pub fn process(
        &mut self,
        algorithm: &Algorithm,  // Pass algorithm
        operators: &[Operator], // Pass operators slice
        output: &mut [f32],     // Note: This should likely be additive or cleared upstream
        sample_rate: f32,
    ) {
        // If the voice is fully finished (inactive AND envelope done), skip processing.
        if self.is_finished(sample_rate) {
            self.reset();
            return;
        }

        let buffer_len = output.len();
        if buffer_len == 0 {
            return; // Nothing to process
        }

        // Store the sample index corresponding to the START of this buffer.
        let start_sample_index = self.samples_elapsed_since_trigger;
        let samples_since_note_off = self
            .note_off_sample_index
            .map(|off| start_sample_index.saturating_sub(off));

        // --- Generate Raw Audio using Algorithm and Operators ---
        // Create a temporary buffer for the raw operator output before enveloping.
        let mut raw_output = vec![0.0; buffer_len];
        algorithm.process(
            operators, // Pass the operators slice
            self.note_frequency,
            &mut raw_output, // Generate into the temporary buffer
            sample_rate,
            start_sample_index,
            samples_since_note_off,
            &mut self.operator_states,
        );

        // --- Apply Main Voice Envelope ---
        // Apply the overall envelope to the raw generated sound.
        // --- Add to Final Output ---
        // Add the enveloped sound of this voice to the main output buffer.
        // Assumes the main output buffer might contain other voices.
        for i in 0..buffer_len {
            // Additive mixing
            let time_since_on = (start_sample_index + i as u64) as f32 / sample_rate;
            let time_since_off = self.note_off_sample_index.map(|off_sample| {
                (start_sample_index + i as u64 - off_sample) as f32 / sample_rate
            });

            let env_value =
                self.velocity_scale * self.envelope.evaluate(time_since_on, time_since_off);
            output[i] += raw_output[i] * env_value;
        }

        // --- Update State & Increment Counter ---

        // Increment the sample counter *after* processing this buffer.
        self.samples_elapsed_since_trigger += buffer_len as u64;
        // Check if envelope has finished
        if self.releasing && self.is_finished(sample_rate) {
            println!("Voice fully inactive (note {} released)", self.note_number);
            self.reset();
        }
    }

    /// Checks if the voice is completely finished (inactive and envelope has finished).
    pub fn is_finished(&self, sample_rate: f32) -> bool {
        if let Some(note_off_sample_index) = self.note_off_sample_index {
            let time_since_on = self.samples_elapsed_since_trigger as f32 / sample_rate;
            let time_since_off =
                (self.samples_elapsed_since_trigger - note_off_sample_index) as f32 / sample_rate;
            self.envelope.evaluate(time_since_on, Some(time_since_off)) == 0.0
        } else {
            false
        }
    }
}

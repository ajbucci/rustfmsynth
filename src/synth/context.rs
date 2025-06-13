use crate::synth::operator::Operator;

/// Contextual information passed down the processing chain.
#[derive(Clone, Debug)]
pub struct ProcessContext<'a> {
    pub sample_rate: f32,
    pub base_frequency: f32,
    pub velocity_scale: f32, // From voice
    // Timing info needed by stateless envelopes
    pub samples_elapsed_since_trigger: u64,
    pub note_off_sample_index: Option<u64>,
    // Shared resources (immutable references)
    pub operators: &'a [Operator],
    // Add other global/voice params: pitch bend, mod wheel etc.
}


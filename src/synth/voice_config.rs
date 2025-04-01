/// Configuration parameters for voice behavior.
/// This includes envelope settings and velocity sensitivity behavior.
#[derive(Debug, Clone)]
pub struct VoiceConfig {
    pub attack: f32,
    pub decay: f32,
    pub sustain: f32,
    pub release: f32,
    pub velocity_sensitive_envelope: bool,
    pub velocity_sensitive_curve: f32,
}

impl VoiceConfig {
    /// Compute gain factor from velocity based on current config.
    pub fn velocity_to_scale(&self, velocity: u8) -> f32 {
        // Convert MIDI velocity (0-127) to a scale factor (0.0-1.0)
        let vel = if self.velocity_sensitive_envelope {
            velocity.clamp(1, 127)
        } else {
            100
        };

        let normalized = vel as f32 / 127.0;
        normalized.powf(self.velocity_sensitive_curve)
    }
}

impl Default for VoiceConfig {
    fn default() -> Self {
        Self {
            attack: 0.01,
            decay: 0.1,
            sustain: 0.8,
            release: 0.3,
            velocity_sensitive_envelope: true,
            velocity_sensitive_curve: 1.5,
        }
    }
}

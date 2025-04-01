#[derive(Debug, Clone)]
pub struct EnvelopeGenerator {
    pub attack: f32,
    pub decay: f32,
    pub sustain: f32,
    pub release: f32,
    pub value: f32,
}

impl EnvelopeGenerator {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn set_params(&mut self, attack: f32, decay: f32, sustain: f32, release: f32) {
        self.attack = attack;
        self.decay = decay;
        self.sustain = sustain;
        self.release = release;
    }
    pub fn evaluate(&self, time_since_on: f32, time_since_off: Option<f32>) -> f32 {
        if let Some(release_time) = time_since_off {
            // In release phase
            if release_time >= self.release {
                0.0
            } else {
                let progress = release_time / self.release;
                self.sustain * (1.0 - progress)
            }
        } else {
            // Attack, Decay, Sustain
            if time_since_on < self.attack {
                time_since_on / self.attack
            } else if time_since_on < self.attack + self.decay {
                let decay_elapsed = time_since_on - self.attack;
                let decay_progress = decay_elapsed / self.decay;
                1.0 - decay_progress * (1.0 - self.sustain)
            } else {
                self.sustain
            }
        }
    }
}
impl Default for EnvelopeGenerator {
    fn default() -> Self {
        Self {
            attack: 0.01,
            decay: 0.1,
            sustain: 0.7,
            release: 0.2,
            value: 0.0,
        }
    }
}

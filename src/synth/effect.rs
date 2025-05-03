use super::reverb::Reverb;

pub enum EffectType {
    Reverb(Reverb),
    // Delay,
    // Distortion,
    // Chorus,
    // Flanger,
    // Phaser,
    // Tremolo,
    // BitCrusher,
    // Filter,
}
pub struct Effect {
    pub effect: EffectType,
}
impl Effect {
    pub fn new(effect: EffectType) -> Self {
        Self { effect }
    }

    pub fn apply(&mut self, input: &mut [f32]) {
        match &mut self.effect {
            EffectType::Reverb(reverb) => reverb.process(input),
        }
    }
    pub fn configure(&mut self, sample_rate: f32) {
        match &mut self.effect {
            EffectType::Reverb(reverb) => reverb.configure(sample_rate),
        }
    }
}

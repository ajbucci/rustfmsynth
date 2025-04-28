#[derive(Debug, Clone)]
pub struct EnvelopeGenerator {
    pub attack: f32,
    pub decay: f32,
    pub sustain: f32,
    pub release: f32,
    pub curve: f32,

    curve_blend_factor: f32,
}

const EPSILON: f32 = 1e-6;

// Linear interpolation helper
#[inline]
fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a * (1.0 - t) + b * t
}

impl EnvelopeGenerator {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn set_params(&mut self, attack: f32, decay: f32, sustain: f32, release: f32) {
        self.attack = attack.max(0.0);
        self.decay = decay.max(0.0);
        self.sustain = sustain.max(0.0).min(1.0); // Clamp sustain level
        self.release = release.max(0.0);
    }
    pub fn set_curve(&mut self, curve: f32) {
        self.curve = curve;
        self.calculate_curve_params();
    }
    fn calculate_curve_params(&mut self) {
        self.curve_blend_factor = self.curve / 10.0;
    }
    /// Applies the curve interpolation for attack phase.
    /// `linear_progress` is time progress [0, 1]
    /// Returns curved progress [0, 1]
    #[inline]
    fn apply_curve_attack(&self, linear_progress: f32) -> f32 {
        let p = linear_progress.min(1.0).max(0.0); // Clamp progress for safety

        if self.curve_blend_factor <= EPSILON {
            // Purely linear
            p
        } else {
            // Linear shape: y = p
            let linear_val = p;
            // Exponential shape (curve=10): y = 2^p - 1
            let exp_val = 2.0f32.powf(p) - 1.0;

            // Blend between linear and exponential
            lerp(linear_val, exp_val, self.curve_blend_factor)
        }
    }
    /// Applies the curve interpolation for decay/release phases.
    /// `linear_progress` is time progress [0, 1]
    /// Returns the curved multiplier [1 -> 0] for the decaying value.
    #[inline]
    fn apply_curve_decay_release(&self, linear_progress: f32) -> f32 {
        let p = linear_progress.min(1.0).max(0.0); // Clamp progress for safety

        if self.curve_blend_factor <= EPSILON {
            // Purely linear (multiplier = 1 - p)
            1.0 - p
        } else {
            // Linear shape multiplier: m = 1 - p
            let linear_mul = 1.0 - p;
            // Exponential shape multiplier (curve=10): m = 2 - 2^p
            let exp_mul = 2.0 - 2.0f32.powf(p);

            // Blend between linear and exponential multipliers
            lerp(linear_mul, exp_mul, self.curve_blend_factor)
        }
    }
    pub fn evaluate(&self, time_since_on: f32, time_since_off: Option<f32>) -> f32 {
        if let Some(time_since_off) = time_since_off {
            // --- Release Phase ---
            if self.release <= EPSILON || time_since_off >= self.release {
                // Instant release or phase finished
                return 0.0;
            }

            // Calculate linear progress through release phase
            let release_progress_linear = time_since_off / self.release; // No need to clamp here, checked >= release above

            // Determine the value at the *start* of the release phase
            let value_at_release_start = {
                let time_held = time_since_on - time_since_off;
                // Evaluate the state just before release, using curves
                self.evaluate_non_release(time_held)
            };

            // Get the curved multiplier (decays from 1 towards 0)
            let release_multiplier_curved = self.apply_curve_decay_release(release_progress_linear);

            // Apply the multiplier
            value_at_release_start * release_multiplier_curved
        } else {
            // --- Attack/Decay/Sustain Phase ---
            self.evaluate_non_release(time_since_on)
        }
    }
    // Helper function to evaluate only Attack/Decay/Sustain phases
    fn evaluate_non_release(&self, time_since_on: f32) -> f32 {
        if time_since_on < self.attack {
            // --- Attack Phase ---
            if self.attack <= EPSILON {
                // Instant attack
                1.0
            } else {
                let attack_progress_linear = time_since_on / self.attack;
                // Apply curve directly to get the attack value [0 -> 1]
                self.apply_curve_attack(attack_progress_linear)
            }
        } else if time_since_on < self.attack + self.decay {
            // --- Decay Phase ---
            if self.decay <= EPSILON {
                // Instant decay
                self.sustain
            } else {
                let decay_elapsed = time_since_on - self.attack;
                let decay_progress_linear = decay_elapsed / self.decay;

                // Get the curved multiplier (decays from 1 towards 0)
                let decay_multiplier_curved = self.apply_curve_decay_release(decay_progress_linear);

                // Interpolate from 1.0 down to sustain using the multiplier
                // Value = sustain + (1.0 - sustain) * multiplier
                self.sustain + (1.0 - self.sustain) * decay_multiplier_curved
            }
        } else {
            // --- Sustain Phase ---
            self.sustain
        }
    }
    pub fn finished(&self, time_since_off: Option<f32>) -> bool {
        if let Some(time_since_off) = time_since_off {
            time_since_off >= self.release
        } else {
            false
        }
    }
}
impl Default for EnvelopeGenerator {
    fn default() -> Self {
        let mut env = Self {
            attack: 0.001,
            decay: 1.0,
            sustain: 0.6,
            release: 0.1,
            curve: 6.0,              // Default to linear curve
            curve_blend_factor: 0.6, // Placeholder, will be calculated
        };
        env.calculate_curve_params(); // Calculate initial curve params
        env
    }
}

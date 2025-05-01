use crate::synth::prelude::{FRAC_1_SQRT_2, PI};
use core::fmt;

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum FilterType {
    LowPassBiquad,
    Comb,
    PitchedComb,
}
pub trait FilterState: Clone + 'static + fmt::Debug {
    fn reset(&mut self);
    fn process(&mut self, input: f32) -> f32;
}
#[derive(Clone, Debug, Default)]
pub struct BiquadState {
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}
#[derive(Clone, Debug, Default)]
pub struct LowPassBiquadState {
    #[allow(dead_code)] // TODO: remove later.. we may want to reference these later
    cutoff: f32,
    #[allow(dead_code)]
    q: f32,
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    state: BiquadState,
}
impl LowPassBiquadState {
    pub fn new(cutoff: f32, sample_rate: f32) -> Self {
        // Clamp cutoff to avoid issues, ensure it's below Nyquist
        let cutoff = cutoff.max(1.0).min(sample_rate * 0.49);
        let sample_rate = sample_rate.max(1.0);
        let q = FRAC_1_SQRT_2; // Prevent Q too close to zero

        // Calculate intermediate variables (from RBJ Audio EQ Cookbook)
        let omega = 2.0 * PI * cutoff / sample_rate;
        let cos_omega = omega.cos();
        let sin_omega = omega.sin();
        let alpha = sin_omega / (2.0 * q);

        // Calculate coefficients for Low-Pass Filter
        let b0 = (1.0 - cos_omega) / 2.0;
        let b1 = 1.0 - cos_omega;
        let b2 = (1.0 - cos_omega) / 2.0;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha;

        // Normalize coefficients by a0
        let b0 = b0 / a0;
        let b1 = b1 / a0;
        let b2 = b2 / a0;
        let a1 = a1 / a0;
        let a2 = a2 / a0;
        Self {
            cutoff,
            q,
            b0,
            b1,
            b2,
            a1,
            a2,
            ..Default::default()
        }
    }
    pub fn new_with_q(cutoff: f32, q: f32) -> Self {
        Self {
            cutoff,
            q,
            ..Default::default()
        }
    }
}
impl FilterState for LowPassBiquadState {
    fn reset(&mut self) {
        self.state = BiquadState::default();
    }
    fn process(&mut self, input: f32) -> f32 {
        // Apply the Biquad difference equation (Direct Form I)
        // y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
        let output = self.b0 * input + self.b1 * self.state.x1 + self.b2 * self.state.x2
            - self.a1 * self.state.y1
            - self.a2 * self.state.y2;

        // --- Update self variables ---
        // Input history
        self.state.x2 = self.state.x1;
        self.state.x1 = input;
        // Output history
        self.state.y2 = self.state.y1;
        self.state.y1 = output;

        output
    }
}
#[derive(Clone, Debug)]
pub struct CombState {
    alpha: f32,
    k: usize,
    ys: Vec<f32>,
    ys_index: usize,
}
impl CombState {
    pub fn new(alpha: f32, k: usize) -> Self {
        Self {
            alpha,
            k,
            ys: vec![0.0; k],
            ys_index: 0,
        }
    }
    pub fn update_k(&mut self, k: usize) {
        if k > 0 {
            self.k = k;
        } else {
            self.k = 1;
        }
        self.ys.resize(k, 0.0);
        self.ys_index = 0;
    }
}
impl FilterState for CombState {
    fn reset(&mut self) {
        self.ys.fill(0.0);
        self.ys_index = 0;
    }
    fn process(&mut self, input: f32) -> f32 {
        let output = input + self.alpha * self.ys[self.ys_index];
        self.ys[self.ys_index] = output;
        self.ys_index = (self.ys_index + 1) % self.k;
        output
    }
}
#[derive(Clone, Debug)]
pub struct PitchedCombState {
    comb_state: CombState,
}
impl PitchedCombState {
    pub fn new(alpha: f32, k: usize) -> Self {
        Self {
            comb_state: CombState::new(alpha, k),
        }
    }
    pub fn update_k_frequency(&mut self, sample_rate: f32, frequency: f32) {
        let k = (sample_rate / frequency).round() as usize;
        self.comb_state.update_k(k);
    }
}
impl FilterState for PitchedCombState {
    fn reset(&mut self) {
        self.comb_state.reset();
    }
    fn process(&mut self, input: f32) -> f32 {
        let state = &mut self.comb_state;
        let k = state.k;

        // Safety checks
        if k == 0 || state.ys.len() != k {
            return input;
        }
        // Ensure index wraps correctly before use
        if state.ys_index >= k {
            state.ys_index = 0;
        }

        // Read the delayed sample y[n-k] (value being read out / about to be overwritten)
        let current_delayed = state.ys[state.ys_index];

        // Calculate the core feedback loop signal based on input and delayed signal
        // Alpha includes polarity (+/-) and decay (<1 magnitude, e.g., +/- 0.995)
        let loop_signal = input + state.alpha * current_delayed;

        // --- Apply KS-style Averaging Filter using y[n-1] ---
        // Get the previously written value, y[n-1].
        // It's located at the index *before* the current write index (ys_index).
        // Need correct modulo arithmetic for wrap-around.
        let prev_write_index = (state.ys_index + k - 1) % k;
        let prev_written_value = state.ys[prev_write_index]; // This is y[n-1]

        // Average the current loop signal with the previously written value (y[n-1])
        // This acts as a low-pass filter applied *before* writing into the delay line
        let output = (loop_signal + prev_written_value) * 0.5;

        // Store the DAMPED value back into the delay line at the current index
        if !output.is_finite() {
            eprintln!("Warning: Non-finite value detected. Resetting.");
            self.reset(); // Ensure reset clears ys buffer appropriately
            return 0.0;
        }
        state.ys[state.ys_index] = output; // Store y[n]

        // Advance write index for the next sample
        state.ys_index = (state.ys_index + 1) % k;

        output
    }
}
#[derive(Clone, Debug)]
pub enum Filter {
    LowPassBiquad(LowPassBiquadState),
    Comb(CombState),
    PitchedComb(PitchedCombState),
}
impl Filter {
    pub fn get_type(&self) -> FilterType {
        match self {
            Filter::LowPassBiquad(_) => FilterType::LowPassBiquad,
            Filter::Comb(_) => FilterType::Comb,
            Filter::PitchedComb(_) => FilterType::PitchedComb,
        }
    }
    pub fn reset(&mut self) {
        match self {
            Filter::LowPassBiquad(s) => s.reset(),
            Filter::Comb(s) => s.reset(),
            Filter::PitchedComb(s) => s.reset(),
        }
    }
    pub fn process(&mut self, input: f32) -> f32 {
        match self {
            Filter::LowPassBiquad(s) => s.process(input),
            Filter::Comb(s) => s.process(input),
            Filter::PitchedComb(s) => s.process(input),
        }
    }
    pub fn new_lowpass_biquad(cutoff: f32, sample_rate: f32) -> Self {
        Filter::LowPassBiquad(LowPassBiquadState::new(cutoff, sample_rate))
    }
    pub fn new_comb(alpha: f32, k: usize) -> Self {
        Filter::Comb(CombState::new(alpha, k))
    }
    pub fn new_pitched_comb(alpha: f32) -> Self {
        Filter::PitchedComb(PitchedCombState::new(alpha, 1))
    }
}

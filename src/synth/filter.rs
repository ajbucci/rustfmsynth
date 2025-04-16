use crate::synth::prelude::{FRAC_1_SQRT_2, PI};

#[derive(Clone, Debug)]
pub enum FilterType {
    LowPass(f32),       // cutoff frequency
    HighPass(f32),      // cutoff frequency
    BandPass(f32, f32), // center frequency, bandwidth
}

#[derive(Clone, Debug)]
pub enum Filter {
    LowPassBiquad(LowPassBiquad),
    Comb(Comb),
}
impl Filter {
    pub fn biquad(cutoff: f32, sample_rate: f32) -> Self {
        Self::LowPassBiquad(LowPassBiquad::new(cutoff, sample_rate))
    }
    pub fn comb(alpha: f32, k: usize) -> Self {
        Self::Comb(Comb::new(alpha, k))
    }
    pub fn process(&mut self, input: f32) -> f32 {
        match self {
            Self::LowPassBiquad(biquad) => biquad.process(input),
            Self::Comb(comb) => comb.process(input),
        }
    }
}
#[derive(Clone, Debug, Default)]
pub struct LowPassBiquad {
    cutoff: f32,
    q: f32,
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}
impl LowPassBiquad {
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
    // --- Single Sample Biquad Low-Pass Filter ---

    /// Processes a single sample through a 2-pole IIR low-pass filter (Biquad, Direct Form I).
    /// State variables (x1, x2, y1, y2) track previous inputs and outputs.
    pub fn process(&mut self, input: f32) -> f32 {
        // Apply the Biquad difference equation (Direct Form I)
        // y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
        let output = self.b0 * input + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1
            - self.a2 * self.y2;

        // --- Update self variables ---
        // Input history
        self.x2 = self.x1;
        self.x1 = input;
        // Output history
        self.y2 = self.y1;
        self.y1 = output;

        output
    }
}
#[derive(Clone, Debug)]
pub struct Comb {
    alpha: f32,
    k: usize,
    ys: Vec<f32>,
    ys_index: usize,
}
impl Comb {
    pub fn new(alpha: f32, k: usize) -> Self {
        Self {
            alpha,
            k,
            ys: vec![0.0; k],
            ys_index: 0,
        }
    }
    pub fn process(&mut self, input: f32) -> f32 {
        let output = input + self.alpha * self.ys[self.ys_index];
        self.ys[self.ys_index] = output;
        self.ys_index = (self.ys_index + 1) % self.k;
        output
    }
}

pub fn apply_filter(output: &mut [f32], filter_type: FilterType, sample_rate: f32) {
    match filter_type {
        FilterType::LowPass(cutoff) => apply_low_pass(output, cutoff, sample_rate),
        FilterType::HighPass(cutoff) => apply_high_pass(output, cutoff, sample_rate),
        FilterType::BandPass(center, bandwidth) => {
            apply_band_pass(output, center, bandwidth, sample_rate)
        }
    }
}

// Basic low-pass filter using a simple averaging technique
fn apply_low_pass(output: &mut [f32], cutoff: f32, sample_rate: f32) {
    let rc = 1.0 / (cutoff * 2.0 * PI);
    let dt = 1.0 / sample_rate;
    let alpha = dt / (rc + dt);

    let mut previous = output[0];
    for sample in output.iter_mut() {
        *sample = previous + alpha * (*sample - previous);
        previous = *sample;
    }
}

// Basic high-pass filter using a simple high-pass formula
fn apply_high_pass(output: &mut [f32], cutoff: f32, sample_rate: f32) {
    let rc = 1.0 / (cutoff * 2.0 * PI);
    let dt = 1.0 / sample_rate;
    let alpha = rc / (rc + dt);

    let mut previous_input = output[0];
    let mut previous_output = output[0];
    for sample in output.iter_mut() {
        let current_input = *sample;
        *sample = alpha * (previous_output + current_input - previous_input);
        previous_input = current_input;
        previous_output = *sample;
    }
}

// Basic band-pass filter by combining low-pass and high-pass
fn apply_band_pass(output: &mut [f32], center: f32, bandwidth: f32, sample_rate: f32) {
    apply_low_pass(output, center + bandwidth / 2.0, sample_rate);
    apply_high_pass(output, center - bandwidth / 2.0, sample_rate);
}

// TODO: Implement stateful single-sample Biquad HighPass and BandPass if needed

// Remove the old slice-based functions
// fn apply_filter(...) { ... }
// fn apply_low_pass(...) { ... }
// fn apply_high_pass(...) { ... }
// fn apply_band_pass(...) { ... }
// Remove the old single-sample process_low_pass
// pub fn process_low_pass(...) -> f32 { ... }

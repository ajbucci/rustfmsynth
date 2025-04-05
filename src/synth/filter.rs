use crate::synth::prelude::PI;

#[derive(Clone, Debug)]
pub enum FilterType {
    LowPass(f32),       // cutoff frequency
    HighPass(f32),      // cutoff frequency
    BandPass(f32, f32), // center frequency, bandwidth
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

// --- Single Sample Biquad Low-Pass Filter ---

/// Processes a single sample through a 2-pole IIR low-pass filter (Biquad, Direct Form I).
/// State variables (x1, x2, y1, y2) track previous inputs and outputs.
pub fn process_biquad_lpf(
    input: f32,
    cutoff: f32,
    sample_rate: f32,
    q: f32, // Quality factor (resonance)
    x1: &mut f32, // State: previous input x[n-1]
    x2: &mut f32, // State: input before previous x[n-2]
    y1: &mut f32, // State: previous output y[n-1]
    y2: &mut f32, // State: output before previous y[n-2]
) -> f32 {
    // Clamp cutoff to avoid issues, ensure it's below Nyquist
    let cutoff = cutoff.max(1.0).min(sample_rate * 0.49);
    let sample_rate = sample_rate.max(1.0);
    let q = q.max(0.01); // Prevent Q too close to zero

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

    // Apply the Biquad difference equation (Direct Form I)
    // y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
    let output = b0 * input + b1 * *x1 + b2 * *x2 - a1 * *y1 - a2 * *y2;

    // --- Update state variables ---
    // Input history
    *x2 = *x1;
    *x1 = input;
    // Output history
    *y2 = *y1;
    *y1 = output;

    output
}

// TODO: Implement stateful single-sample Biquad HighPass and BandPass if needed

// Remove the old slice-based functions
// fn apply_filter(...) { ... }
// fn apply_low_pass(...) { ... }
// fn apply_high_pass(...) { ... }
// fn apply_band_pass(...) { ... }
// Remove the old single-sample process_low_pass
// pub fn process_low_pass(...) -> f32 { ... }

use core::fmt;
use rand::prelude::*; // Import Rng and thread_rng
use std::f32; // Use f32
use std::vec::Vec;

// --- ReverbType Enum ---
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum ReverbType {
    FDN,
}

// Delay times should be distributed exponentially between
// a short delay amount and a long delay amount,
// then rounded to the nearest distinct integer prime
pub fn get_delay_times(
    mut min_delay_samples: usize,
    mut max_delay_samples: usize,
    num_delays: usize,
) -> Vec<usize> {
    if num_delays < 2 || num_delays > 16 {
        return Vec::new();
    }

    const PRACTICAL_MAX_INPUT_DELAY: usize = 2_000_000;
    min_delay_samples = min_delay_samples.max(2).min(PRACTICAL_MAX_INPUT_DELAY);
    max_delay_samples = max_delay_samples
        .max(min_delay_samples)
        .min(PRACTICAL_MAX_INPUT_DELAY);

    let mut result_primes = Vec::with_capacity(num_delays);
    let mut last_prime_found: usize = 0;

    let mut current_target_f = min_delay_samples as f32;
    let ratio =
        (max_delay_samples as f32 / min_delay_samples as f32).powf(1.0 / (num_delays - 1) as f32);

    // Determine Sieve limit: needs to cover max_delay_samples, and potentially a bit more
    // if last_prime_found pushes targets higher. For num_delays=16, this won't be excessive.
    let sieve_limit =
        (max_delay_samples + (num_delays as usize * 100)).min(PRACTICAL_MAX_INPUT_DELAY + 2000); // Heuristic

    let mut is_composite = vec![false; sieve_limit as usize + 1];

    // Pre-Sieve up to sieve_limit
    for i in 2..=(sieve_limit as f64).sqrt() as usize {
        if !is_composite[i as usize] {
            if i <= 65535 {
                // Ensure i*i doesn't overflow for starting multiple
                for multiple in ((i * i)..=sieve_limit).step_by(i as usize) {
                    is_composite[multiple as usize] = true;
                }
            } else {
                // For i > 65535, i*i overflows. Start marking from 2*i if needed.
                // However, such large i would mean its multiples are huge and likely
                // already marked or beyond typical sieve_limit.
                for multiple in ((i * i)..=sieve_limit).step_by(i as usize) {
                    is_composite[multiple as usize] = true;
                }
            }
        }
    }

    let mut p: usize = 2;
    while result_primes.len() < num_delays {
        if !is_composite[p as usize] {
            let search_val = (current_target_f as usize).max(last_prime_found + 1);
            if p >= search_val {
                result_primes.push(p);
                last_prime_found = p;
                if result_primes.len() < num_delays {
                    current_target_f *= ratio;
                    if current_target_f <= last_prime_found as f32 {
                        current_target_f = (last_prime_found + 1) as f32;
                    }
                }
            }
        }

        if p == usize::MAX {
            // If p reaches MAX, something is wrong or num_delays is too high for u32 primes
            eprintln!("Warning: p reached u32::MAX while searching for primes. Returning {} of {} requested.", result_primes.len(), num_delays);
            break;
        }
        p += 1;
    }
    result_primes
}
const HADAMARD_8: [[i32; 8]; 8] = [
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, -1, 1, -1, 1, -1, 1, -1],
    [1, 1, -1, -1, 1, 1, -1, -1],
    [1, -1, -1, 1, 1, -1, -1, 1],
    [1, 1, 1, 1, -1, -1, -1, -1],
    [1, -1, 1, -1, -1, 1, -1, 1],
    [1, 1, -1, -1, -1, -1, 1, 1],
    [1, -1, -1, 1, -1, 1, 1, -1],
];
#[derive(Clone, Debug)]
struct DelayLine {
    buffer: Vec<f32>,
    index: usize,
}
impl DelayLine {
    pub fn new(delay_samples: usize) -> Self {
        DelayLine {
            buffer: vec![0.0; delay_samples],
            index: 0,
        }
    }
    pub fn reset(&mut self) {
        for x_ref in self.buffer.iter_mut() {
            *x_ref = 0.0;
        }
        self.index = 0;
    }
    pub fn push_pop(&mut self, input: f32) -> f32 {
        let output = self.buffer[self.index];
        self.buffer[self.index] = input;
        self.index = (self.index + 1) % self.buffer.len();
        output
    }
}
// Input -> delay lines -> output AND delay filters (if I implement) -> feedback matrix -> mix w/ input ->
// repeat
#[derive(Clone, Debug)]
struct FDN {
    rt60: f32,
    mix: f32,
    delay_lines: Vec<DelayLine>,
    decay_coeffs: [f32; NUM_LINES],
    feedback: [f32; NUM_LINES],
    delay_outputs: [f32; NUM_LINES],
    sample_rate: f32,
}
const NUM_LINES: usize = 8;
impl FDN {
    fn new(delay_time_seconds: f32, sample_rate: f32) -> Self {
        let delay_samples = sample_rate * delay_time_seconds;
        let delay_spread_seconds = 0.25;
        let delay_spread_samples = sample_rate * delay_spread_seconds;
        let delays = get_delay_times(
            delay_samples as usize,
            (delay_samples + delay_spread_samples) as usize,
            NUM_LINES,
        );
        let delay_lines = delays
            .iter()
            .map(|&d| DelayLine::new(d))
            .collect::<Vec<_>>();
        Self {
            rt60: 0.0,
            mix: 0.5,
            feedback: [0.0; NUM_LINES],
            decay_coeffs: [0.8; NUM_LINES],
            delay_outputs: [0.0; NUM_LINES],
            sample_rate,
            delay_lines,
        }
    }
    fn configure(&mut self, sample_rate: f32) {
        self.sample_rate = sample_rate;
        self.reset();
    }
    fn reset(&mut self) {
        for line in &mut self.delay_lines {
            line.reset()
        }
    }
    fn process(&mut self, input: &mut f32) {
        let mut wet = 0.0;
        let mut feedback_mix_buffer = [0.0f32; NUM_LINES]; // This will be modified in-place by FWHT
        for (i, f) in self.feedback.iter().enumerate() {
            // retrieve feedback and push mixed input into delay line
            self.delay_outputs[i] = self.delay_lines[i].push_pop(*f + *input / NUM_LINES as f32);
            wet += self.delay_outputs[i];
            feedback_mix_buffer[i] = self.delay_outputs[i] * self.decay_coeffs[i];
        }

        // Perform Fast Walsh-Hadamard Transform (in-place on feedback_mix_buffer)
        let mut h = 1;
        while h < NUM_LINES {
            // For N=8, h will be 1, 2, 4
            let mut i = 0;
            while i < NUM_LINES {
                for j in i..(i + h) {
                    let x = feedback_mix_buffer[j];
                    let y = feedback_mix_buffer[j + h];
                    feedback_mix_buffer[j] = x + y;
                    feedback_mix_buffer[j + h] = x - y;
                }
                i += h * 2;
            }
            h *= 2;
        }

        // Apply normalization for energy preservation
        let norm_factor = 1.0 / (NUM_LINES as f32).sqrt();

        for i in 0..NUM_LINES {
            self.feedback[i] = feedback_mix_buffer[i] * norm_factor;
        }
        *input = *input * (1.0 - self.mix) + self.mix * wet;
    }
}

// --- Top-level Reverb Enum (Wrapper) ---
#[derive(Clone, Debug)]
pub enum Reverb {
    FDN(FDN),
}

impl Reverb {
    pub fn get_type(&self) -> ReverbType {
        ReverbType::FDN
    }
    pub fn reset(&mut self) {
        match self {
            Reverb::FDN(s) => s.reset(),
        }
    }
    #[inline]
    pub fn process(&mut self, buffer: &mut f32) {
        match self {
            Reverb::FDN(s) => s.process(buffer),
        }
    }
    pub fn set_decay_control(&mut self, rt60_seconds: f32) {
        // match self {
        //     Reverb::FDN(s) => s.set_decay_control(rt60_seconds),
        // }
    }
    pub fn set_dry_wet(&mut self, mix: f32) {
        // match self {
        //     Reverb::FDN(s) => s.set_dry_wet(mix),
        // }
    }
    pub fn configure(&mut self, sample_rate: f32) {
        // Removed RNG argument
        match self {
            Reverb::FDN(s) => s.configure(sample_rate),
        }
    }

    pub fn new_fdn(delay_time_seconds: f32) -> Self {
        // Removed RNG argument
        Reverb::FDN(FDN::new(delay_time_seconds, 44_100.0))
    }
}

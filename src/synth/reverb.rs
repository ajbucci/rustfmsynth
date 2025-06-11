use super::delayline::ModulatedDelayLine;
use super::diffuser::MultiChannelDiffuser;
use std::f32; // Use f32
use std::vec::Vec;

// --- ReverbType Enum ---
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum ReverbType {
    FDN,
}
const MIN_CHANNELS: usize = 2;
const MAX_CHANNELS: usize = 128;

pub const MULTIPLIER_1: u64 = 69069; // A common odd multiplier from LCGs
pub const MULTIPLIER_2: u64 = 1664525; // Another common odd LCG multiplier
pub fn get_permutations(channels: usize, permutation_seed: u64) -> (Vec<usize>, Vec<usize>) {
    let mut p_in = vec![0usize; channels];
    let mut p_out = vec![0usize; channels];

    // Derive offsets from the seed.
    // Using different parts of the seed or simple modifications.
    let offset1: u64 = permutation_seed.wrapping_add(channels as u64 / 2); // Add some variation
    let offset2: u64 = (permutation_seed >> 32).wrapping_add(permutation_seed & 0xFFFFFFFF);

    let channels_u64 = channels as u64; // Do this once

    for i in 0..channels {
        // P_in[original_index] = new_permuted_index
        p_in[i] =
            (((MULTIPLIER_1.wrapping_mul(i as u64)).wrapping_add(offset1)) % channels_u64) as usize;
        p_out[i] =
            (((MULTIPLIER_2.wrapping_mul(i as u64)).wrapping_add(offset2)) % channels_u64) as usize;
    }
    (p_in, p_out)
}
fn get_channels_pow2(channels: usize) -> usize {
    let clamped_val = channels.clamp(MIN_CHANNELS, MAX_CHANNELS);

    if (clamped_val & (clamped_val - 1)) == 0 {
        return clamped_val;
    }

    let upper_pow2 = clamped_val.next_power_of_two();
    let lower_pow2 = upper_pow2 / 2;

    if (clamped_val - lower_pow2) <= (upper_pow2 - clamped_val) {
        lower_pow2
    } else {
        upper_pow2
    }
}
// Delay times should be distributed exponentially between
// a short delay amount and a long delay amount,
// then rounded to the nearest distinct integer prime
pub fn get_delay_samples_by_spacing(sample_delay_spacing: usize, num_delays: usize) -> Vec<usize> {
    if num_delays == 1 {
        return vec![sample_delay_spacing; 1];
    }
    get_delay_samples(
        sample_delay_spacing,
        sample_delay_spacing * (num_delays + 1),
        0.0,
        num_delays,
    )
}

const PRACTICAL_MAX_INPUT_DELAY: usize = 2_000_000;
pub fn find_prime_delays_from_deltas(deltas: &[usize]) -> Vec<usize> {
    let num_delays = deltas.len();
    let mut result_primes = Vec::with_capacity(num_delays);
    let mut last_prime_found: usize = 0;
    let max_delay_samples: usize = deltas.iter().sum();

    let sieve_limit: usize =
        (max_delay_samples * 2 + (num_delays * 100)).min(PRACTICAL_MAX_INPUT_DELAY * 2); // Heuristic

    let mut is_composite = vec![false; sieve_limit + 1];
    let mut current_target_idx = 0;

    // Pre-Sieve up to sieve_limit
    for i in 2..=(sieve_limit as f64).sqrt() as usize {
        if !is_composite[i] {
            if i <= 65535 {
                // Ensure i*i doesn't overflow for starting multiple
                for multiple in ((i * i)..=sieve_limit).step_by(i) {
                    is_composite[multiple] = true;
                }
            } else {
                // For i > 65535, i*i overflows. Start marking from 2*i if needed.
                // However, such large i would mean its multiples are huge and likely
                // already marked or beyond typical sieve_limit.
                for multiple in ((i * i)..=sieve_limit).step_by(i) {
                    is_composite[multiple] = true;
                }
            }
        }
    }

    let mut p: usize = 2;
    while result_primes.len() < num_delays {
        if !is_composite[p] {
            let search_val =
                (last_prime_found + deltas[current_target_idx]).max(last_prime_found + 1);
            if p >= search_val {
                result_primes.push(p);
                last_prime_found = p;
                if result_primes.len() < num_delays {
                    current_target_idx += 1;
                }
            }
        }

        if p == usize::MAX {
            // If p reaches MAX, something is wrong or num_delays is too high for u32 primes
            eprintln!(
                "Warning: p reached u32::MAX while searching for primes. Returning {} of {} requested.",
                result_primes.len(),
                num_delays
            );
            break;
        }
        p += 1;
    }
    result_primes
}

pub fn get_delay_samples(
    min_delay_samples: usize,
    max_delay_samples: usize,
    curve: f32, // shape from linear (0) to exponential (1)
    num_delays: usize,
) -> Vec<usize> {
    let delay_target_deltas =
        get_delay_target_deltas(min_delay_samples, max_delay_samples, curve, num_delays);
    find_prime_delays_from_deltas(&delay_target_deltas)
}
pub fn get_delay_target_deltas(
    mut min_delay_samples: usize,
    mut max_delay_samples: usize,
    curve: f32, // shape from linear (0) to exponential (1)
    num_delays: usize,
) -> Vec<usize> {
    min_delay_samples = min_delay_samples.clamp(2, PRACTICAL_MAX_INPUT_DELAY);
    max_delay_samples = max_delay_samples
        .max(min_delay_samples)
        .min(PRACTICAL_MAX_INPUT_DELAY);

    let mut deltas = vec![0; num_delays];

    deltas[0] = min_delay_samples;
    let mut deltas_idx = 1;

    let ratio =
        (max_delay_samples as f32 / min_delay_samples as f32).powf(1.0 / (num_delays - 1) as f32);

    let increment = (max_delay_samples - min_delay_samples) as f32 / (num_delays - 1) as f32;

    let mut last_exponential_target = deltas[0] as f32;
    while deltas_idx < deltas.len() {
        let next_exponential_target = last_exponential_target * ratio;
        let exponential_delta = next_exponential_target - last_exponential_target;
        last_exponential_target = next_exponential_target;

        deltas[deltas_idx] =
            ((1.0 - curve) * increment + curve * exponential_delta).round() as usize;
        deltas_idx += 1;
    }
    deltas
}
// Input -> delay lines -> output AND delay filters (if I implement) -> feedback matrix -> mix w/ input ->
// repeat
struct Fdn {
    wet_mix: f32,
    delay_lines: Vec<ModulatedDelayLine>,
    permute_buffer: Vec<f32>,
    input_channels: Vec<f32>,
    decay_coeffs: Vec<f32>,
    feedback: Vec<f32>,
    feedback_mix_buffer: Vec<f32>,
    channels: usize,
    delay_outputs: Vec<f32>,
    p_in: Vec<usize>,
    p_out: Vec<usize>,
    diffusers: Vec<MultiChannelDiffuser>,
    diffusion_steps: usize,
    diffusion_channels: usize,
    // TODO: implement LPF
    // lowpass_filters: Option<Vec<LowPassFilter>>,
    sample_rate: f32,
}

impl Fdn {
    fn new(predelay_ms: f32, decay_ms: f32, wet_mix: f32, sample_rate: f32) -> Self {
        let spread_ms: f32 = 500.0;
        let channels: usize = 16;
        let diffusion_steps: usize = 4;

        let predelay = predelay_ms / 1000.0;
        let spread = spread_ms / 1000.0;
        let rt60 = decay_ms / 1000.0;

        let channels = get_channels_pow2(channels);

        let predelay_samples = sample_rate * predelay;
        let delay_spread_samples = sample_rate * spread;
        let delay_samples = get_delay_samples(
            predelay_samples as usize,
            (predelay_samples + delay_spread_samples) as usize,
            1.0, // exponential curve
            channels,
        );
        let decay_coeffs = delay_samples
            .iter()
            .map(|&d| 0.001_f32.powf(d as f32 / sample_rate / rt60))
            .collect::<Vec<_>>();
        let mut delay_lines = Vec::with_capacity(channels);
        for i in 0..channels {
            let this_delay_samples = delay_samples.get(i).copied().unwrap_or(2) as f32;
            delay_lines.push(ModulatedDelayLine::new(
                this_delay_samples,
                this_delay_samples,
                0.0,
                0.0,
                0.0,
                sample_rate,
            ));
        }

        let mut diffusers = Vec::with_capacity(diffusion_steps);
        for stage in 0..diffusion_steps {
            diffusers.push(MultiChannelDiffuser::new(
                channels,
                // 0.01 * 2f32.powf(stage as f32),
                0.01 * (stage as f32 + 1.0),
                0.0,
                0.0,
                sample_rate,
                42,
            ));
        }

        let (p_in, p_out) = get_permutations(channels, 42);
        Self {
            wet_mix,
            feedback: vec![0.0; channels],
            feedback_mix_buffer: vec![0.0; channels],
            permute_buffer: vec![0.0; channels],
            input_channels: vec![0.0; channels],
            decay_coeffs,
            delay_outputs: vec![0.0; channels],
            p_in,
            p_out,
            diffusers,
            diffusion_steps,
            diffusion_channels: channels,
            channels,
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
        // self.feedback_mix_buffer.fill(0.0);
        self.permute_buffer.fill(0.0);
        // split input into channels
        for i in 0..self.channels {
            self.input_channels[i] = *input;
        }
        for i in 0..self.diffusion_steps {
            self.diffusers[i].process(&mut self.input_channels[0..self.channels]);
        }
        for i in 0..self.channels {
            // retrieve feedback and push mixed input into delay line
            self.delay_outputs[i] =
                self.delay_lines[i].process(self.feedback[i] + self.input_channels[i]);
            let delayed_output = self.delay_outputs[i] * self.decay_coeffs[i];
            // let filtered_output = self.feedback_lowpass_filters[i].process(delayed_output);
            let filtered_output = delayed_output; // No filtering for now
            wet += filtered_output;
            self.permute_buffer[self.p_in[i]] = filtered_output;
        }
        self.feedback_mix_buffer
            .copy_from_slice(&self.permute_buffer);

        let n_channels_float = self.channels as f32;

        // 1. Calculate v^T * x = sum(x_i)
        //    x_i are the elements in self.feedback_mix_buffer
        let mut sum_x = 0.0;
        for i in 0..self.channels {
            sum_x += self.feedback_mix_buffer[i];
        }

        // 2. Calculate the scalar factor: k = (2 / N) * sum_x
        //    (where N = self.channels, N = v^T v for v=[1...1]^T)
        let k_sum_x = (2.0 / n_channels_float) * sum_x;

        // 3. Calculate y_i = x_i - k_sum_x (since v_i = 1)
        //    Store result in self.permute_buffer.
        for i in 0..self.channels {
            self.permute_buffer[i] = self.feedback_mix_buffer[i] - k_sum_x;
        }
        // Apply normalization for energy preservation
        let norm_factor = 1.0 / (self.channels as f32).sqrt();
        for i in 0..self.channels {
            self.feedback[self.p_out[i]] = self.permute_buffer[i];
        }
        let wet_main_reverb = wet * norm_factor;
        let mut filtered_output = wet_main_reverb;

        let combined_wet = filtered_output;
        *input = *input * (1.0 - self.wet_mix) + self.wet_mix * combined_wet;
    }
}

// --- Top-level Reverb Enum (Wrapper) ---
pub enum Reverb {
    FDN(Fdn),
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

    pub fn new_fdn(
        predelay_ms: f32,
        decay_ms: f32,
        wet_mix: f32,
        sample_rate: f32, // add sample_rate as a parameter
    ) -> Self {
        // Removed RNG argument
        Reverb::FDN(Fdn::new(predelay_ms, decay_ms, wet_mix, sample_rate))
    }
}

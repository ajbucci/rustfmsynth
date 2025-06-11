use std::f32; // Use f32
use std::vec::Vec;

// --- ReverbType Enum ---
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum ReverbType {
    FDN,
}
const MIN_CHANNELS: usize = 2;
const MAX_CHANNELS: usize = 128;
#[derive(Debug, Clone)]
pub struct SchroederMultiStageAllpass {
    coeff: f32,
    stages: Vec<SchroederSingleStageState>,
}

#[derive(Debug, Clone)]
struct SchroederSingleStageState {
    delay_m: usize,   // M for this stage
    buffer: Vec<f32>, // Single buffer for this stage's state s[k]
    write_pos: usize, // Write position for this stage's buffer
}

impl SchroederMultiStageAllpass {
    pub fn new(coeff: f32, stage_delay_sample_spacing: usize, num_stages: usize) -> Self {
        let mut stages_vec = Vec::with_capacity(num_stages);

        let delay_spacings = get_delay_samples_by_spacing(stage_delay_sample_spacing, num_stages);
        for stage in 0..num_stages {
            stages_vec.push(SchroederSingleStageState {
                delay_m: delay_spacings[stage],
                buffer: vec![0.0; delay_spacings[stage]],
                write_pos: 0,
            });
        }

        Self {
            coeff: coeff.clamp(-0.99, 0.99),
            stages: stages_vec,
        }
    }

    #[inline]
    pub fn process(&mut self, input: f32) -> f32 {
        let mut current_signal = input;

        for stage_state in self.stages.iter_mut() {
            let delayed_state_val = stage_state.buffer[stage_state.write_pos];
            let stage_output = self.coeff * current_signal + delayed_state_val;
            let new_state_val_to_store = current_signal - self.coeff * stage_output;
            stage_state.buffer[stage_state.write_pos] = new_state_val_to_store;
            stage_state.write_pos = (stage_state.write_pos + 1) % stage_state.delay_m;
            current_signal = stage_output;
        }
        current_signal // Final output after all stages
    }

    pub fn reset(&mut self) {
        for stage_state in self.stages.iter_mut() {
            stage_state.buffer.fill(0.0);
            stage_state.write_pos = 0;
        }
    }

    pub fn set_coeff(&mut self, coeff: f32) {
        self.coeff = coeff.clamp(-0.99, 0.99);
    }
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
    if (MIN_CHANNELS..MAX_CHANNELS).contains(&num_delays) {
        return Vec::new();
    }

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
struct Fdn {
    wet_mix: f32,
    delay_lines: Vec<DelayLine>,
    decay_coeffs: Vec<f32>,
    feedback: Vec<f32>,
    feedback_mix_buffer: Vec<f32>,
    channels: usize,
    delay_outputs: Vec<f32>,
    allpass_filters: Option<Vec<SchroederMultiStageAllpass>>,
    // TODO: implement LPF
    // lowpass_filters: Option<Vec<LowPassFilter>>,
    sample_rate: f32,
}
const SPEED_OF_SOUND: f32 = 343.0; // m/s
const GOLDEN_RATIO: f32 = 1.6180339887;

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
        let delay_lines = delay_samples
            .iter()
            .map(|&d| DelayLine::new(d))
            .collect::<Vec<_>>();

        let mut allpass_filters: Option<Vec<SchroederMultiStageAllpass>> = None;
        if diffusion_steps > 0 {
            let mut temp_ap_vec = Vec::with_capacity(channels);
            for _channel in 0..channels {
                temp_ap_vec.push(SchroederMultiStageAllpass::new(0.9, 40, diffusion_steps));
            }
            allpass_filters = Some(temp_ap_vec)
        }
        Self {
            wet_mix,
            feedback: vec![0.0; channels],
            feedback_mix_buffer: vec![0.0; channels],
            decay_coeffs,
            delay_outputs: vec![0.0; channels],
            allpass_filters,
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
        self.feedback_mix_buffer.fill(0.0);
        for i in 0..self.channels {
            // retrieve feedback and push mixed input into delay line
            self.delay_outputs[i] = self.delay_lines[i].push_pop(self.feedback[i] + *input);
            let mut filtered_output = self.delay_outputs[i];
            if let Some(ap) = self.allpass_filters.as_mut() {
                filtered_output = ap[i].process(self.delay_outputs[i]);
            }
            wet += filtered_output;
            self.feedback_mix_buffer[i] = filtered_output * self.decay_coeffs[i];
        }

        // Perform Fast Walsh-Hadamard Transform (in-place on feedback_mix_buffer)
        let mut h = 1;
        while h < self.channels {
            // For N=8, h will be 1, 2, 4
            let mut i = 0;
            while i < self.channels {
                for j in i..(i + h) {
                    let x = self.feedback_mix_buffer[j];
                    let y = self.feedback_mix_buffer[j + h];
                    self.feedback_mix_buffer[j] = x + y;
                    self.feedback_mix_buffer[j + h] = x - y;
                }
                i += h * 2;
            }
            h *= 2;
        }

        // Apply normalization for energy preservation
        let norm_factor = 1.0 / (self.channels as f32).sqrt();

        for i in 0..self.channels {
            self.feedback[i] = self.feedback_mix_buffer[i] * norm_factor;
        }
        *input = *input * (1.0 - self.wet_mix) + self.wet_mix * wet * norm_factor;
    }
}

// --- Top-level Reverb Enum (Wrapper) ---
#[derive(Clone, Debug)]
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
        spread_ms: f32,
        decay_ms: f32,
        wet_mix: f32,
        channels: usize,
        diffusion_steps: usize, // number of allpass stages before mixing
    ) -> Self {
        // Removed RNG argument
        Reverb::FDN(Fdn::new(
            predelay_ms,
            spread_ms,
            decay_ms,
            channels,
            diffusion_steps,
            wet_mix,
            44_100.0,
        ))
    }
}

use core::fmt;
use rand::prelude::*; // Import Rng and thread_rng
use std::f32; // Use f32
use std::vec::Vec;

// --- DSP Primitives ---

/// Simple delay line using nearest-neighbor interpolation (integer delay).
/// Uses f32.
#[derive(Clone, Debug)]
struct DelayLine {
    buffer: Vec<f32>,
    write_pos: usize,
    mask: usize,
    is_power_of_two: bool,
}

impl DelayLine {
    pub fn new() -> Self {
        Self {
            buffer: vec![0.0; 1],
            write_pos: 0,
            mask: 0,
            is_power_of_two: true,
        }
    }

    pub fn resize(&mut self, max_delay_samples: usize) {
        let required_size = max_delay_samples + 1;
        let new_size = if required_size <= 1 {
            1
        } else {
            required_size
                .next_power_of_two()
                .min(required_size.saturating_mul(2))
        };

        if new_size != self.buffer.len() {
            self.buffer.resize(new_size, 0.0);
            self.reset();
            self.is_power_of_two = (new_size > 0) && (new_size & (new_size - 1)) == 0;
            self.mask = if self.is_power_of_two {
                new_size - 1
            } else {
                0
            };
        }
    }

    pub fn reset(&mut self) {
        self.buffer.fill(0.0);
        self.write_pos = 0;
    }

    #[inline]
    pub fn write(&mut self, sample: f32) {
        if self.write_pos < self.buffer.len() {
            self.buffer[self.write_pos] = sample;
            if self.is_power_of_two {
                self.write_pos = (self.write_pos + 1) & self.mask;
            } else if !self.buffer.is_empty() {
                self.write_pos = (self.write_pos + 1) % self.buffer.len();
            }
        } else if !self.buffer.is_empty() {
            self.write_pos = 0; // Attempt recovery
            self.buffer[self.write_pos] = sample;
        }
    }

    #[inline]
    pub fn read(&self, delay_samples: usize) -> f32 {
        let buffer_len = self.buffer.len();
        if buffer_len == 0 || delay_samples >= buffer_len {
            return 0.0;
        }
        let read_pos = if self.is_power_of_two {
            (self.write_pos.wrapping_sub(delay_samples).wrapping_sub(1)) & self.mask
        } else {
            (self.write_pos + buffer_len - delay_samples - 1) % buffer_len
        };
        // Read safely, return 0.0 if out of bounds (shouldn't happen with correct logic)
        *self.buffer.get(read_pos).unwrap_or(&0.0)
    }
}

// --- Random Number Helper ---
// Matches C++ example's simple rand() usage style, uses f32
fn random_in_range(low: f32, high: f32) -> f32 {
    if low >= high {
        return low;
    }
    rand::thread_rng().gen_range(low..high)
}

// --- Matrix Generation (Using f32) ---
fn generate_scaled_hadamard(order: usize) -> Option<Vec<Vec<f32>>> {
    if order == 0 || (order & (order - 1)) != 0 {
        return None;
    }
    if order == 1 {
        return Some(vec![vec![1.0]]);
    }
    if let Some(h_half) = generate_unscaled_hadamard_recursive(order / 2) {
        let n_half = order / 2;
        let mut h_order = vec![vec![0.0f32; order]; order];
        for r in 0..n_half {
            for c in 0..n_half {
                h_order[r][c] = h_half[r][c];
                h_order[r][c + n_half] = h_half[r][c];
                h_order[r + n_half][c] = h_half[r][c];
                h_order[r + n_half][c + n_half] = -h_half[r][c];
            }
        }
        let scale = 1.0 / (order as f32).sqrt();
        for row in h_order.iter_mut() {
            for val in row.iter_mut() {
                *val *= scale;
            }
        }
        Some(h_order)
    } else {
        None
    }
}
fn generate_unscaled_hadamard_recursive(order: usize) -> Option<Vec<Vec<f32>>> {
    if order == 0 || (order & (order - 1)) != 0 {
        return None;
    }
    if order == 1 {
        return Some(vec![vec![1.0]]);
    }
    if let Some(h_half) = generate_unscaled_hadamard_recursive(order / 2) {
        let n_half = order / 2;
        let mut h_order = vec![vec![0.0f32; order]; order];
        for r in 0..n_half {
            for c in 0..n_half {
                h_order[r][c] = h_half[r][c];
                h_order[r][c + n_half] = h_half[r][c];
                h_order[r + n_half][c] = h_half[r][c];
                h_order[r + n_half][c + n_half] = -h_half[r][c];
            }
        }
        Some(h_order)
    } else {
        None
    }
}
fn generate_householder(order: usize) -> Vec<Vec<f32>> {
    if order == 0 {
        return vec![];
    }
    if order == 1 {
        return vec![vec![-1.0]];
    }
    let mut rng = rand::thread_rng(); // Get RNG locally
    let mut v = vec![0.0; order];
    let mut v_norm_sq = 0.0;
    while v_norm_sq < 1e-9 {
        v_norm_sq = 0.0;
        for i in 0..order {
            v[i] = rng.gen_range(-1.0..1.0);
            v_norm_sq += v[i] * v[i];
        }
    }
    let mut h = vec![vec![0.0; order]; order];
    let factor = -2.0 / v_norm_sq;
    for r in 0..order {
        for c in 0..order {
            let vv_t = v[r] * v[c];
            h[r][c] = factor * vv_t;
        }
        h[r][r] += 1.0;
    }
    h
}
fn hadamard_in_place(data: &mut [f32]) {
    let n = data.len();
    if n == 0 || (n & (n - 1)) != 0 {
        return;
    }
    let mut h = 1;
    while h < n {
        for i in (0..n).step_by(h * 2) {
            for j in 0..h {
                let x = data[i + j];
                let y = data[i + j + h];
                data[i + j] = x + y;
                data[i + j + h] = x - y;
            }
        }
        h *= 2;
    }
}
#[inline]
fn matrix_vector_mult(matrix: &Vec<Vec<f32>>, vector: &[f32], out: &mut [f32]) {
    let n = matrix.len();
    if n == 0
        || matrix.get(0).map_or(true, |row| row.len() != n)
        || vector.len() != n
        || out.len() != n
    {
        out.fill(0.0);
        return;
    }
    for i in 0..n {
        let mut sum = 0.0;
        let matrix_row = &matrix[i];
        for j in 0..n {
            sum += matrix_row[j] * vector[j];
        }
        // NO EPSILON CHECK
        out[i] = sum;
    }
}

// --- Reverb Components (Using f32) ---

#[derive(Clone, Debug)]
struct DiffusionStep {
    num_channels: usize,
    delay_ms_range: f32,
    delay_samples: Vec<usize>,
    delays: Vec<DelayLine>,
    flip_polarity: Vec<bool>,
    temp_buffer: Vec<f32>, // Used for both delayed and mixed
}

impl DiffusionStep {
    pub fn new(num_channels: usize, delay_ms_range: f32) -> Self {
        assert!(num_channels > 0);
        Self {
            num_channels,
            delay_ms_range,
            delay_samples: vec![0; num_channels],
            delays: (0..num_channels).map(|_| DelayLine::new()).collect(),
            flip_polarity: vec![false; num_channels],
            temp_buffer: vec![0.0; num_channels],
        }
    }

    pub fn configure(&mut self, sample_rate: f32) {
        let delay_samples_range = self.delay_ms_range * 0.001 * sample_rate;
        let mut max_delay = 0;
        let mut rng = rand::thread_rng(); // Local RNG
        for c in 0..self.num_channels {
            let range_low = delay_samples_range * (c as f32) / (self.num_channels as f32);
            let range_high = delay_samples_range * ((c + 1) as f32) / (self.num_channels as f32);
            let delay = random_in_range(range_low, range_high).round().max(0.0) as usize;
            self.delay_samples[c] = delay;
            if delay > max_delay {
                max_delay = delay;
            }
            self.flip_polarity[c] = (rng.gen::<u32>() % 2) == 1; // Match C++ rand()%2 style
        }
        for delay_line in self.delays.iter_mut() {
            delay_line.resize(max_delay);
            delay_line.reset();
        }
    }

    pub fn reset(&mut self) {
        for delay_line in self.delays.iter_mut() {
            delay_line.reset();
        }
        self.temp_buffer.fill(0.0);
    }

    /// Processes one block of samples in-place. Matches C++ `process(Array input)` return logic.
    /// NOTE: The C++ returns `mixed`, but modifies `input` internally. Rust requires explicit handling.
    /// This version modifies the input `buffer` in place, which is common in Rust DSP.
    #[inline]
    pub fn process(&mut self, buffer: &mut [f32]) {
        debug_assert_eq!(buffer.len(), self.num_channels);
        debug_assert_eq!(self.temp_buffer.len(), self.num_channels);

        // 1. Delay (Write input, Read delayed into temp_buffer)
        for c in 0..self.num_channels {
            self.delays[c].write(buffer[c]);
            self.temp_buffer[c] = self.delays[c].read(self.delay_samples[c]);
        }

        // 2. Hadamard Mix (in-place on temp_buffer)
        hadamard_in_place(&mut self.temp_buffer);

        // 3. Flip Polarity & Copy back to output (original buffer slice)
        for c in 0..self.num_channels {
            let mixed_val = self.temp_buffer[c];
            buffer[c] = if self.flip_polarity[c] {
                -mixed_val
            } else {
                mixed_val
            };
        }
    }
}

#[derive(Clone, Debug)]
struct DiffuserHalfLengths {
    num_channels: usize,
    step_count: usize,
    steps: Vec<DiffusionStep>,
}

impl DiffuserHalfLengths {
    pub fn new(num_channels: usize, step_count: usize, initial_diffusion_ms: f32) -> Self {
        assert!(step_count > 0);
        let mut steps = Vec::with_capacity(step_count);
        let mut current_diffusion_ms = initial_diffusion_ms;
        for _ in 0..step_count {
            current_diffusion_ms *= 0.5;
            steps.push(DiffusionStep::new(
                num_channels,
                current_diffusion_ms.max(0.0),
            ));
        }
        Self {
            num_channels,
            step_count,
            steps,
        }
    }

    pub fn configure(&mut self, sample_rate: f32) {
        for step in self.steps.iter_mut() {
            step.configure(sample_rate);
        }
    }

    pub fn reset(&mut self) {
        for step in self.steps.iter_mut() {
            step.reset();
        }
    }

    /// Processes one block of samples in-place.
    #[inline]
    pub fn process(&mut self, samples: &mut [f32]) {
        debug_assert_eq!(samples.len(), self.num_channels);
        for step in self.steps.iter_mut() {
            step.process(samples);
        }
    }
}

#[derive(Clone, Debug)]
struct FeedbackLoop {
    num_channels: usize,
    delay_ms: f32,
    decay_gain: f32,
    delay_samples: Vec<usize>,
    delays: Vec<DelayLine>,
    feedback_matrix: Vec<Vec<f32>>,
    delayed_buffer: Vec<f32>,
    mixed_buffer: Vec<f32>,
}

impl FeedbackLoop {
    pub fn new(num_channels: usize, delay_ms: f32, decay_gain: f32) -> Self {
        assert!(num_channels > 0);
        let feedback_matrix = generate_householder(num_channels); // Uses local RNG

        Self {
            num_channels,
            delay_ms,
            decay_gain: decay_gain.clamp(0.0, 1.0), // Clamp initial gain
            delay_samples: vec![0; num_channels],
            delays: (0..num_channels).map(|_| DelayLine::new()).collect(),
            feedback_matrix,
            delayed_buffer: vec![0.0; num_channels],
            mixed_buffer: vec![0.0; num_channels],
        }
    }

    pub fn configure(&mut self, sample_rate: f32) {
        let delay_samples_base = self.delay_ms * 0.001 * sample_rate;
        let mut max_delay = 0;
        for c in 0..self.num_channels {
            let r = c as f32 / self.num_channels as f32;
            let delay = if delay_samples_base < 0.0 {
                0
            } else {
                (2.0f32.powf(r) * delay_samples_base).round().max(0.0) as usize
            };
            self.delay_samples[c] = delay;
            if delay > max_delay {
                max_delay = delay;
            }
        }
        for delay_line in self.delays.iter_mut() {
            delay_line.resize(max_delay);
            delay_line.reset();
        }
    }

    pub fn reset(&mut self) {
        for delay_line in self.delays.iter_mut() {
            delay_line.reset();
        }
        self.delayed_buffer.fill(0.0);
        self.mixed_buffer.fill(0.0);
    }

    /// Processes one block of samples. Writes result into the `output` buffer.
    /// Matches C++ return logic (returns delayed signal before mix).
    #[inline]
    pub fn process(&mut self, input: &[f32], output: &mut [f32]) {
        debug_assert_eq!(input.len(), self.num_channels);
        debug_assert_eq!(output.len(), self.num_channels);

        // 1. Read delayed signals into internal delayed_buffer
        for c in 0..self.num_channels {
            self.delayed_buffer[c] = self.delays[c].read(self.delay_samples[c]);
            // NO EPSILON CHECK
        }

        // 2. Mix delayed signals using Householder matrix into internal mixed_buffer
        matrix_vector_mult(
            &self.feedback_matrix,
            &self.delayed_buffer,
            &mut self.mixed_buffer,
        );
        // NO EPSILON CHECK in matrix_vector_mult

        // 3. Calculate values to write back & write
        for c in 0..self.num_channels {
            let write_value = input[c] + self.mixed_buffer[c] * self.decay_gain;
            // NO LIMITER, NO EPSILON CHECK
            // NaN check IS good practice even if not in C++ example (float safety)
            self.delays[c].write(if write_value.is_finite() {
                write_value
            } else {
                0.0
            });
        }

        // 4. Copy the delayed signals (read at the start) to the output buffer
        output.copy_from_slice(&self.delayed_buffer);
    }
}

// --- ReverbType Enum ---
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum ReverbType {
    SignalsmithFDN,
}

// --- ReverbStateTrait ---
pub trait ReverbStateTrait: Clone + 'static + fmt::Debug {
    fn reset(&mut self);
    fn process(&mut self, buffer: &mut [f32]);
    fn set_decay_control(&mut self, rt60_seconds: f32);
    fn set_dry_wet(&mut self, mix: f32);
    fn configure(&mut self, sample_rate: f32); // Remove RNG from trait
}

// --- Signalsmith FDN State Implementation ---
#[derive(Clone, Debug)]
pub struct SignalsmithReverbState {
    num_channels: usize,
    diffusion_steps: usize,
    room_size_ms: f32,
    rt60_seconds: f32,
    dry_wet: f32,
    // No sample_rate needed if RT60 calc is time-based
    diffuser: DiffuserHalfLengths,
    feedback_loop: FeedbackLoop,
    channel_buffer: Vec<f32>,
    feedback_output_buffer: Vec<f32>,
    dry_level: f32,
    wet_level: f32,
}

impl SignalsmithReverbState {
    fn new(
        num_channels: usize,
        diffusion_steps: usize,
        room_size_ms: f32,
        rt60: f32,
        dry_wet: f32,
    ) -> Self {
        assert!(num_channels > 0 && (num_channels & (num_channels - 1)) == 0);
        assert!(rt60 >= 0.0);
        assert!(dry_wet >= 0.0 && dry_wet <= 1.0);

        let diffuser = DiffuserHalfLengths::new(num_channels, diffusion_steps, room_size_ms);
        // Pass 0.0 decay gain initially, will be set by set_rt60_internal
        let feedback_loop = FeedbackLoop::new(num_channels, room_size_ms, 0.0);

        let initial_dry_wet = dry_wet.clamp(0.0, 1.0);

        let mut instance = Self {
            num_channels,
            diffusion_steps,
            room_size_ms: room_size_ms.max(0.0),
            rt60_seconds: 0.0,
            dry_wet: initial_dry_wet,
            diffuser,
            feedback_loop,
            channel_buffer: vec![0.0; num_channels],
            feedback_output_buffer: vec![0.0; num_channels],
            dry_level: 1.0 - initial_dry_wet,
            wet_level: initial_dry_wet,
        };
        instance.set_rt60_internal(rt60); // Set initial decay gain
        instance
    }

    fn set_rt60_internal(&mut self, rt60_seconds: f32) {
        self.rt60_seconds = rt60_seconds.max(0.0);
        let typical_loop_ms = self.room_size_ms * 1.5;
        let decay_gain = if typical_loop_ms <= 1e-6 || self.rt60_seconds <= 1e-6 {
            0.0
        } else {
            let loops_per_rt60 = self.rt60_seconds / (typical_loop_ms * 0.001);
            if loops_per_rt60 <= 1e-6 {
                0.0
            } else {
                let db_per_cycle = -60.0 / loops_per_rt60;
                10.0f32.powf(db_per_cycle * 0.05)
            }
        }
        .clamp(0.0, 1.0); // Clamp strictly to 1.0 max
        self.feedback_loop.decay_gain = decay_gain;
    }

    fn update_mix_levels(&mut self) {
        self.dry_level = 1.0 - self.dry_wet;
        self.wet_level = self.dry_wet;
    }
}

impl ReverbStateTrait for SignalsmithReverbState {
    fn reset(&mut self) {
        self.diffuser.reset();
        self.feedback_loop.reset();
        self.channel_buffer.fill(0.0);
        self.feedback_output_buffer.fill(0.0);
    }

    fn set_decay_control(&mut self, rt60_seconds: f32) {
        assert!(rt60_seconds >= 0.0);
        self.set_rt60_internal(rt60_seconds);
    }

    fn set_dry_wet(&mut self, mix: f32) {
        assert!(mix >= 0.0 && mix <= 1.0);
        self.dry_wet = mix;
        self.update_mix_levels();
    }

    fn configure(&mut self, sample_rate: f32) {
        // Removed RNG argument
        assert!(sample_rate > 0.0);
        // RNG needed only for initial setup, configure just needs SR
        self.diffuser.configure(sample_rate);
        self.feedback_loop.configure(sample_rate);
        self.reset();
    }

    #[inline]
    fn process(&mut self, buffer: &mut [f32]) {
        for sample_in_out in buffer.iter_mut() {
            let original_input = *sample_in_out;

            self.channel_buffer.fill(original_input);
            self.diffuser.process(&mut self.channel_buffer);
            self.feedback_loop
                .process(&self.channel_buffer, &mut self.feedback_output_buffer);

            let wet_signal = if !self.feedback_output_buffer.is_empty() {
                // NO EPSILON CHECK
                self.feedback_output_buffer[0]
            } else {
                0.0
            };

            let output_sample = original_input * self.dry_level + wet_signal * self.wet_level;

            // NO EPSILON CHECK, NO LIMITER, only basic NaN/Inf check + clamp
            *sample_in_out = if output_sample.is_finite() {
                output_sample.clamp(-1.0, 1.0) // Basic clipping to prevent audio hardware issues
            } else {
                0.0
            };
        }
    }
}

// --- Top-level Reverb Enum (Wrapper) ---
#[derive(Clone, Debug)]
pub enum Reverb {
    SignalsmithFDN(SignalsmithReverbState),
}

impl Reverb {
    pub fn get_type(&self) -> ReverbType {
        ReverbType::SignalsmithFDN
    }
    pub fn reset(&mut self) {
        match self {
            Reverb::SignalsmithFDN(s) => s.reset(),
        }
    }
    #[inline]
    pub fn process(&mut self, buffer: &mut [f32]) {
        match self {
            Reverb::SignalsmithFDN(s) => s.process(buffer),
        }
    }
    pub fn set_decay_control(&mut self, rt60_seconds: f32) {
        match self {
            Reverb::SignalsmithFDN(s) => s.set_decay_control(rt60_seconds),
        }
    }
    pub fn set_dry_wet(&mut self, mix: f32) {
        match self {
            Reverb::SignalsmithFDN(s) => s.set_dry_wet(mix),
        }
    }
    pub fn configure(&mut self, sample_rate: f32) {
        // Removed RNG argument
        match self {
            Reverb::SignalsmithFDN(s) => s.configure(sample_rate),
        }
    }

    pub fn new_signalsmith(
        num_channels: usize,
        diffusion_steps: usize,
        room_size_ms: f32,
        rt60: f32,
        dry_wet: f32,
    ) -> Self {
        // Removed RNG argument
        Reverb::SignalsmithFDN(SignalsmithReverbState::new(
            num_channels,
            diffusion_steps,
            room_size_ms,
            rt60,
            dry_wet,
        ))
    }
}

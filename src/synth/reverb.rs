use core::fmt;
use rand::prelude::*; // Import Rng and thread_rng
use std::vec::Vec;

// --- Epsilon Constant ---
/// A small threshold to force near-zero values to zero, preventing denormal issues.
const DSP_EPSILON: f32 = 1.0e-10; // Adjust if necessary

// --- DSP Primitives ---

/// Simple delay line using nearest-neighbor interpolation (integer delay).
#[derive(Clone, Debug)]
struct DelayLine {
    buffer: Vec<f32>,
    write_pos: usize,
    mask: usize, // For efficient modulo using bitwise AND if buffer size is power of 2
    is_power_of_two: bool,
}

impl DelayLine {
    pub fn new() -> Self {
        Self {
            buffer: vec![0.0; 1], // Start with minimal size
            write_pos: 0,
            mask: 0,
            is_power_of_two: true, // 1 is 2^0
        }
    }

    /// Resizes the buffer to be at least `max_delay_samples + 1`.
    /// Tries to use a power-of-two size for efficiency.
    pub fn resize(&mut self, max_delay_samples: usize) {
        let required_size = max_delay_samples + 1; // Need space for current write + max delay read

        let new_size = if required_size <= 1 {
            1
        } else {
            // Find next power of 2 for efficiency, or use required_size if too large
            // Limit growth to avoid excessive memory allocation
            let next_pow2 = required_size.next_power_of_two();
            if next_pow2 <= required_size.saturating_mul(2) {
                // Check for overflow
                next_pow2
            } else {
                required_size
            }
        };

        if new_size != self.buffer.len() {
            self.buffer.resize(new_size, 0.0);
            // Reset state if resized
            self.reset();
            self.is_power_of_two = (new_size > 0) && (new_size & (new_size - 1)) == 0;
            if self.is_power_of_two {
                self.mask = new_size - 1;
            } else {
                self.mask = 0; // Indicate not power of two
            }
            // println!("Resized delay line to {}", new_size); // Debug
        }
    }

    /// Resets the delay line contents and write position.
    pub fn reset(&mut self) {
        self.buffer.fill(0.0);
        self.write_pos = 0;
    }

    /// Writes a sample into the delay line.
    #[inline]
    pub fn write(&mut self, sample: f32) {
        self.buffer[self.write_pos] = sample;
        if self.is_power_of_two {
            self.write_pos = (self.write_pos + 1) & self.mask;
        } else if !self.buffer.is_empty() {
            self.write_pos = (self.write_pos + 1) % self.buffer.len();
        }
        // Else: buffer is empty, should not happen with resize logic
    }

    /// Reads a sample from the delay line with the specified integer delay.
    #[inline]
    pub fn read(&self, delay_samples: usize) -> f32 {
        let buffer_len = self.buffer.len();
        if buffer_len == 0 || delay_samples >= buffer_len {
            // Handle invalid delay or uninitialized buffer
            // eprintln!("Warning: Invalid delay read (delay={}, len={})", delay_samples, buffer_len);
            return 0.0;
        }

        // Calculate read position using wrapping subtraction
        let read_pos = if self.is_power_of_two {
            // Use bitmask for power-of-two lengths
            (self.write_pos.wrapping_sub(delay_samples).wrapping_sub(1)) & self.mask
        } else {
            // Use modulo for non-power-of-two lengths
            // Equivalent to (write_pos - delay_samples - 1 + buffer_len) % buffer_len
            (self.write_pos + buffer_len - delay_samples - 1) % buffer_len
        };

        // Bounds check read_pos (should be unnecessary with correct modulo/mask)
        // if read_pos >= buffer_len {
        //     eprintln!("Error: Invalid calculated read_pos {}", read_pos);
        //     return 0.0;
        // }

        self.buffer[read_pos]
    }
}

// --- Random Number Helper ---
fn random_in_range(low: f32, high: f32, rng: &mut ThreadRng) -> f32 {
    if low >= high {
        return low;
    }
    rng.gen_range(low..high)
}

// --- Matrix Generation ---

/// Generates a Hadamard matrix of a given order using Sylvester's construction,
/// scaled by 1/sqrt(N) for use as an energy-preserving feedback matrix (approximately).
/// Order must be a power of 2.
fn generate_scaled_hadamard(order: usize) -> Option<Vec<Vec<f32>>> {
    if order == 0 || (order & (order - 1)) != 0 {
        return None;
    } // Not power of 2 or 0
    if order == 1 {
        return Some(vec![vec![1.0]]);
    }

    if let Some(h_half) = generate_unscaled_hadamard_recursive(order / 2) {
        let n_half = order / 2;
        let mut h_order = vec![vec![0.0f32; order]; order];
        // Fill the four quadrants based on Sylvester's construction
        for r in 0..n_half {
            for c in 0..n_half {
                h_order[r][c] = h_half[r][c]; // Top-left = H_half
                h_order[r][c + n_half] = h_half[r][c]; // Top-right = H_half
                h_order[r + n_half][c] = h_half[r][c]; // Bottom-left = H_half
                h_order[r + n_half][c + n_half] = -h_half[r][c]; // Bottom-right = -H_half
            }
        }
        // Apply scaling for energy preservation (approximately)
        let scale = 1.0 / (order as f32).sqrt();
        for row in h_order.iter_mut() {
            for val in row.iter_mut() {
                *val *= scale;
            }
        }
        Some(h_order)
    } else {
        // Should not happen if initial validation is correct
        None
    }
}

/// Recursive helper to generate unscaled (+1/-1) Hadamard matrix.
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

/// Generates a Householder reflection matrix H = I - 2*v*v^T / (v^T*v)
/// where v is a randomly generated vector. Creates *a* random orthogonal matrix.
fn generate_householder(order: usize, rng: &mut ThreadRng) -> Vec<Vec<f32>> {
    if order == 0 {
        return vec![];
    }
    if order == 1 {
        return vec![vec![-1.0]];
    } // Reflection in 1D is just negation

    // 1. Generate a random vector 'v' (ensure non-zero)
    let mut v = vec![0.0; order];
    let mut v_norm_sq = 0.0;
    while v_norm_sq < 1e-9 {
        // Retry if vector is too close to zero
        v_norm_sq = 0.0;
        for i in 0..order {
            v[i] = rng.gen_range(-1.0..1.0);
            v_norm_sq += v[i] * v[i];
        }
    }

    // 2. Calculate H = I - 2 * v * v^T / v_norm_sq
    let mut h = vec![vec![0.0; order]; order];
    let factor = -2.0 / v_norm_sq;

    for r in 0..order {
        for c in 0..order {
            let vv_t = v[r] * v[c]; // Outer product element v[r]*v[c]
            h[r][c] = factor * vv_t;
        }
        h[r][r] += 1.0; // Add the Identity matrix part
    }
    h
}

/// In-place Hadamard transform (requires order = power of 2).
/// Uses the Fast Walsh-Hadamard Transform algorithm.
fn hadamard_in_place(data: &mut [f32]) {
    let n = data.len();
    if n == 0 || (n & (n - 1)) != 0 {
        return;
    } // Only powers of 2

    let mut h = 1;
    while h < n {
        // Combine elements separated by distance h
        for i in (0..n).step_by(h * 2) {
            // Start of each 2h block
            for j in 0..h {
                // Offset within the first h block
                let x = data[i + j];
                let y = data[i + j + h];
                data[i + j] = x + y; // Butterfly operation (+)
                data[i + j + h] = x - y; // Butterfly operation (-)
            }
        }
        h *= 2; // Double the stride for the next pass
    }
    // Note: Scaling (e.g., by 1/sqrt(N)) is often done separately if needed for energy preservation.
}

// --- **Standalone** Matrix-Vector Multiplication Helper ---
#[inline]
fn matrix_vector_mult(matrix: &Vec<Vec<f32>>, vector: &[f32], out: &mut [f32]) {
    let n = matrix.len();
    // Basic dimension check
    if n == 0
        || matrix.get(0).map_or(true, |row| row.len() != n)
        || vector.len() != n
        || out.len() != n
    {
        out.fill(0.0); // Ensure output is cleared on error
        return;
    }
    for i in 0..n {
        // Output row index
        let mut sum = 0.0;
        let matrix_row = &matrix[i]; // Cache row reference
        for j in 0..n {
            // Input vector index / Matrix column index
            sum += matrix_row[j] * vector[j];
        }
        // Optional Epsilon check to zero out tiny results
        out[i] = if sum.abs() < DSP_EPSILON { 0.0 } else { sum };
    }
}

// --- Reverb Components ---

#[derive(Clone, Debug)]
struct DiffusionStep {
    num_channels: usize,
    delay_ms_range: f32,
    delay_samples: Vec<usize>,
    delays: Vec<DelayLine>,
    flip_polarity: Vec<bool>,
    // Store pre-allocated temp buffer to avoid allocation in process loop
    temp_buffer: Vec<f32>,
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
            temp_buffer: vec![0.0; num_channels], // Pre-allocate
        }
    }

    pub fn configure(&mut self, sample_rate: f32, rng: &mut ThreadRng) {
        let delay_samples_range = self.delay_ms_range * 0.001 * sample_rate;
        let mut max_delay = 0;
        for c in 0..self.num_channels {
            // Distribute delay times within segments (like velvet noise)
            let range_low = delay_samples_range * (c as f32) / (self.num_channels as f32);
            let range_high = delay_samples_range * ((c + 1) as f32) / (self.num_channels as f32);
            let delay = random_in_range(range_low, range_high, rng).round().max(0.0) as usize; // Ensure non-negative
            self.delay_samples[c] = delay;
            if delay > max_delay {
                max_delay = delay;
            }

            self.flip_polarity[c] = rng.gen_bool(0.5); // Random polarity flip
        }

        // Resize all delay lines to accommodate the largest delay in this step
        for delay_line in self.delays.iter_mut() {
            delay_line.resize(max_delay);
            delay_line.reset(); // Reset after resizing
        }
    }

    pub fn reset(&mut self) {
        for delay_line in self.delays.iter_mut() {
            delay_line.reset();
        }
    }

    /// Processes one block of samples in-place.
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
            // Each step gets half the remaining time (approximately)
            current_diffusion_ms *= 0.5;
            steps.push(DiffusionStep::new(
                num_channels,
                current_diffusion_ms.max(0.0),
            )); // Ensure non-negative
        }
        // Note: C++ example iterates forward, so shortest delays applied first.
        // If longest first is desired, reverse `steps` here. Let's match C++ for now.
        Self {
            num_channels,
            step_count,
            steps,
        }
    }

    pub fn configure(&mut self, sample_rate: f32, rng: &mut ThreadRng) {
        for step in self.steps.iter_mut() {
            step.configure(sample_rate, rng);
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
    decay_gain: f32, // Internal decay gain (0.0 to < 1.0 ideally)
    delay_samples: Vec<usize>,
    delays: Vec<DelayLine>,
    feedback_matrix: Vec<Vec<f32>>, // e.g., Householder
    // Temp buffers to avoid allocations in process
    delayed_buffer: Vec<f32>,
    mixed_buffer: Vec<f32>,
}

impl FeedbackLoop {
    pub fn new(num_channels: usize, delay_ms: f32, decay_gain: f32, rng: &mut ThreadRng) -> Self {
        assert!(num_channels > 0);
        // Generate Householder matrix for feedback mixing
        let feedback_matrix = generate_householder(num_channels, rng);

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
            // Distribute delay times exponentially between delayMs and 2*delayMs (like C++)
            let r = c as f32 / self.num_channels as f32; // Ratio 0..1
                                                         // Ensure base is non-negative before powf
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
        // Resize delays
        for delay_line in self.delays.iter_mut() {
            delay_line.resize(max_delay);
            delay_line.reset(); // Reset after resize
        }
    }

    pub fn reset(&mut self) {
        for delay_line in self.delays.iter_mut() {
            delay_line.reset();
        }
        // Clear temp buffers? Optional, but good practice.
        self.delayed_buffer.fill(0.0);
        self.mixed_buffer.fill(0.0);
    }

    /// Processes one block of samples. Writes result into the `output` buffer.
    #[inline]
    pub fn process(&mut self, input: &[f32], output: &mut [f32]) {
        debug_assert_eq!(input.len(), self.num_channels);
        debug_assert_eq!(output.len(), self.num_channels);

        // 1. Read delayed signals into internal delayed_buffer
        for c in 0..self.num_channels {
            self.delayed_buffer[c] = self.delays[c].read(self.delay_samples[c]);
            // Optional Epsilon Check on Read
            // if self.delayed_buffer[c].abs() < DSP_EPSILON { self.delayed_buffer[c] = 0.0; }
        }

        // 2. Mix delayed signals using Householder matrix into internal mixed_buffer
        // Call the standalone function
        matrix_vector_mult(
            &self.feedback_matrix,
            &self.delayed_buffer,
            &mut self.mixed_buffer,
        );
        // Epsilon checks now happen inside matrix_vector_mult

        // 3. Calculate values to write back & write
        for c in 0..self.num_channels {
            let write_value = input[c] + self.mixed_buffer[c] * self.decay_gain;
            // Apply tanh() limiter inside the loop for stability!
            let limited_value = write_value.tanh();
            // Epsilon check before writing (important to prevent lingering zeros)
            let final_value = if limited_value.abs() < DSP_EPSILON {
                0.0
            } else {
                limited_value
            };
            self.delays[c].write(final_value);
        }

        // 4. Copy the delayed signals (read at the start) to the output buffer
        output.copy_from_slice(&self.delayed_buffer);
    }
}

// --- ReverbType Enum ---
/// Identifies the type of reverb algorithm.
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum ReverbType {
    /// Reverb based on the Signalsmith blog post structure.
    SignalsmithFDN,
}

// --- ReverbStateTrait ---
/// Trait defining the common interface for reverb state implementations.
pub trait ReverbStateTrait: Clone + 'static + fmt::Debug {
    /// Resets the internal state (delay lines, etc.).
    fn reset(&mut self);
    /// Processes a single input sample and returns a single output sample.
    fn process(&mut self, input: f32) -> f32;
    /// Sets the target RT60 in seconds. Affects internal decay gain.
    fn set_decay_control(&mut self, rt60_seconds: f32);
    /// Sets the dry/wet mix (0.0 = dry, 1.0 = wet).
    fn set_dry_wet(&mut self, mix: f32);
    /// Configures internal delays based on sample rate. Must be called before processing
    /// or when sample rate changes. Requires RNG for diffuser setup.
    fn configure(&mut self, sample_rate: f32, rng: &mut ThreadRng);
}

// --- Signalsmith FDN State Implementation ---

/// State struct holding the components and parameters for the Signalsmith-style reverb.
#[derive(Clone, Debug)]
pub struct SignalsmithReverbState {
    num_channels: usize,
    diffusion_steps: usize,
    room_size_ms: f32, // Store room size to recalculate decay
    rt60_seconds: f32, // Store target RT60
    dry_wet: f32,      // Store the mix parameter directly
    diffuser: DiffuserHalfLengths,
    feedback_loop: FeedbackLoop,
    // Buffers moved inside state struct
    channel_buffer: Vec<f32>,
    feedback_output_buffer: Vec<f32>, // Buffer to receive feedback loop output
}

impl SignalsmithReverbState {
    /// Creates a new state instance. Internal use by `Reverb::new_signalsmith`.
    fn new(
        num_channels: usize,
        diffusion_steps: usize,
        room_size_ms: f32,
        rt60: f32,    // Initial RT60
        dry_wet: f32, // Initial dry/wet
        rng: &mut ThreadRng,
    ) -> Self {
        assert!(
            num_channels > 0 && (num_channels & (num_channels - 1)) == 0,
            "num_channels must be a power of 2"
        );
        assert!(rt60 >= 0.0, "RT60 must be non-negative");
        assert!(
            dry_wet >= 0.0 && dry_wet <= 1.0,
            "Dry/wet mix must be between 0.0 and 1.0."
        );

        let diffuser = DiffuserHalfLengths::new(num_channels, diffusion_steps, room_size_ms);
        // Initial decay gain 0.0, set properly by set_rt60_internal below
        let feedback_loop = FeedbackLoop::new(num_channels, room_size_ms, 0.0, rng);

        let mut instance = Self {
            num_channels,
            diffusion_steps,
            room_size_ms: room_size_ms.max(0.0), // Ensure non-negative
            rt60_seconds: 0.0,                   // Will be set
            dry_wet: dry_wet.clamp(0.0, 1.0),
            diffuser,
            feedback_loop,
            channel_buffer: vec![0.0; num_channels],
            feedback_output_buffer: vec![0.0; num_channels], // Initialize buffer
        };
        // Set initial decay based on rt60
        instance.set_rt60_internal(rt60);
        instance
    }

    /// Internal method to calculate and set the feedback loop's decay gain.
    fn set_rt60_internal(&mut self, rt60_seconds: f32) {
        self.rt60_seconds = rt60_seconds.max(0.0); // Store the RT60 value

        // Estimate average loop time (as per article/code)
        let typical_loop_ms = self.room_size_ms * 1.5;
        let decay_gain = if typical_loop_ms <= 1e-6 || self.rt60_seconds <= 1e-6 {
            0.0 // Avoid division by zero or log(0) / Handle zero RT60 case
        } else {
            let loops_per_rt60 = self.rt60_seconds / (typical_loop_ms * 0.001);
            // Check if loops_per_rt60 is too small (e.g. RT60 is shorter than loop time)
            if loops_per_rt60 <= 1e-6 {
                0.0 // Decay immediately
            } else {
                let db_per_cycle = -60.0 / loops_per_rt60;
                // Convert dB to linear gain: gain = 10^(dB / 20)
                10.0f32.powf(db_per_cycle * 0.05)
            }
        }
        .clamp(0.0, 0.99995); // Ensure valid gain, clamp slightly below 1.0 for stability

        self.feedback_loop.decay_gain = decay_gain;
        // println!("Set decay gain to {:.6} for RT60 {:.2}s", decay_gain, self.rt60_seconds); // Debug
    }
}

// Implement the trait for the state struct
impl ReverbStateTrait for SignalsmithReverbState {
    fn reset(&mut self) {
        self.diffuser.reset();
        self.feedback_loop.reset();
        // Clear processing buffers
        self.channel_buffer.fill(0.0);
        self.feedback_output_buffer.fill(0.0);
    }

    /// Sets the target RT60 decay time in seconds.
    fn set_decay_control(&mut self, rt60_seconds: f32) {
        assert!(rt60_seconds >= 0.0, "RT60 must be non-negative.");
        self.set_rt60_internal(rt60_seconds);
    }

    /// Sets the dry/wet mix balance (0.0 = fully dry, 1.0 = fully wet).
    fn set_dry_wet(&mut self, mix: f32) {
        assert!(
            mix >= 0.0 && mix <= 1.0,
            "Dry/wet mix must be between 0.0 and 1.0."
        );
        self.dry_wet = mix;
    }

    /// Configures internal delays based on sample rate. Must be called before processing
    /// or when sample rate changes. Requires RNG for diffuser setup.
    fn configure(&mut self, sample_rate: f32, rng: &mut ThreadRng) {
        assert!(sample_rate > 0.0, "Sample rate must be positive.");
        self.diffuser.configure(sample_rate, rng);
        self.feedback_loop.configure(sample_rate);
        // Reset state after configuration changes
        self.reset();
    }

    #[inline]
    fn process(&mut self, input_sample: f32) -> f32 {
        // 1. Split mono input to N channels
        // Ensure buffer has correct size (should be handled by constructor)
        debug_assert_eq!(self.channel_buffer.len(), self.num_channels);
        self.channel_buffer.fill(input_sample);

        // 2. Process through diffuser (in-place on channel_buffer)
        self.diffuser.process(&mut self.channel_buffer);

        // 3. Process through feedback loop
        // Input is self.channel_buffer (diffused)
        // Output written into self.feedback_output_buffer
        self.feedback_loop
            .process(&self.channel_buffer, &mut self.feedback_output_buffer);
        // feedback_output_buffer now holds the delayed signals ('long_lasting')

        // 4. Mixdown and combine with dry signal
        // Use first channel of feedback output as wet signal (as per article)
        let wet_signal = if !self.feedback_output_buffer.is_empty() {
            // Optional Epsilon check on wet signal component before mixing
            if self.feedback_output_buffer[0].abs() < DSP_EPSILON {
                0.0
            } else {
                self.feedback_output_buffer[0]
            }
        } else {
            0.0
        };

        // Calculate dry/wet levels for mixing
        let dry_level = 1.0 - self.dry_wet;
        let wet_level = self.dry_wet;

        let output_sample = input_sample * dry_level + wet_signal * wet_level;

        // Final clamp/safety check
        let final_output = output_sample.clamp(-1.0, 1.0);
        // Apply epsilon check to final output
        if final_output.abs() < DSP_EPSILON || !final_output.is_finite() {
            0.0
        } else {
            final_output
        }
    }
}

// --- Top-level Reverb Enum (Wrapper) ---

/// Top-level enum wrapping the reverb state implementation(s).
#[derive(Clone, Debug)]
pub enum Reverb {
    /// Reverb based on the Signalsmith blog post structure.
    SignalsmithFDN(SignalsmithReverbState),
}

impl Reverb {
    /// Returns the specific type of the reverb algorithm.
    pub fn get_type(&self) -> ReverbType {
        match self {
            Reverb::SignalsmithFDN(_) => ReverbType::SignalsmithFDN,
        }
    }

    /// Resets the internal state of the reverb.
    pub fn reset(&mut self) {
        match self {
            Reverb::SignalsmithFDN(s) => s.reset(),
        }
    }

    /// Processes a single input sample through the reverb.
    #[inline]
    pub fn process(&mut self, input: f32) -> f32 {
        match self {
            Reverb::SignalsmithFDN(s) => s.process(input),
        }
    }

    /// Sets the target RT60 decay time in seconds.
    pub fn set_decay_control(&mut self, rt60_seconds: f32) {
        match self {
            Reverb::SignalsmithFDN(s) => s.set_decay_control(rt60_seconds),
        }
    }

    /// Sets the dry/wet mix (0.0 = dry, 1.0 = wet).
    pub fn set_dry_wet(&mut self, mix: f32) {
        match self {
            Reverb::SignalsmithFDN(s) => s.set_dry_wet(mix),
        }
    }

    /// Configures internal delays based on sample rate. Must be called before processing
    /// or when sample rate changes. Requires RNG for diffuser setup.
    pub fn configure(&mut self, sample_rate: f32, rng: &mut ThreadRng) {
        match self {
            Reverb::SignalsmithFDN(s) => s.configure(sample_rate, rng),
        }
    }

    /// Creates a new Signalsmith-style FDN reverb instance, wrapped in the Reverb enum.
    ///
    /// # Arguments
    ///
    /// * `num_channels`: Internal channel count (must be power of 2, e.g., 8).
    /// * `diffusion_steps`: Number of diffusion steps (e.g., 4).
    /// * `room_size_ms`: Controls diffusion delay lengths and average feedback delay.
    /// * `rt60`: Target reverberation time in seconds.
    /// * `dry_wet`: Initial dry/wet mix (0.0 to 1.0).
    /// * `rng`: A mutable reference to a thread-local random number generator.
    ///
    /// # Panics
    /// Propagates panics from `SignalsmithReverbState::new`.
    pub fn new_signalsmith(
        num_channels: usize,
        diffusion_steps: usize,
        room_size_ms: f32,
        rt60: f32,
        dry_wet: f32,
        rng: &mut ThreadRng,
    ) -> Self {
        Reverb::SignalsmithFDN(SignalsmithReverbState::new(
            num_channels,
            diffusion_steps,
            room_size_ms,
            rt60,
            dry_wet,
            rng,
        ))
    }
}

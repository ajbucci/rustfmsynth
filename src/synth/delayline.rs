use core::f32::consts::TAU;

// Default smoothing coefficient. Smaller = slower/smoother.
// (e.g., 0.001 implies a time constant of roughly 1000 samples)
const DEFAULT_SMOOTHING_COEFF: f32 = 0.002;
const MIN_DELAY_SAMPLES: f32 = 1.0; // Minimum allowed delay in samples
const INTERPOLATION_POINTS_MARGIN: usize = 2; // For linear interpolation (idx, idx+1), effectively need 1 extra point. 2 is safe.

#[derive(Clone, Debug)]
pub struct Lfo {
    phase: f32,
    freq_hz: f32,
    sample_rate: f32,
    phase_increment: f32, // Pre-calculate for efficiency
}

impl Lfo {
    pub fn new(freq_hz: f32, sample_rate: f32, phase: f32) -> Self {
        Lfo {
            phase,
            freq_hz,
            sample_rate,
            phase_increment: freq_hz / sample_rate,
        }
    }

    pub fn process(&mut self) -> f32 {
        let val = (self.phase * TAU).sin(); // TAU is 2*PI
        self.phase += self.phase_increment;
        if self.phase >= 1.0 {
            self.phase -= 1.0; // Wrap phase [0.0, 1.0)
        }
        val
    }

    pub fn reset(&mut self) {
        self.phase = 0.0;
    }

    pub fn set_freq(&mut self, freq_hz: f32) {
        self.freq_hz = freq_hz;
        self.phase_increment = freq_hz / self.sample_rate;
    }
}

#[derive(Clone, Debug)]
pub struct ModulatedDelayLine {
    buffer: Vec<f32>,
    write_pos: usize,
    // Max delay *value* (in samples) that the buffer can safely provide
    // considering interpolation margin.
    max_allowable_delay_value_f32: f32,

    // For modulation and smoothing
    base_delay_samples_current: f32, // The actual center delay used for calculation
    base_delay_samples_target: f32,  // The desired center delay
    smoothing_coeff: f32,            // Coefficient for smoothing base_delay_samples_current

    current_total_delay_samples: f32, // Actual current delay length including modulation (base_current + LFO)
    lfo: Lfo,
    modulation_depth_samples: f32,
}
impl ModulatedDelayLine {
    pub fn new(
        base_delay_samples: f32,
        max_total_delay_samples: f32, // Buffer must be able to hold at least this much delay
        lfo_freq_hz: f32,
        lfo_start_phase: f32,
        modulation_depth_samples: f32,
        sample_rate: f32,
    ) -> Self {
        if sample_rate <= 0.0 {
            panic!("Sample rate must be positive.");
        }

        // Buffer length must be at least longest_delay_needed_value.ceil() + margin
        // Ensure buffer is at least large enough for MIN_DELAY_SAMPLES + margin as well
        let buffer_len = max_total_delay_samples
            .max(MIN_DELAY_SAMPLES + INTERPOLATION_POINTS_MARGIN as f32)
            as usize;
        // The actual maximum delay value this buffer configuration can support
        let max_allowable_delay_value_f32 = (buffer_len - INTERPOLATION_POINTS_MARGIN) as f32;

        // Clamp initial base delay to what's supported
        let clamped_initial_base_delay = base_delay_samples
            .max(MIN_DELAY_SAMPLES)
            .min(max_allowable_delay_value_f32 - modulation_depth_samples.abs()); // ensure base + mod_depth fits

        ModulatedDelayLine {
            buffer: vec![0.0; buffer_len],
            write_pos: 0,
            max_allowable_delay_value_f32,
            base_delay_samples_current: clamped_initial_base_delay,
            base_delay_samples_target: clamped_initial_base_delay,
            smoothing_coeff: DEFAULT_SMOOTHING_COEFF,
            current_total_delay_samples: clamped_initial_base_delay, // Initial value before LFO kicks in
            lfo: Lfo::new(lfo_freq_hz, sample_rate, lfo_start_phase),
            modulation_depth_samples,
        }
    }

    /// Resets the delay line state (buffer, positions, LFO, delay times).
    pub fn reset(&mut self) {
        self.buffer.fill(0.0);
        self.write_pos = 0;
        self.lfo.reset();
        self.base_delay_samples_current = self.base_delay_samples_target;
        self.current_total_delay_samples = self.base_delay_samples_current;
    }

    /// Sets the LFO frequency.
    pub fn set_lfo_freq(&mut self, freq_hz: f32) {
        self.lfo.set_freq(freq_hz);
    }

    /// Sets the LFO modulation depth in milliseconds.
    pub fn set_modulation_depth_samples(&mut self, depth_samples: f32) {
        self.modulation_depth_samples = depth_samples;
        // Re-clamp target delay if necessary, as modulation depth affects max possible base delay
        self.set_base_delay_samples_internal(self.base_delay_samples_target, false);
    }

    /// Sets the target base delay length in milliseconds. The change will be smoothed.
    pub fn set_base_delay_samples(&mut self, delay_samples: f32) {
        self.set_base_delay_samples_internal(delay_samples, false);
    }
    pub fn get_base_delay_samples(&self) -> f32 {
        self.base_delay_samples_current
    }

    // Sets the base delay length in milliseconds immediately, bypassing smoothing.
    pub fn set_base_delay_samples_immediate(&mut self, delay_samples: f32) {
        self.set_base_delay_samples_internal(delay_samples, true);
    }

    /// Internal helper for setting base delay.
    fn set_base_delay_samples_internal(&mut self, delay_samples: f32, immediate: bool) {
        let new_target_samples = delay_samples;

        // Ensure target base delay allows for full modulation depth within max_allowable_delay
        // max_base = max_allowable - mod_depth
        // min_base = MIN_DELAY_SAMPLES (base delay itself shouldn't be too small)
        let max_base_for_current_mod_depth =
            self.max_allowable_delay_value_f32 - self.modulation_depth_samples.abs();

        self.base_delay_samples_target = new_target_samples
            .max(MIN_DELAY_SAMPLES) // Base delay itself shouldn't be less than min
            .min(max_base_for_current_mod_depth); // Ensure base + mod_depth fits

        if immediate {
            self.base_delay_samples_current = self.base_delay_samples_target;
        }
    }
    pub fn set_base_delay_samples_with_new_max(
        &mut self,
        delay_samples: f32,
        new_max_total_delay_samples: f32,
    ) {
        // Update the maximum allowable delay value based on the new max
        let mut new_max_allowable_delay_value_f32 =
            (new_max_total_delay_samples.max(INTERPOLATION_POINTS_MARGIN as f32) as usize
                - INTERPOLATION_POINTS_MARGIN) as f32;

        new_max_allowable_delay_value_f32 = new_max_allowable_delay_value_f32
            .max(MIN_DELAY_SAMPLES + INTERPOLATION_POINTS_MARGIN as f32);
        // Clamp the base delay to the new max
        self.max_allowable_delay_value_f32 = new_max_allowable_delay_value_f32;
        self.buffer = vec![0.0; new_max_allowable_delay_value_f32 as usize];
        self.modulation_depth_samples = self
            .modulation_depth_samples
            .clamp(0.0, new_max_allowable_delay_value_f32 - MIN_DELAY_SAMPLES);

        self.base_delay_samples_target = delay_samples.clamp(
            MIN_DELAY_SAMPLES,
            new_max_allowable_delay_value_f32 - self.modulation_depth_samples,
        );
        self.reset();
    }

    // Sets the smoothing coefficient (0.0 to 1.0). Smaller is slower/smoother.
    // pub fn set_smoothing_coeff(&mut self, coeff: f32) {
    //     self.smoothing_coeff = coeff.clamp(0.0, 1.0);
    // }

    pub fn get_current_sample(&self) -> f32 {
        // Returns the current sample at the write position
        self.buffer[self.write_pos]
    }
    #[inline]
    pub fn process(&mut self, input: f32) -> f32 {
        // 1. Smooth base_delay_samples_current towards base_delay_samples_target
        if (self.base_delay_samples_current - self.base_delay_samples_target).abs() > 1e-6 {
            self.base_delay_samples_current = self.base_delay_samples_current
                * (1.0 - self.smoothing_coeff)
                + self.base_delay_samples_target * self.smoothing_coeff;
        } else {
            self.base_delay_samples_current = self.base_delay_samples_target; // Snap if close
        }

        // 2. Update current total delay length from LFO and smoothed base delay
        let lfo_val = self.lfo.process();
        self.current_total_delay_samples = (self.base_delay_samples_current
            + lfo_val * self.modulation_depth_samples)
            .max(MIN_DELAY_SAMPLES)
            .min(self.max_allowable_delay_value_f32);

        // 3. Calculate fractional read position using rem_euclid for wrapping
        let read_pos_float_unwrapped = self.write_pos as f32 - self.current_total_delay_samples;
        let buffer_len_f32 = self.buffer.len() as f32;
        let mut wrapped_read_pos_float = read_pos_float_unwrapped;

        if buffer_len_f32 > 1e-9 {
            while wrapped_read_pos_float < 0.0 {
                wrapped_read_pos_float += buffer_len_f32;
            }
            wrapped_read_pos_float %= buffer_len_f32;
        } else {
            wrapped_read_pos_float = 0.0; // Fallback for zero/tiny buffer length
        }
        // 4. Interpolation (Linear Interpolation Example)
        let idx_floor_f = wrapped_read_pos_float.floor();
        let fraction = wrapped_read_pos_float - idx_floor_f;

        // Since wrapped_read_pos_float is in [0.0, buffer_len),
        // idx_floor_f will be in [0.0, buffer_len - 1.0].
        // So direct cast to usize is safe.
        let read_idx0 = idx_floor_f as usize;
        let read_idx1 = (read_idx0 + 1) % self.buffer.len();

        let val0 = self.buffer[read_idx0];
        let val1 = self.buffer[read_idx1];

        let output = val0 + fraction * (val1 - val0);

        // 5. Write current input to buffer
        self.buffer[self.write_pos] = input;
        self.write_pos = (self.write_pos + 1) % self.buffer.len();

        output
    }
}

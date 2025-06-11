use super::delayline::ModulatedDelayLine;
use rand::prelude::*;
use rand::rngs::SmallRng;
pub struct MultiChannelDiffuser {
    delay_lines: Vec<ModulatedDelayLine>,
    channel_polarity: Vec<f32>,
    normalization_factor: f32,

    // Store configuration parameters to allow reconfiguration
    num_configured_channels: usize, // Tracks the number of channels it's currently configured for
    max_delay_seconds: f32,
    delay_lfo_depth: f32,
    delay_lfo_hz: f32,
    sample_rate: f32,
    rng: SmallRng, // Store the RNG instance
}
impl MultiChannelDiffuser {
    pub fn new(
        num_channels: usize,
        max_delay_seconds: f32,
        delay_lfo_depth: f32,
        delay_lfo_hz: f32,
        sample_rate: f32,
        seed: u64, // Add a seed for the RNG
    ) -> Self {
        let mut diffuser = Self {
            delay_lines: Vec::new(),      // Initialize empty
            channel_polarity: Vec::new(), // Initialize empty
            normalization_factor: 1.0,    // Default, will be set
            num_configured_channels: 0,   // Default, will be set
            max_delay_seconds,
            delay_lfo_depth,
            delay_lfo_hz,
            sample_rate,
            rng: SmallRng::seed_from_u64(seed), // Initialize RNG with seed
        };
        diffuser.configure_channels(num_channels); // Call the configuration method
        diffuser
    }

    // Renamed from set_num_channels for clarity, as it does more than just set a count
    // This method will (re)initialize delay_lines and channel_polarity
    pub fn configure_channels(&mut self, num_channels: usize) {
        self.num_configured_channels = num_channels;
        assert!(
            self.num_configured_channels.is_power_of_two() || self.num_configured_channels == 0,
            "Number of configured channels ({}) for processing is not a power of two.",
            self.num_configured_channels
        );
        if num_channels == 0 {
            self.delay_lines.clear();
            self.channel_polarity.clear();
            self.normalization_factor = 1.0; // Or handle as an error/special case
            return;
        }

        // Use stored configuration parameters
        let total_delay_samples_range_float = self.max_delay_seconds * self.sample_rate;

        // Resize or clear and repopulate vectors
        self.delay_lines.clear(); // Or self.delay_lines.truncate(num_channels); self.delay_lines.reserve_exact(...);
        self.channel_polarity.clear();
        self.delay_lines.reserve_exact(num_channels);
        self.channel_polarity.reserve_exact(num_channels);

        for i in 0..num_channels {
            let sub_range_low_samples_float =
                total_delay_samples_range_float * (i as f32 / num_channels as f32);
            let sub_range_high_samples_float =
                total_delay_samples_range_float * ((i as f32 + 1.0) / num_channels as f32);

            let base_delay_for_channel_f32 =
                if sub_range_low_samples_float >= sub_range_high_samples_float {
                    sub_range_low_samples_float.max(0.0)
                } else {
                    // Use self.rng for randomness
                    self.rng
                        .random_range(sub_range_low_samples_float..sub_range_high_samples_float)
                }
                .max(1.0); // Ensure min 1 sample as per your original logic

            let buffer_size_needed_f32 =
                base_delay_for_channel_f32 + self.delay_lfo_depth / 2.0 + 1.0;

            self.delay_lines.push(ModulatedDelayLine::new(
                base_delay_for_channel_f32,
                buffer_size_needed_f32.ceil(),
                self.delay_lfo_hz,
                0.0, // Initial LFO phase
                self.delay_lfo_depth,
                self.sample_rate,
            ));

            let random_sign_val = *([-1.0, 1.0].choose(&mut self.rng).unwrap_or(&1.0));
            self.channel_polarity.push(random_sign_val);
        }

        self.normalization_factor = 1.0 / (num_channels as f32).sqrt();
    }

    #[inline]
    pub fn process(&mut self, input: &mut [f32]) {
        assert!(
            input.len() == self.num_configured_channels,
            "Input slice length ({}) not equal to number of configured channels ({}).",
            input.len(),
            self.num_configured_channels
        );

        // 1. Per-channel delay stage
        for (i, sample) in input.iter_mut().enumerate() {
            *sample = self.delay_lines[i].process(*sample); // Normalize input
        }

        // 2. Perform Fast Walsh-Hadamard Transform
        let mut h = 1;
        while h < self.num_configured_channels {
            let mut i = 0;
            while i < self.num_configured_channels {
                for j in i..(i + h) {
                    let x = input[j];
                    let y = input[j + h];
                    input[j] = x + y;
                    input[j + h] = x - y;
                }
                i += h * 2;
            }
            h *= 2;
        }

        // 3. Apply polarity flips and normalization
        for i in 0..self.num_configured_channels {
            input[i] *= self.channel_polarity[i] * self.normalization_factor;
        }
    }

    pub fn reset(&mut self) {
        for dl in &mut self.delay_lines {
            dl.reset();
        }
        // Other state (like RNG, config params) is generally not reset unless re-seeded/re-configured.
    }
}

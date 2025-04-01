use crate::audio::AudioBackend;
use crate::synth::engine::SynthEngine;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream};
use std::sync::{Arc, Mutex};

pub struct CpalBackend {
    stream: Option<Stream>,
    synth_engine: Arc<Mutex<SynthEngine>>,
}

impl CpalBackend {
    pub fn new_with_engine(synth_engine: Arc<Mutex<SynthEngine>>) -> Self {
        Self {
            stream: None,
            synth_engine,
        }
    }

    fn select_output_device(
        &self,
        host: &cpal::Host,
    ) -> Result<cpal::Device, Box<dyn std::error::Error>> {
        if cfg!(target_os = "linux") {
            self.select_linux_output_device(host)
        } else {
            host.default_output_device()
                .ok_or_else(|| "No output device available".into())
        }
    }

    fn select_linux_output_device(
        &self,
        host: &cpal::Host,
    ) -> Result<cpal::Device, Box<dyn std::error::Error>> {
        let mut device_names = Vec::new();

        for device in host.devices()? {
            let name = device.name().unwrap_or_default();
            if name.to_lowercase().starts_with("default:")
                || name.to_lowercase().contains("pipewire")
            {
                device_names.push(name);
            }
        }

        if device_names.is_empty() {
            return host
                .default_output_device()
                .ok_or_else(|| "No output device available".into());
        }

        println!("Available output devices:");
        for (i, name) in device_names.iter().enumerate() {
            println!("{}. {}", i + 1, name);
        }

        println!("Select device (default 1): ");
        let mut choice = String::new();
        std::io::stdin().read_line(&mut choice)?;
        let choice = choice
            .trim()
            .parse::<usize>()
            .unwrap_or(1)
            .saturating_sub(1);

        let selected_name = device_names.get(choice).ok_or("Invalid device selection")?;

        host.devices()?
            .find(|d| d.name().map(|n| n == *selected_name).unwrap_or(false))
            .ok_or_else(|| "Selected output device not found".into())
    }
    fn determine_buffer_size(
        &self,
        device: &cpal::Device,
        config: &cpal::StreamConfig,
        sample_format: cpal::SampleFormat,
    ) -> Result<usize, Box<dyn std::error::Error>> {
        let channels = config.channels as usize;
        let (buffer_size_sender, buffer_size_receiver) = std::sync::mpsc::channel();

        let stream = match sample_format {
            SampleFormat::F32 => device.build_output_stream(
                config,
                move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                    let buffer_size = data.len() / channels;
                    buffer_size_sender.send(buffer_size).unwrap();
                },
                |err| eprintln!("an error occurred on stream: {}", err),
                None,
            )?,
            _ => return Err("Unsupported sample format".into()),
        };

        stream.play()?;
        let buffer_size = buffer_size_receiver.recv()?;
        stream.pause()?;

        Ok(buffer_size)
    }

    fn build_stream(&mut self) -> Result<Stream, Box<dyn std::error::Error>> {
        let host = cpal::default_host();
        let device = self.select_output_device(&host)?;
        println!("Selected device: {}", device.name().unwrap_or_default());
        let supported_config = device.default_output_config()?;
        let mut stream_config: cpal::StreamConfig = supported_config.clone().into();
        stream_config.buffer_size = cpal::BufferSize::Fixed(256);

        let buffer_size =
            self.determine_buffer_size(&device, &stream_config, supported_config.sample_format())?;

        {
            let mut synth_engine = self.synth_engine.lock().unwrap();
            synth_engine.set_buffer_size(buffer_size);
        }

        let sample_rate = stream_config.sample_rate.0;
        let channels = stream_config.channels as usize;
        let synth_engine = self.synth_engine.clone();

        let stream = match supported_config.sample_format() {
            SampleFormat::F32 => device.build_output_stream(
                &stream_config,
                move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                    let mut synth_engine = synth_engine.lock().unwrap();
                    let mut buffer = vec![0.0; data.len() / channels];
                    synth_engine.process(&mut buffer, sample_rate as f32);

                    for (i, frame) in data.chunks_mut(channels).enumerate() {
                        for sample in frame.iter_mut() {
                            *sample = buffer[i];
                        }
                    }
                },
                |err| eprintln!("Stream error: {}", err),
                None,
            )?,
            _ => return Err("Unsupported sample format".into()),
        };

        Ok(stream)
    }
}

impl AudioBackend for CpalBackend {
    fn new() -> Self {
        Self {
            stream: None,
            synth_engine: Arc::new(Mutex::new(SynthEngine::new())),
        }
    }

    fn start(&mut self) {
        if let Ok(stream) = self.build_stream() {
            stream.play().expect("Failed to play stream");
            self.stream = Some(stream);
        }
    }

    fn stop(&mut self) {
        if let Some(stream) = &self.stream {
            stream.pause().expect("Failed to pause stream");
        }
    }

    fn process_audio(&mut self, output: &mut [f32]) {
        let mut synth_engine = self.synth_engine.lock().unwrap();
        synth_engine.process(output, 44100.0);
    }
}

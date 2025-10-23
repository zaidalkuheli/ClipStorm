"use client";

export async function encodeAudioBufferToOpusChunks(buffer: AudioBuffer): Promise<EncodedAudioChunk[]> {
  if (typeof (window as any).AudioEncoder === 'undefined') {
    throw new Error('WebCodecs AudioEncoder not supported');
  }

  const chunks: EncodedAudioChunk[] = [];
  const encoder = new (window as any).AudioEncoder({
    output: (chunk: EncodedAudioChunk) => chunks.push(chunk),
    error: (e: any) => console.error('🎵 Opus encoder error', e)
  });

  const sampleRate = buffer.sampleRate;
  const numberOfChannels = buffer.numberOfChannels;

  if (sampleRate !== 48000) {
    // For MVP we require 48kHz (our OfflineAudioContext renders at 48k)
    throw new Error(`Unsupported sampleRate ${sampleRate}. Expected 48000.`);
  }

  encoder.configure({
    codec: 'opus',
    sampleRate,
    numberOfChannels,
    bitrate: 128000
  } as any);

  // 20ms frames at 48kHz
  const frameSize = 960; // 48k * 0.02
  const totalFrames = buffer.length;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < numberOfChannels; c++) channelData[c] = buffer.getChannelData(c);

  const makeAudioData = (start: number, frameCount: number): AudioData => {
    // f32-planar: channel0[frames], channel1[frames], ...
    const bytesPerSample = 4;
    const planeSize = frameCount * bytesPerSample;
    const data = new ArrayBuffer(planeSize * numberOfChannels);
    const view = new DataView(data);
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const src = channelData[ch];
      const base = ch * planeSize;
      for (let i = 0; i < frameCount; i++) {
        view.setFloat32(base + i * bytesPerSample, src[start + i] || 0, true);
      }
    }
    const timestampUs = Math.round((start / sampleRate) * 1_000_000);
    return new (window as any).AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: frameCount,
      numberOfChannels,
      timestamp: timestampUs,
      data
    });
  };

  for (let pos = 0; pos < totalFrames; pos += frameSize) {
    const count = Math.min(frameSize, totalFrames - pos);
    const ad = makeAudioData(pos, count);
    (encoder as any).encode(ad);
    ad.close();
  }

  await (encoder as any).flush();
  (encoder as any).close();

  return chunks;
}



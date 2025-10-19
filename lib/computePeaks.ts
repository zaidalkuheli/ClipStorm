export type WaveformData = {
  binMs: number;         // e.g. 20
  mins: Float32Array;    // [-1..1]
  maxs: Float32Array;    // [-1..1]
  durationMs: number;
  sampleRate: number;
};

export async function computeWaveform(file: File, binMs = 20): Promise<WaveformData> {
  const ab = await file.arrayBuffer();
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const buffer = await ctx.decodeAudioData(ab.slice(0)); // clone to avoid detachment
  const { numberOfChannels, sampleRate, length } = buffer;
  const durationMs = (length / sampleRate) * 1000;

  const binSamples = Math.max(1, Math.floor(sampleRate * (binMs / 1000)));
  const bins = Math.ceil(length / binSamples);

  const mins = new Float32Array(bins);
  const maxs = new Float32Array(bins);

  // mixdown extrema
  for (let b = 0; b < bins; b++) {
    let min = 0, max = 0;
    const start = b * binSamples;
    const end = Math.min(length, start + binSamples);
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = start; i < end; i++) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    mins[b] = min;
    maxs[b] = max;
  }

  // Close the temp context
  ctx.close().catch(()=>{});

  return { binMs, mins, maxs, durationMs, sampleRate };
}

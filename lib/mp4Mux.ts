"use client";

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export type AvcMuxInput = {
  chunks: EncodedVideoChunk[];
  width: number;
  height: number;
  fps: number;
};

export async function muxAvcChunksToMp4({ chunks, width, height, fps }: AvcMuxInput): Promise<Blob> {
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: fps },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
    timescale: 1_000_000, // microseconds
  });

  // Feed encoded chunks
  for (const chunk of chunks) {
    // mp4-muxer can accept EncodedVideoChunk directly
    muxer.addVideoChunk(chunk);
  }

  const buf: ArrayBuffer = muxer.finalize();
  return new Blob([buf], { type: 'video/mp4' });
}



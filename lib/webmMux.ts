"use client";

import { Muxer, ArrayBufferTarget } from 'webm-muxer';

export type WebmMuxInput = {
  chunks: { chunk: EncodedVideoChunk; metadata: EncodedVideoChunkMetadata }[];
  width: number;
  height: number;
  fps: number;
  codec?: 'V_VP9' | 'V_VP8' | 'V_AV1';
};

export function muxVp9ChunksToWebm({ chunks, width, height, fps, codec = 'V_VP9' }: WebmMuxInput): Blob {
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec, width, height, frameRate: fps },
    firstTimestampBehavior: 'offset',
    type: 'webm'
  });

  for (const { chunk, metadata } of chunks) {
    muxer.addVideoChunk(chunk, metadata);
  }

  muxer.finalize();
  return new Blob([target.buffer], { type: 'video/webm;codecs=vp9' });
}

export type WebmMuxAvChunks = {
  video: { chunk: EncodedVideoChunk; metadata: EncodedVideoChunkMetadata }[];
  audio: EncodedAudioChunk[];
  width: number;
  height: number;
  fps: number;
};

export function muxVp9OpusToWebm({ video, audio, width, height, fps }: WebmMuxAvChunks): Blob {
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'V_VP9', width, height, frameRate: fps },
    audio: { codec: 'A_OPUS', numberOfChannels: 2, sampleRate: 48000 },
    firstTimestampBehavior: 'offset',
    type: 'webm'
  });

  for (const { chunk, metadata } of video) {
    muxer.addVideoChunk(chunk, metadata);
  }

  for (const a of audio) {
    muxer.addAudioChunk(a);
  }

  muxer.finalize();
  return new Blob([target.buffer], { type: 'video/webm;codecs=vp9,opus' });
}



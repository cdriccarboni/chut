// Encodage / décodage WAV PCM minimal, partagé entre Node (main, tests) et le renderer.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChutWav = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FORMAT_PCM = 1;
  const FORMAT_FLOAT = 3;
  const FORMAT_EXTENSIBLE = 0xfffe;

  /**
   * @param {Float32Array[]} channels  un tableau par canal, même longueur
   * @param {number} sampleRate
   * @param {{bitDepth?: 16|24|32, float?: boolean}} [opts]
   * @returns {ArrayBuffer}
   */
  function encodeWav(channels, sampleRate, opts = {}) {
    const float = !!opts.float;
    const bitDepth = float ? 32 : opts.bitDepth || 16;
    if (![16, 24, 32].includes(bitDepth)) throw new Error('bitDepth invalide');
    const numChannels = channels.length;
    if (!numChannels) throw new Error('aucun canal');
    const length = channels[0].length;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, float ? FORMAT_FLOAT : FORMAT_PCM, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let c = 0; c < numChannels; c++) {
        let s = channels[c][i];
        if (!Number.isFinite(s)) s = 0;
        if (float) {
          view.setFloat32(offset, s, true);
        } else {
          s = Math.max(-1, Math.min(1, s));
          if (bitDepth === 16) {
            view.setInt16(offset, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
          } else if (bitDepth === 24) {
            const v = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
            view.setUint8(offset, v & 0xff);
            view.setUint8(offset + 1, (v >> 8) & 0xff);
            view.setUint8(offset + 2, (v >> 16) & 0xff);
          } else {
            view.setInt32(offset, Math.round(s < 0 ? s * 0x80000000 : s * 0x7fffffff), true);
          }
        }
        offset += bytesPerSample;
      }
    }
    return buffer;
  }

  /**
   * @param {ArrayBuffer|Uint8Array} input
   * @returns {{sampleRate: number, channels: Float32Array[]}}
   */
  function decodeWav(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (readString(view, 0, 4) !== 'RIFF' || readString(view, 8, 4) !== 'WAVE') {
      throw new Error('fichier WAV invalide');
    }
    let fmt = null;
    let dataOffset = -1;
    let dataSize = 0;
    let pos = 12;
    while (pos + 8 <= view.byteLength) {
      const id = readString(view, pos, 4);
      const size = view.getUint32(pos + 4, true);
      const body = pos + 8;
      if (id === 'fmt ') {
        let format = view.getUint16(body, true);
        const bitDepth = view.getUint16(body + 14, true);
        if (format === FORMAT_EXTENSIBLE && size >= 26) format = view.getUint16(body + 24, true);
        fmt = {
          format,
          numChannels: view.getUint16(body + 2, true),
          sampleRate: view.getUint32(body + 4, true),
          bitDepth,
        };
      } else if (id === 'data') {
        dataOffset = body;
        dataSize = Math.min(size, view.byteLength - body);
        break;
      }
      pos = body + size + (size & 1);
    }
    if (!fmt || dataOffset < 0) throw new Error('WAV sans bloc fmt/data');
    const { format, numChannels, sampleRate, bitDepth } = fmt;
    const bytesPerSample = bitDepth / 8;
    const frames = Math.floor(dataSize / (bytesPerSample * numChannels));
    const channels = Array.from({ length: numChannels }, () => new Float32Array(frames));
    let offset = dataOffset;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < numChannels; c++) {
        let s;
        if (format === FORMAT_FLOAT && bitDepth === 32) s = view.getFloat32(offset, true);
        else if (format === FORMAT_FLOAT && bitDepth === 64) s = view.getFloat64(offset, true);
        else if (format === FORMAT_PCM && bitDepth === 16) s = view.getInt16(offset, true) / 0x8000;
        else if (format === FORMAT_PCM && bitDepth === 24) {
          let v = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
          if (v & 0x800000) v -= 0x1000000;
          s = v / 0x800000;
        } else if (format === FORMAT_PCM && bitDepth === 32) s = view.getInt32(offset, true) / 0x80000000;
        else if (format === FORMAT_PCM && bitDepth === 8) s = (view.getUint8(offset) - 128) / 128;
        else throw new Error(`format WAV non pris en charge (${format}/${bitDepth} bits)`);
        channels[c][i] = s;
        offset += bytesPerSample;
      }
    }
    return { sampleRate, channels };
  }

  function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  function readString(view, offset, len) {
    let s = '';
    for (let i = 0; i < len && offset + i < view.byteLength; i++) s += String.fromCharCode(view.getUint8(offset + i));
    return s;
  }

  return { encodeWav, decodeWav };
});

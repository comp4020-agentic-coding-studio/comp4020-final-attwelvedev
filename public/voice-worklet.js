// An AudioWorklet that hands the microphone's samples to the page in blocks. It runs on the audio
// thread, so it does nothing else: the page frames them for the Opus encoder.
class VoiceTap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) this.port.postMessage(channel.slice());
    return true;
  }
}
registerProcessor("voice-tap", VoiceTap);

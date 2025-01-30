// custom-processor.js
class CustomPlaybackProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = null; // Holds the audio buffer
        this.currentFrame = 0; // Current playback position
        this.playbackRate = 1; // Playback rate
        this.isPlaying = false; // Playback state
        this.port.onmessage = (event) => {
            const { action, buffer, rate } = event.data;
            console.log(event.data);
            if (action === 'load') {
                this.buffer = new Float32Array(buffer); // Copy the buffer
                console.log('Buffer loaded:', this.buffer);
            } else if (action === 'play') {
                this.currentFrame = 0; // Reset playback position
                this.isPlaying = true;
            } else if (action === 'stop') {
                this.isPlaying = false;
            } else if (action === 'setRate') {
                this.playbackRate = rate;
            }
        };
    }

    process(inputs, outputs, parameters) {
        if (!this.isPlaying || !this.buffer) return true;

        const output = outputs[0];
        const channelCount = output.length;

        for (let i = 0; i < output[0].length; i++) {
            if (this.currentFrame < this.buffer.length - 1) {
                const frameIndex = Math.floor(this.currentFrame);
                const fraction = this.currentFrame - frameIndex;
                const interpolatedSample = this.buffer[frameIndex] + 
                    fraction * (this.buffer[frameIndex + 1] - this.buffer[frameIndex]);
                
                for (let channel = 0; channel < channelCount; channel++) {
                    output[channel][i] = interpolatedSample;
                }
                this.currentFrame += this.playbackRate;
            } else {
                this.isPlaying = false;
                break;
            }
        }

        return true;
    }
}

registerProcessor('custom-playback-processor', CustomPlaybackProcessor);
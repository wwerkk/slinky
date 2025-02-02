class GrainProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = null;
        this.currentFrame = 0;
        this.playbackRate = 1;
        this.isPlaying = false;

        this.port.onmessage = (event) => this.handleMessage(event);
    }

    handleMessage(event) {
        const { action, buffer, rate } = event.data;

        if (action === 'play') {
            this.isPlaying = true;
            this.buffer = new Float32Array(buffer);
            this.playbackRate = rate;
            this.currentFrame = this.playbackRate >= 0 ? 0 : this.buffer.length - 1;
        }
    }

    process(inputs, outputs, parameters) {
        if (!this.isPlaying || !this.buffer) return true;

        const output = outputs[0];
        const channelCount = output.length;
        const bufferLength = this.buffer.length;

        for (let i = 0; i < output[0].length; i++) {
            if (this.currentFrame >= 0 && this.currentFrame < bufferLength) {
                const frameIndex = Math.floor(this.currentFrame);
                const nextFrameIndex = this.playbackRate >= 0 ? frameIndex + 1 : frameIndex - 1;
                const fraction = this.currentFrame - frameIndex;

                const interpolatedSample = this.buffer[frameIndex] +
                    fraction * (this.buffer[nextFrameIndex] - this.buffer[frameIndex]);

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

registerProcessor('grain-processor', GrainProcessor);
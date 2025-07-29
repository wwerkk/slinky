class SamplerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = null;
        this.targetPosition = 0;
        this.currentPosition = 0;
        this.isPlaying = false;
        this.smoothingFactor = 0.0001; // How fast to catch up (0.0-1.0)

        this.port.onmessage = (event) => this.handleMessage(event);
    }

    handleMessage(event) {
        const { action, buffer, position } = event.data;

        if (action === 'updatePosition') {
            if (this.buffer) {
                // Set target position from normalized mouse position
                this.targetPosition = position * this.buffer.length;
                this.isPlaying = true;
            }
        } else if (action === 'setBuffer') {
            this.buffer = buffer instanceof ArrayBuffer ? new Float32Array(buffer) : buffer;
            this.targetPosition = 0;
            this.currentPosition = 0;
            this.isPlaying = false;
        }
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelCount = output.length;

        for (let channel = 0; channel < channelCount; channel++) {
            output[channel].fill(0);
        }

        if (!this.buffer || !this.isPlaying) return true;

        for (let i = 0; i < output[0].length; i++) {
            this.currentPosition += (this.targetPosition - this.currentPosition) * this.smoothingFactor;

            const index = Math.floor(this.currentPosition);
            const fraction = this.currentPosition - index;

            let sample = 0;
            if (index >= 0 && index < this.buffer.length - 1) {
                sample = this.buffer[index] * (1 - fraction) + this.buffer[index + 1] * fraction;
            } else if (index >= 0 && index < this.buffer.length) {
                sample = this.buffer[index];
            }

            for (let channel = 0; channel < channelCount; channel++) {
                output[channel][i] = sample;
            }
        }

        return true;
    }
}

registerProcessor('sampler-processor', SamplerProcessor);
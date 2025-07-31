class SamplerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = null;
        this.targetPosition = 0;
        this.currentPosition = 0;
        this.isPlaying = false;

        this.historySize = sampleRate * 0.2; // 200ms history
        this.positionHistory = new Array(this.historySize);
        this.historyIndex = 0;
        this.historyCount = 0;
        this.runningSum = 0;

        this.port.onmessage = (event) => this.handleMessage(event);
    }

    handleMessage(event) {
        const { action, buffer, position } = event.data;

        if (action === 'updatePosition') {
            if (this.buffer) {
                this.targetPosition = position * (this.buffer.length - 1);

                this.isPlaying = true;
            }
        } else if (action === 'setBuffer') {
            this.buffer = buffer instanceof ArrayBuffer ? new Float32Array(buffer) : buffer;
            this.targetPosition = 0;
            this.currentPosition = 0;
            this.historyIndex = 0;
            this.historyCount = 0;
            this.runningSum = 0;
            this.isPlaying = false;
        }
    }

    cubicInterpolate(y0, y1, y2, y3, mu) {
        const a0 = y3 - y2 - y0 + y1;
        const a1 = y0 - y1 - a0;
        const a2 = y2 - y0;
        const a3 = y1;
        return a0 * mu * mu * mu + a1 * mu * mu + a2 * mu + a3;
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelCount = output.length;

        for (let channel = 0; channel < channelCount; channel++) {
            output[channel].fill(0);
        }

        if (!this.buffer || !this.isPlaying) return true;

        for (let i = 0; i < output[0].length; i++) {
            if (this.historyCount === this.historySize) {
                this.runningSum -= this.positionHistory[this.historyIndex];
            }

            this.positionHistory[this.historyIndex] = this.targetPosition;
            this.runningSum += this.targetPosition;

            this.historyIndex = (this.historyIndex + 1) % this.historySize;
            if (this.historyCount < this.historySize) {
                this.historyCount++;
            }
            this.currentPosition = this.runningSum / this.historyCount;
            this.currentPosition = this.currentPosition < 0 ? 0 :
                this.currentPosition > this.bufferLengthMinus1 ? this.bufferLengthMinus1
                    : this.currentPosition;

            const index = Math.floor(this.currentPosition);
            const fraction = this.currentPosition - index;

            let sample = 0;
            if (index >= 1 && index < this.buffer.length - 2) {
                const y0 = this.buffer[index - 1];
                const y1 = this.buffer[index];
                const y2 = this.buffer[index + 1];
                const y3 = this.buffer[index + 2];
                sample = this.cubicInterpolate(y0, y1, y2, y3, fraction);
            } else if (index >= 0 && index < this.buffer.length - 1) {
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
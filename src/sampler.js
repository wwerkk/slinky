class SamplerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferPre = null;
        this.bufferPost = null;
        this.targetPosition = 0;
        this.currentPosition = 0;
        this.isPlaying = false;

        this.historySize = Math.floor(sampleRate * 0.2); // 200ms history
        this.positionHistory = new Array(this.historySize);
        this.historyIndex = 0;
        this.historyCount = 0;
        this.runningSum = 0;

        this.port.onmessage = (event) => this.handleMessage(event);
    }

    handleMessage(event) {
        const { action } = event.data;

        if (action === 'setPosition') {
            const { position } = event.data;
            if (this.bufferPost) {
                this.targetPosition = position * sampleRate;
                this.isPlaying = true;
            }
        } else if (action === 'setBlock') {
            const { offset, samples, isPre } = event.data;
            if (this.bufferPost && offset >= 0 && offset + samples.length <= this.bufferPost.length) {
                this.bufferPost.set(samples, offset);
            }
            if (isPre && this.bufferPre && offset >= 0 && offset + samples.length <= this.bufferPre.length) {
                this.bufferPre.set(samples, offset);
            }
        } else if (action === 'setBuffer') {
            const { buffer, isPre } = event.data;
            if (isPre) {
                this.bufferPre = buffer instanceof ArrayBuffer ? new Float32Array(buffer) : buffer;
            } else {
                this.bufferPost = buffer instanceof ArrayBuffer ? new Float32Array(buffer) : buffer;
            }
            this.targetPosition = 0;
            this.currentPosition = 0;
            this.historyIndex = 0;
            this.historyCount = 0;
            this.runningSum = 0;
            this.isPlaying = false;
        } else if (action === 'setBuffers') {
            const { preBuffer, postBuffer } = event.data;
            if (preBuffer) {
                this.bufferPre = preBuffer instanceof ArrayBuffer ? new Float32Array(preBuffer) : preBuffer;
            }
            if (postBuffer) {
                this.bufferPost = postBuffer instanceof ArrayBuffer ? new Float32Array(postBuffer) : postBuffer;
            }
            this.targetPosition = 0;
            this.currentPosition = 0;
            this.historyIndex = 0;
            this.historyCount = 0;
            this.runningSum = 0;
            this.isPlaying = false;
        }
    }

    hermiteSpline(position, currentBuffer) {
        const index = Math.floor(position);
        const fraction = position - index;

        if (index < 1 || index >= currentBuffer.length - 2) {
            if (index >= 0 && index < currentBuffer.length - 1) {
                return currentBuffer[index] * (1 - fraction) + currentBuffer[index + 1] * fraction;
            }
            return index >= 0 && index < currentBuffer.length ? currentBuffer[index] : 0;
        }

        const y0 = currentBuffer[index - 1];
        const y1 = currentBuffer[index];
        const y2 = currentBuffer[index + 1];
        const y3 = currentBuffer[index + 2];

        const t = fraction;
        const a = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
        const b = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
        const c = 0.5 * (y2 - y0);

        return ((a * t + b) * t + c) * t + y1;
    }

    process(inputs, outputs) {
        const output = outputs[0];
        const channelCount = output.length;

        for (let channel = 0; channel < channelCount; channel++) {
            output[channel].fill(0);
        }

        if (!this.bufferPost || !this.isPlaying) return true;

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

            const currentBuffer = this.currentPosition < 0 ? this.bufferPre : this.bufferPost;

            this.currentPosition = Math.abs(this.currentPosition) > this.preBuffer.length - 1 ? this.preBuffer.length - 1 :
                this.currentPosition > this.bufferPost.length - 1 ? this.bufferPost.length - 1
                    : this.currentPosition;

            const absPosition = Math.abs(this.currentPosition);

            let sample = this.hermiteSpline(absPosition, currentBuffer);

            for (let channel = 0; channel < channelCount; channel++) {
                output[channel][i] = sample;
            }
        }

        return true;
    }
}

registerProcessor('sampler-processor', SamplerProcessor);
class SamplerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = null;
        this.targetPosition = 0;
        this.currentPosition = 0;
        this.currentFrac = 0;
        this.isPlaying = false;
        this.smoothingFactor = 0.0001;

        this.positionBuffer = new Float32Array(8);
        this.bufferIndex = 0;
        this.bufferFilled = false;

        // Sinc interpolator butchered into JS from
        // https://www.musicdsp.org/en/latest/Other/212-16-point-fast-integer-sinc-interpolator.html
        this.FP_SHIFT = 15;
        this.FP_ONE = 1 << this.FP_SHIFT;
        this.FP_MASK = this.FP_ONE - 1;
        this.POINT_SHIFT = 4;
        this.OVER_SHIFT = 4;
        this.POINTS = 1 << this.POINT_SHIFT;
        this.INTERP_SHIFT = this.FP_SHIFT - this.OVER_SHIFT;
        this.INTERP_BITMASK = (1 << this.INTERP_SHIFT) - 1;

        // Sinc table 
        this.table = new Int16Array([
            0, -7, 27, -71, 142, -227, 299, 32439, 299, -227, 142, -71, 27, -7, 0, 0,
            0, 0, -5, 36, -142, 450, -1439, 32224, 2302, -974, 455, -190, 64, -15, 2, 0,
            0, 6, -33, 128, -391, 1042, -2894, 31584, 4540, -1765, 786, -318, 105, -25, 3, 0,
            0, 10, -55, 204, -597, 1533, -4056, 30535, 6977, -2573, 1121, -449, 148, -36, 5, 0,
            -1, 13, -71, 261, -757, 1916, -4922, 29105, 9568, -3366, 1448, -578, 191, -47, 7, 0,
            -1, 15, -81, 300, -870, 2185, -5498, 27328, 12263, -4109, 1749, -698, 232, -58, 9, 0,
            -1, 15, -86, 322, -936, 2343, -5800, 25249, 15006, -4765, 2011, -802, 269, -68, 10, 0,
            -1, 15, -87, 328, -957, 2394, -5849, 22920, 17738, -5298, 2215, -885, 299, -77, 12, 0,
            0, 14, -83, 319, -938, 2347, -5671, 20396, 20396, -5671, 2347, -938, 319, -83, 14, 0,
            0, 12, -77, 299, -885, 2215, -5298, 17738, 22920, -5849, 2394, -957, 328, -87, 15, -1,
            0, 10, -68, 269, -802, 2011, -4765, 15006, 25249, -5800, 2343, -936, 322, -86, 15, -1,
            0, 9, -58, 232, -698, 1749, -4109, 12263, 27328, -5498, 2185, -870, 300, -81, 15, -1,
            0, 7, -47, 191, -578, 1448, -3366, 9568, 29105, -4922, 1916, -757, 261, -71, 13, -1,
            0, 5, -36, 148, -449, 1121, -2573, 6977, 30535, -4056, 1533, -597, 204, -55, 10, 0,
            0, 3, -25, 105, -318, 786, -1765, 4540, 31584, -2894, 1042, -391, 128, -33, 6, 0,
            0, 2, -15, 64, -190, 455, -974, 2302, 32224, -1439, 450, -142, 36, -5, 0, 0,
            0, 0, -7, 27, -71, 142, -227, 299, 32439, 299, -227, 142, -71, 27, -7, 0
        ]);

        this.port.onmessage = (event) => this.handleMessage(event);
    }

    handleMessage(event) {
        const { action, buffer, position } = event.data;

        if (action === 'updatePosition') {
            if (this.buffer) {
                const newPosition = position * this.buffer.length;

                this.positionBuffer[this.bufferIndex] = newPosition;
                this.bufferIndex = (this.bufferIndex + 1) % this.positionBuffer.length;
                if (this.bufferIndex === 0) this.bufferFilled = true;

                const count = this.bufferFilled ? this.positionBuffer.length : this.bufferIndex;
                let sum = 0;
                for (let i = 0; i < count; i++) {
                    sum += this.positionBuffer[i];
                }
                this.targetPosition = sum / count;
                this.isPlaying = true;
            }
        } else if (action === 'setBuffer') {
            this.buffer = buffer instanceof ArrayBuffer ? new Float32Array(buffer) : buffer;
            this.targetPosition = 0;
            this.currentPosition = 0;
            this.currentFrac = 0;
            this.positionBuffer.fill(0);
            this.bufferIndex = 0;
            this.bufferFilled = false;
            this.isPlaying = false;
        }
    }

    sincResample(inputPos, inputFrac) {
        const tabidx1 = (inputFrac >> this.INTERP_SHIFT) << this.POINT_SHIFT;
        const tabidx2 = tabidx1 + this.POINTS;
        let bufidx = Math.floor(inputPos) - (this.POINTS >> 1) + 1;

        let a1 = 0, a2 = 0;

        for (let t = 0; t < this.POINTS; t++) {
            if (bufidx >= 0 && bufidx < this.buffer.length) {
                const sample = this.buffer[bufidx] * 32767; // Convert to 16-bit range
                a1 += (this.table[tabidx1 + t] * sample) >> 15;
                a2 += (this.table[tabidx2 + t] * sample) >> 15;
            }
            bufidx++;
        }

        const out = a1 + (((a2 - a1) * (inputFrac & this.INTERP_BITMASK)) >> this.INTERP_SHIFT);
        return out / 32767; // Convert back to float
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

            let sample = 0;
            const intPos = Math.floor(this.currentPosition);
            const fracPos = (this.currentPosition - intPos) * this.FP_ONE;

            if (intPos >= 8 && intPos < this.buffer.length - 8) {
                sample = this.sincResample(this.currentPosition, Math.floor(fracPos));
            } else if (this.currentPosition >= 0 && this.currentPosition < this.buffer.length) {
                const index = Math.floor(this.currentPosition);
                const fraction = this.currentPosition - index;
                if (index < this.buffer.length - 1) {
                    sample = this.buffer[index] * (1 - fraction) + this.buffer[index + 1] * fraction;
                } else {
                    sample = this.buffer[index];
                }
            }

            for (let channel = 0; channel < channelCount; channel++) {
                output[channel][i] = sample;
            }
        }

        return true;
    }
}

registerProcessor('sampler-processor', SamplerProcessor);
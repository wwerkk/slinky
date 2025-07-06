class OlaProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = null;
        this.currentFrame = 0;
        this.playbackRate = 1;
        this.isPlaying = false;
        this.grainSize = 2048; // About 46ms at 44.1kHz
        this.overlap = 4; // Number of overlapping grains
        this.grains = [];

        this.port.onmessage = (event) => this.handleMessage(event);
    }

    createGrain(startFrame) {
        // Remove finished grains
        this.grains = this.grains.filter(grain => grain.age < this.grainSize);

        if (this.grains.length < this.overlap) {
            this.grains.push({
                startFrame,
                age: 0,
                position: startFrame
            });
        }
    }

    handleMessage(event) {
        const { action, buffer, position, rate } = event.data;

        if (action === 'updatePosition') {
            if (this.buffer) {
                this.playbackRate = rate;
                // Calculate the exact frame position based on the normalized position
                const framePosition = Math.floor(position * this.buffer.length);
                this.createGrain(framePosition);
                this.isPlaying = true;
            }
        } else if (action === 'setBuffer') {
            this.buffer = buffer instanceof ArrayBuffer ? new Float32Array(buffer) : buffer;
            this.currentFrame = 0;
            this.grains = [];
        }
    }

    hannWindow(position, length) {
        return length > 1 ? 0.5 * (1 - Math.cos((2 * Math.PI * position) / (length - 1))) : 1;
    }

    cubicInterpolate(y0, y1, y2, y3, mu) {
        // Catmull-Rom spline interpolation
        const mu2 = mu * mu;
        const mu3 = mu2 * mu;
        
        const a0 = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
        const a1 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
        const a2 = -0.5 * y0 + 0.5 * y2;
        const a3 = y1;
        
        return a0 * mu3 + a1 * mu2 + a2 * mu + a3;
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelCount = output.length;

        // Clear the output buffer
        for (let channel = 0; channel < channelCount; channel++) {
            output[channel].fill(0);
        }

        if (!this.buffer || !this.isPlaying) return true;

        const overlapGain = 1 / this.overlap;
        for (let grain of this.grains) {


            for (let i = 0; i < output[0].length; i++) {
                if (grain.age < this.grainSize) {
                    const readPosition = Math.floor(grain.position);

                    if (readPosition >= 1 && readPosition < this.buffer.length - 2) {
                        const fraction = grain.position - readPosition;
                        
                        // Get 4 samples for cubic interpolation
                        const y0 = this.buffer[readPosition - 1];
                        const y1 = this.buffer[readPosition];
                        const y2 = this.buffer[readPosition + 1];
                        const y3 = this.buffer[readPosition + 2];
                        
                        // Cubic interpolation using Catmull-Rom spline
                        const interpolatedSample = this.cubicInterpolate(y0, y1, y2, y3, fraction);

                        // Apply window and accumulate to output
                        const windowGain = this.hannWindow(grain.age, this.grainSize);
                        const sample = interpolatedSample * overlapGain;
                        for (let channel = 0; channel < channelCount; channel++) {
                            output[channel][i] += sample;
                        }
                    }

                    grain.position += this.playbackRate;
                    grain.age++;
                }
            }
        }

        // Stop if all grains are finished
        if (this.grains.every(grain => grain.age >= this.grainSize)) {
            this.isPlaying = false;
            this.grains = [];
        }

        return true;
    }
}

registerProcessor('ola-processor', OlaProcessor);
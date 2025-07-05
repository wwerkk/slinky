class olaProcessor extends AudioWorkletProcessor {
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
            this.playbackRate = rate;
            // Calculate the exact frame position based on the normalized position
            const framePosition = Math.floor(position * this.buffer.length);
            this.createGrain(framePosition);
            this.isPlaying = true;
        } else if (action === 'setBuffer') {
            this.buffer = new Float32Array(buffer);
            this.currentFrame = 0;
            this.grains = [];
        }
    }

    hannWindow(position, length) {
        return 0.5 * (1 - Math.cos((2 * Math.PI * position) / ( length - 1)));
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelCount = output.length;

        if (!this.buffer || !this.isPlaying) return true;

        // Clear the output buffer
        for (let channel = 0; channel < channelCount; channel++) {
            output[channel].fill(0);
        }

        // Process each active grain
        for (let grain of this.grains) {
            const windowGain = this.hannWindow(grain.age, this.grainSize);

            for (let i = 0; i < output[0].length; i++) {
                if (grain.age < this.grainSize) {
                    const readPosition = Math.floor(grain.position);

                    if (readPosition >= 0 && readPosition < this.buffer.length - 1) {
                        const fraction = grain.position - readPosition;
                        const currentSample = this.buffer[readPosition];
                        const nextSample = this.buffer[readPosition + 1];
                        const interpolatedSample = currentSample + fraction * (nextSample - currentSample);

                        // Apply window and accumulate to output
                        const sample = interpolatedSample * (1 / this.overlap) * windowGain;
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

registerProcessor('ola-processor', olaProcessor);
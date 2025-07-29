class SamplerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = null;
        this.phase = 0;
        this.playbackRate = 1;
        this.isPlaying = false;
        this.windowTable = this.generateWindowTable();
        this.inputBuffer = new Float32Array(32);
        this.bufferWriteIndex = 0;
        this.bufferFilled = false;

        this.port.onmessage = (event) => this.handleMessage(event);
    }

    generateWindowTable() {
        const tableSize = 16384;
        const table = new Float32Array(tableSize);
        
        for (let i = 0; i < tableSize; i++) {
            const x = (i / 1024) - 8;
            let sinc = (x === 0) ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
            const n = (i / 1024) / 16;
            const blackman = 0.42 - 0.5 * Math.cos(2 * Math.PI * n) + 0.08 * Math.cos(4 * Math.PI * n);
            table[i] = sinc * blackman;
        }
        
        return table;
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
            this.phase = 0;
            this.inputBuffer.fill(0);
            this.bufferWriteIndex = 0;
            this.bufferFilled = false;
        }
    }

    fillInputBuffer() {
        if (!this.buffer) return;

        const phaseInt = Math.floor(this.phase);
        
        for (let i = -15; i <= 16; i++) {
            const bufIndex = (this.bufferWriteIndex + i + 32) % 32;
            const sourceIndex = Math.max(0, Math.min(this.buffer.length - 1, phaseInt + i));
            this.inputBuffer[bufIndex] = this.buffer[sourceIndex];
        }
        
        this.bufferFilled = true;
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const channelCount = output.length;

        for (let channel = 0; channel < channelCount; channel++) {
            output[channel].fill(0);
        }

        if (!this.buffer || !this.isPlaying) return true;

        for (let i = 0; i < output[0].length; i++) {
            this.fillInputBuffer();

            if (!this.bufferFilled) continue;

            const phaseInt = Math.floor(this.phase);
            const phaseFrac = this.phase - phaseInt;
            const windowIndex = Math.floor(phaseFrac * 1024);

            let sum = 0;

            for (let j = -8; j < 8; j++) {
                const sampleIndex = (this.bufferWriteIndex + j + 16 + 32) % 32;
                const sample = this.inputBuffer[sampleIndex];
                const windowOffset = (j + 8) * 1024 + windowIndex;
                const window = this.windowTable[windowOffset];
                sum += sample * window;
            }

            for (let channel = 0; channel < channelCount; channel++) {
                output[channel][i] = sum;
            }

            this.phase += this.playbackRate;

            if (this.phase >= this.buffer.length) {
                this.isPlaying = false;
                break;
            }
        }

        return true;
    }
}

registerProcessor('sampler-processor', SamplerProcessor);
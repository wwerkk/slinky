export class Waveform {
    constructor(canvasId, playheadId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.playhead = document.getElementById(playheadId);
        this.currentBuffer = null;
        this.playheadPosition = 0;
        this.zoomFactor = 1;
        this.upscaleFactor = 1;
        this.waveformPoints = [];
        this.#updateCanvasSize();
        window.addEventListener('resize', () => this.#handleResize());
    }

    #updateCanvasSize() {
        const container = this.canvas.parentElement;
        this.canvasWidth = container.clientWidth;
        this.canvasHeight = container.clientHeight;
        this.canvas.width = this.canvasWidth;
        this.canvas.height = this.canvasHeight;
    }

    #handleResize() {
        if (this.currentBuffer) {
            this.plot(this.playheadPosition, this.zoomFactor);
        } else {
            this.#updateCanvasSize();
        }
    }

    compute(buffer = null) {
        if (buffer !== null) {
            this.currentBuffer = buffer;
        }

        const channelData = this.currentBuffer.getChannelData(0); // Use the first channel
        const dataLength = channelData.length;
        const upscaledWidth = dataLength * this.upscaleFactor;
        const samplesPerPixel = dataLength / upscaledWidth;

        this.waveformPoints = [];
        for (let i = 0; i < upscaledWidth; i++) {
            const samplePosition = i * samplesPerPixel;

            let sample;
            if (samplePosition <= 0) {
                sample = channelData[0] || 0;
            } else if (samplePosition >= dataLength - 1) {
                sample = channelData[dataLength - 1] || 0;
            } else {
                const lowerIndex = Math.floor(samplePosition);
                const upperIndex = Math.ceil(samplePosition);
                const fraction = samplePosition - lowerIndex;
                const lowerSample = channelData[lowerIndex] || 0;
                const upperSample = channelData[upperIndex] || 0;
                sample = lowerSample + (upperSample - lowerSample) * fraction;
            }

            this.waveformPoints.push(sample);
        }
    }

    plot(position = 0, zoom = 1) {
        this.playheadPosition = position;
        this.zoomFactor = zoom;
        this.#updateCanvasSize();

        if (this.currentBuffer && this.waveformPoints.length > 0) {
            const channelData = this.currentBuffer.getChannelData(0); // Use the first channel
            const dataLength = channelData.length;
            const amp = this.canvasHeight / 2;
            const upscaledWidth = dataLength * this.upscaleFactor;

            this.ctx.strokeStyle = 'black';
            this.ctx.lineWidth = 1;
            this.ctx.lineCap = 'round';
            this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
            this.ctx.beginPath();

            const visibleRange = 1.0 / this.zoomFactor;
            const viewOffset = position - visibleRange / 2;

            for (let i = 0; i < this.canvasWidth; i++) {
                const viewIdx = viewOffset + (i / this.canvasWidth) * visibleRange;

                const startIdx = Math.max(0, Math.floor(viewIdx * upscaledWidth));
                const endIdx = Math.min(Math.floor((viewIdx + (visibleRange / this.canvasWidth)) * upscaledWidth), this.waveformPoints.length);

                let min = 0, max = 0;
                for (let j = startIdx; j < endIdx; j++) {
                    const value = -this.waveformPoints[j];
                    if (value < min) min = value;
                    if (value > max) max = value;
                }

                const x = i;
                const yMin = amp + (min * amp);
                const yMax = amp + (max * amp);

                if (i === 0) {
                    this.ctx.moveTo(x, yMax);
                } else {
                    this.ctx.lineTo(x, yMax);
                }

                if (Math.abs(yMax - yMin) > 1) {
                    this.ctx.lineTo(x, yMin);
                    this.ctx.lineTo(x, yMax);
                }
            }

            this.ctx.stroke();
        }
    }
}
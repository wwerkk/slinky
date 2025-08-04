export class Waveform {
    constructor(canvasId, playheadId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.playhead = document.getElementById(playheadId);
        this.currentBuffer = null;
        this.upscaleFactor = 4;
        this.updateCanvasSize();

        window.addEventListener('resize', () => this.handleResize());
    }

    updateCanvasSize() {
        const container = this.canvas.parentElement;
        this.canvasWidth = container.clientWidth;
        this.canvasHeight = container.clientHeight;
        this.canvas.width = this.canvasWidth;
        this.canvas.height = this.canvasHeight;
    }

    handleResize() {
        if (this.currentBuffer) {
            this.plot(this.currentBuffer);
        } else {
            this.updateCanvasSize();
        }
    }

    plot(buffer) {
        if (!buffer || buffer.numberOfChannels < 1) return;
        this.currentBuffer = buffer;
        this.updateCanvasSize();

        const channelData = buffer.getChannelData(0); // Use the first channel
        const dataLength = channelData.length;
        const amp = this.canvasHeight / 2;
        const upscaledWidth = this.canvasWidth * this.upscaleFactor;
        
        const waveformPoints = [];
        for (let i = 0; i < upscaledWidth; i++) {
            const samplePosition = (i * dataLength) / upscaledWidth;
            
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
            
            waveformPoints.push(sample);
        }
        

        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 1;
        this.ctx.lineCap = 'round';

        this.ctx.beginPath();
        for (let i = 0; i < this.canvasWidth; i++) {
            const startIdx = Math.floor((i * upscaledWidth) / this.canvasWidth);
            const endIdx = Math.floor(((i + 1) * upscaledWidth) / this.canvasWidth);
            
            let min = 0, max = 0;
            for (let j = startIdx; j < endIdx && j < waveformPoints.length; j++) {
                const value = waveformPoints[j];
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

    updatePlayhead(progress) {
        const playheadX = Math.max(0, Math.min(1, progress)) * this.canvasWidth;
        if (this.playhead) this.playhead.style.transform = `translateX(${playheadX}px)`;
    }
}
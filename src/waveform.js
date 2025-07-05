// waveform-viewer.js
export class Waveform {
    constructor(canvasId, playheadId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.playhead = document.getElementById(playheadId);
        this.updateCanvasSize();
    }

    updateCanvasSize() {
        const container = this.canvas.parentElement;
        this.canvasWidth = container.clientWidth;
        this.canvasHeight = container.clientHeight;
        this.canvas.width = this.canvasWidth;
        this.canvas.height = this.canvasHeight;
    }

    plot(buffer) {
        this.updateCanvasSize();
        
        const channelData = buffer.getChannelData(0); // Use the first channel
        const dataLength = channelData.length;
        const amp = this.canvasHeight / 2;

        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 1;
        this.ctx.lineCap = 'round';
        
        this.ctx.beginPath();
        
        for (let i = 0; i < this.canvasWidth; i++) {
            const sampleIndex = Math.floor((i * dataLength) / this.canvasWidth);
            const sample = channelData[sampleIndex] || 0;
            
            const x = i;
            const y = amp + (sample * amp);
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        
        this.ctx.stroke();
    }

    updatePlayhead(progress) {
        const playheadX = progress * this.canvasWidth;
        this.playhead.style.transform = `translateX(${playheadX}px)`;
    }
}
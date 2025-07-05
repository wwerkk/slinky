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
        const step = Math.ceil(channelData.length / this.canvasWidth);
        const amp = this.canvasHeight / 2;

        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.ctx.beginPath();
        for (let i = 0; i < this.canvasWidth; i++) {
            const min = Math.min(...channelData.slice(i * step, (i + 1) * step));
            const max = Math.max(...channelData.slice(i * step, (i + 1) * step));
            this.ctx.moveTo(i, amp - min * amp);
            this.ctx.lineTo(i, amp - max * amp);
        }
        this.ctx.stroke();
    }

    updatePlayhead(progress) {
        const playheadX = progress * this.canvasWidth;
        this.playhead.style.transform = `translateX(${playheadX}px)`;
    }
}
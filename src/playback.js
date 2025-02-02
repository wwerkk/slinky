class PlaybackProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = null; // Holds the audio buffer
        this.currentFrame = 0; // Current playback position
        this.playbackRate = 1; // Playback rate
        this.loop = false; // Looping state
        this.isPlaying = false; // Playback state
        this.isOver = true; // Playback completed state

        // Handle messages from the main thread
        this.port.onmessage = (event) => this.handleMessage(event);
    }

    handleMessage(event) {
        const { action, buffer, rate, loop, position } = event.data;
        console.log('Message received:', event.data);

        switch (action) {
            case 'load':
                this.buffer = new Float32Array(buffer); // Copy the buffer
                console.log('Buffer loaded:', this.buffer);
                this.currentFrame = this.playbackRate >= 0 ? 0 : this.buffer.length - 1;
                break;
            case 'play':
                if (this.currentFrame >= this.buffer.length || this.currentFrame < 0)
                    this.currentFrame = this.playbackRate >= 0 ? 0 : this.buffer.length - 1;
                this.isPlaying = true;
                this.isOver = false;
                this.port.postMessage({ action: 'isOver', isOver: this.isOver });
                break;
            case 'stop':
                this.isPlaying = false;
                break;
            case 'setRate':
                this.playbackRate = rate;
                break;
            case 'loop':
                this.loop = loop;
                break;
            case 'position':
                let currentFrame = position * this.buffer.length;
                if (currentFrame < 0) currentFrame = 0;
                else if (currentFrame >= this.buffer.length) currentFrame = this.buffer.length - 1;
                this.currentFrame = currentFrame;
                break;
        }
    }

    process(inputs, outputs, parameters) {
        if (!this.isPlaying || !this.buffer) return true;

        const output = outputs[0];
        const channelCount = output.length;
        const bufferLength = this.buffer.length;

        for (let i = 0; i < output[0].length; i++) {
            // Handle looping
            if (this.loop) {
                if (this.currentFrame >= bufferLength) {
                    this.currentFrame %= bufferLength; // forward wrap
                } else if (this.currentFrame < 0) {
                    this.currentFrame += bufferLength; // reverse wrap
                }
            }

            if (this.currentFrame >= 0 && this.currentFrame < bufferLength) {
                const frameIndex = Math.floor(this.currentFrame);
                const nextFrameIndex = frameIndex >= 0 ? (frameIndex + 1) % bufferLength : bufferLength + frameIndex - 1; // Handle wrapping for interpolation
                const fraction = this.currentFrame - frameIndex;

                // Interpolate between the current and next frame
                const interpolatedSample = this.buffer[frameIndex] +
                    fraction * (this.buffer[nextFrameIndex] - this.buffer[frameIndex]);

                for (let channel = 0; channel < channelCount; channel++) {
                    output[channel][i] = interpolatedSample;
                }

                this.currentFrame += this.playbackRate;
            } else {
                this.isPlaying = false;
                this.isOver = true;
                this.port.postMessage({ action: 'isOver', isOver: this.isOver });
                break;
            }
        }

        const progress = this.currentFrame / bufferLength;
        this.port.postMessage({ action: 'progress', progress });

        return true;
    }
}

registerProcessor('playback-processor', PlaybackProcessor);
class PlaybackProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = null; // Holds the audio buffer
        this.currentFrame = 0; // Current playback position
        this.playbackRate = 1; // Playback rate
        this.loop = false; // Looping state
        this.isPlaying = false; // Playback state

        // Handle messages from the main thread
        this.port.onmessage = (event) => this.handleMessage(event);
    }

    // Handle incoming messages
    handleMessage(event) {
        const { action, buffer, rate, loop } = event.data;
        console.log('Message received:', event.data);

        switch (action) {
            case 'load':
                this.buffer = new Float32Array(buffer); // Copy the buffer
                console.log('Buffer loaded:', this.buffer);
                break;
            case 'play':
                this.currentFrame = 0; // Reset playback position
                this.isPlaying = true;
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
        }
    }

    // Audio processing loop
    process(inputs, outputs, parameters) {
        if (!this.isPlaying || !this.buffer) return true;

        const output = outputs[0];
        const channelCount = output.length;

        for (let i = 0; i < output[0].length; i++) {
            if (this.loop && this.currentFrame >= this.buffer.length) {
                this.currentFrame = this.currentFrame % this.buffer.length;
            }

            if (this.currentFrame < this.buffer.length) {
                const frameIndex = Math.floor(this.currentFrame);
                const fraction = this.currentFrame - frameIndex;
                const interpolatedSample = this.buffer[frameIndex] +
                    fraction * (this.buffer[frameIndex + 1] - this.buffer[frameIndex]);

                for (let channel = 0; channel < channelCount; channel++) {
                    output[channel][i] = interpolatedSample;
                }

                this.currentFrame += this.playbackRate;
            } else {
                this.isPlaying = false; // Stop playback when the buffer ends
                break;
            }
        }

        return true;
    }
}

registerProcessor('playback-processor', PlaybackProcessor);
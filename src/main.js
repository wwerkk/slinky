import { Waveform } from './waveform.js';

const WAVEFORM_CANVAS_ID = 'waveformCanvas';
const PLAYHEAD_ID = 'playhead';

const MIN_ZOOM = 1 / 32;
const MAX_ZOOM = 32;

let audioContext;
let audioBuffer;
let channelData;
let samplerNode;

let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

let waveform;
let isInteracting = false;
let lastMouseX = null;
let playheadPosition = 0;
let zoomFactor = 1;
let drawMode = false;

document.addEventListener('dragover', (event) => { event.preventDefault(); });
document.addEventListener('drop', handleDrop);

const recordButton = document.getElementById('recordButton');
recordButton.addEventListener('click', toggleRecording);
recordButton.addEventListener('touchstart', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleRecording();
});

const drawButton = document.getElementById('drawButton');
drawButton.addEventListener('click', toggleDrawMode);
drawButton.addEventListener('touchstart', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleDrawMode();
});

const positionSlider = document.getElementById('positionSlider');
const positionSliderValue = document.getElementById('positionSliderValue');
positionSlider.addEventListener('input', (event) => {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }

    playheadPosition = parseFloat(event.target.value);
    positionSliderValue.textContent = playheadPosition.toFixed(2) + "s";

    samplerNode.port.postMessage({
        action: 'setPosition',
        position: playheadPosition
    });

    if (audioBuffer) {
        requestAnimationFrame(() => waveform.plot(playheadPosition, zoomFactor));
    }
});

const zoomSlider = document.getElementById('zoomSlider');
const zoomSliderValue = document.getElementById('zoomSliderValue');
zoomSlider.addEventListener('input', (event) => {
    let v = parseFloat(event.target.value);
    let k = 2;
    if (Math.abs(v) < 0.05) {
        v = 0; // snap to 0
        zoomSlider.value = v.toFixed(2);
    }
    if (v < 0) {
        v = 1 + (MIN_ZOOM - 1) * Math.pow(-v, k);
    } else if (v > 0) {
        v = 1 + (MAX_ZOOM - 1) * Math.pow(v, k);
    } else {
        v = 1;
    }
    zoomSliderValue.textContent = v >= 10 ? v.toFixed(1) + "x" : v.toFixed(2) + "x";
    zoomFactor = v;

    requestAnimationFrame(() => waveform.plot(playheadPosition, zoomFactor));
});

document.getElementById(WAVEFORM_CANVAS_ID).addEventListener('mousedown', (event) => {
    beginInteraction(event.clientX, event.clientY);
}); // begin interaction on click inside canvas
document.addEventListener('mousemove', (event) => {
    if (!audioBuffer || !isInteracting) return;
    handleInteraction(event.clientX, event.clientY);
});
document.addEventListener('mouseup', (event) => {
    isInteracting = false;
});

document.getElementById(WAVEFORM_CANVAS_ID).addEventListener('touchstart', (event) => {
    event.preventDefault();
    beginInteraction(event.touches[0].clientX, event.touches[0].clientY);
}); // begin interaction on touch inside canvas
document.addEventListener('touchmove', (event) => {
    event.preventDefault();
    if (!audioBuffer || !isInteracting) return;
    handleInteraction(event.touches[0].clientX, event.touches[0].clientY);
});
document.addEventListener('touchend', (event) => {
    event.preventDefault();
    isInteracting = false;
});

document.getElementById(WAVEFORM_CANVAS_ID).addEventListener('dragstart', (event) => {
    event.preventDefault();
});
document.getElementById(WAVEFORM_CANVAS_ID).addEventListener('drag', (event) => {
    event.preventDefault();
});

init();

async function handleDrop(event) {
    const loadAudioFile = async (file) => {
        const arrayBuffer = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });

        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        if (audioBuffer.numberOfChannels > 1) console.warn('Audio file has more than one channel, using the first channel only.');
        channelData = audioBuffer.getChannelData(0); // truncate to first channel for now

        if (samplerNode) {
            samplerNode.port.postMessage({
                action: 'setBuffer',
                buffer: channelData.buffer
            }, [channelData.buffer.slice()]);
        }

        playheadPosition = 0;
        positionSlider.value = playheadPosition;
        positionSliderValue.textContent = playheadPosition.toFixed(2) + "s";

        waveform.compute(audioBuffer);
        requestAnimationFrame(() => waveform.plot(playheadPosition, zoomFactor));
    };

    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        await loadAudioFile(files[0]);
    }
}

async function toggleRecording() {
    async function startRecording() {
        try {
            recordButton.classList.add('waiting');

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            recordedChunks = [];

            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };

            mediaRecorder.onstart = () => {
                recordButton.classList.remove('waiting');
                recordButton.classList.add('recording');
                isRecording = true;
            };

            mediaRecorder.onstop = async () => {
                const blob = new Blob(recordedChunks, { type: 'audio/webm' });
                const arrayBuffer = await blob.arrayBuffer();

                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }

                try {
                    const recordedBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    audioBuffer = recordedBuffer;
                    channelData = audioBuffer.getChannelData(0);

                    if (samplerNode) {
                        samplerNode.port.postMessage({
                            action: 'setBuffer',
                            buffer: channelData.buffer
                        }, [channelData.buffer.slice()]);
                    }

                    playheadPosition = 0;
                    positionSlider.value = playheadPosition;
                    positionSliderValue.textContent = playheadPosition.toFixed(2) + "s";

                    waveform.compute(audioBuffer);
                    requestAnimationFrame(() => waveform.plot(playheadPosition, zoomFactor));
                } catch (error) {
                    console.error('Error decoding recorded audio:', error);
                }

                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
        } catch (error) {
            console.error('Error accessing microphone:', error);
            recordButton.classList.remove('waiting');

            if (error.name === 'NotAllowedError') {
                alert('Microphone access denied. Please allow microphone access and try again.');
            } else if (error.name === 'NotFoundError') {
                alert('No microphone found. Please check your device settings.');
            } else {
                alert('Could not access microphone. Please try again.');
            }
        }
    }

    function stopRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;

            recordButton.classList.remove('recording');
            recordButton.classList.remove('waiting');
        }
    }

    if (!isRecording) {
        await startRecording();
    } else {
        stopRecording();
    }
}

function toggleDrawMode() {
    drawMode = !drawMode;
    const drawButton = document.getElementById('drawButton');

    if (drawMode) {
        drawButton.classList.add('active');
    } else {
        drawButton.classList.remove('active');
    }
}

function beginInteraction(x, y) {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    isInteracting = true;
    if (drawMode) {
        const bufferReplaced = drawAtPosition(x, y);

        waveform.compute(bufferReplaced ? audioBuffer : null);
        requestAnimationFrame(() => waveform.plot(playheadPosition, zoomFactor));
    }
    lastMouseX = x;
}

function handleInteraction(x, y) {
    if (drawMode) {
        const bufferReplaced = drawAtPosition(x, y);

        waveform.compute(bufferReplaced ? audioBuffer : null);
    } else {
        const last = Math.max(0, Math.min(1, lastMouseX / waveform.canvasWidth));
        const current = Math.max(0, Math.min(1, x / waveform.canvasWidth));
        const delta = last - current;
        playheadPosition += delta / zoomFactor;

        samplerNode.port.postMessage({
            action: 'setPosition',
            position: playheadPosition
        });

        positionSliderValue.textContent = playheadPosition.toFixed(2) + "s";
        positionSlider.value = playheadPosition.toFixed(2);
        lastMouseX = x;
    }

    requestAnimationFrame(() => waveform.plot(playheadPosition, zoomFactor));
}

async function init() {
    function generateSine(sampleRate = 44100) {
        const duration = 1; // seconds
        const frequency = 441; // Hz
        const amplitude = 0.5;
        const length = sampleRate * duration;

        audioBuffer = audioContext.createBuffer(1, length, sampleRate);
        const channelData = audioBuffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            channelData[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * amplitude;
        }

        return audioBuffer;
    }

    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (!audioBuffer) {
            const audioBuffer = generateSine(audioContext.sampleRate);
            channelData = audioBuffer.getChannelData(0);
        }
    }

    if (!samplerNode) {
        await audioContext.audioWorklet.addModule('./src/sampler.js');
        samplerNode = new AudioWorkletNode(audioContext, 'sampler-processor');
        samplerNode.connect(audioContext.destination);
    }

    samplerNode.port.postMessage({
        action: 'setBuffer',
        buffer: channelData.buffer
    }, [channelData.buffer.slice()]);

    if (!waveform) {
        waveform = new Waveform(WAVEFORM_CANVAS_ID, PLAYHEAD_ID, audioContext.sampleRate);
    }

    waveform.compute(audioBuffer);
    requestAnimationFrame(() => waveform.plot(playheadPosition, zoomFactor));
}

function drawAtPosition(mouseX, mouseY) {
    const sampleIdx = mouseXtoSample(mouseX);
    const amp = mouseYtoAmp(mouseY);

    const outOfBounds = sampleIdx < 0 ? -1 : sampleIdx >= channelData.length ? 1 : 0;

    if (outOfBounds === 0) {
        channelData[sampleIdx] = amp;

        samplerNode.port.postMessage({
            action: 'setBlock',
            offset: sampleIdx,
            samples: new Float32Array([amp]),
        }); // probably not the most optimal when drawing multiple samples in a single drag
    } else if (outOfBounds === 1) {
        // add 15s margin to the right of the added sample
        const audioBuffer_ = audioContext.createBuffer(1, sampleIdx + audioContext.sampleRate * 15, audioContext.sampleRate);
        audioBuffer_.copyToChannel(channelData, 0);
        audioBuffer = audioBuffer_;

        channelData = audioBuffer.getChannelData(0);

        channelData[sampleIdx] = amp;
        samplerNode.port.postMessage({
            action: 'setBuffer',
            buffer: channelData.slice()
        }); // update samplerNode buffer
    }

    return outOfBounds;
}

function mouseXtoSample(mouseX) {
    const canvasWidth = waveform.canvasWidth;
    const position = -0.5 + mouseX / canvasWidth; // translated to the middle and normalised

    const idx = (playheadPosition + position / zoomFactor) * audioContext.sampleRate;
    return Math.floor(idx);
}

function mouseYtoAmp(mouseY) {
    const canvasHeight = waveform.canvasHeight;
    const y = mouseY / canvasHeight;

    return 1 - (2 * y);
}
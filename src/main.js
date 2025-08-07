import { Waveform } from './waveform.js';

const WAVEFORM_CANVAS_ID = 'waveformCanvas';
const PLAYHEAD_ID = 'playhead';

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

document.addEventListener('dragover', (event) => { event.preventDefault(); });
document.addEventListener('drop', handleDrop);

const recordButton = document.getElementById('recordButton');
recordButton.addEventListener('click', toggleRecording);
recordButton.addEventListener('touchstart', handleRecordButtonTouch);

const positionSlider = document.getElementById('positionSlider');
const positionSliderValue = document.getElementById('positionSliderValue');
positionSlider.addEventListener('input', handlePositionSliderChange);

const zoomSlider = document.getElementById('zoomSlider');
const zoomSliderValue = document.getElementById('zoomSliderValue');
zoomSlider.addEventListener('input', handleZoomSliderChange);

document.getElementById(WAVEFORM_CANVAS_ID).addEventListener('mousedown', handleMouseDown);
document.getElementById(WAVEFORM_CANVAS_ID).addEventListener('mousemove', handleMouseMove);
document.addEventListener('mouseup', handleMouseUp); // pick up mouseUp anywhere

document.getElementById(WAVEFORM_CANVAS_ID).addEventListener('touchstart', handleTouchStart);
document.getElementById(WAVEFORM_CANVAS_ID).addEventListener('touchmove', handleTouchMove);
document.addEventListener('touchend', handleTouchEnd); // pick up touchEnd anywhere
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
        positionSliderValue.textContent = playheadPosition.toFixed(2);
        waveform.plot(audioBuffer, playheadPosition, zoomFactor);
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
                    positionSliderValue.textContent = playheadPosition.toFixed(2);
                    waveform.plot(audioBuffer, playheadPosition, zoomFactor);
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

function handleRecordButtonTouch(event) {
    event.preventDefault();
    event.stopPropagation();
    toggleRecording();
}

function handlePositionSliderChange(event) {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }

    playheadPosition = parseFloat(event.target.value);
    positionSliderValue.textContent = playheadPosition.toFixed(2);

    samplerNode.port.postMessage({
        action: 'updatePosition',
        position: playheadPosition / zoomFactor
    });

    if (audioBuffer) {
        waveform.plot(audioBuffer, playheadPosition, zoomFactor);
    }
}

function handleZoomSliderChange(event) {
    zoomFactor = parseFloat(event.target.value);
    zoomSliderValue.textContent = zoomFactor.toFixed(2);

    waveform.plot(audioBuffer, playheadPosition, zoomFactor);
}

function beginInteraction(x) {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }

    isInteracting = true;
    lastMouseX = x;
}

function handleInteraction(x, width) {
    const last = Math.max(0, Math.min(1, lastMouseX / width));
    const current = Math.max(0, Math.min(1, x / width));
    const delta = last - current;
    playheadPosition += delta;

    samplerNode.port.postMessage({
        action: 'updatePosition',
        position: playheadPosition / zoomFactor
    });

    waveform.plot(audioBuffer, playheadPosition, zoomFactor);
    positionSliderValue.textContent = playheadPosition.toFixed(2);
    positionSlider.value = playheadPosition.toFixed(2);
    lastMouseX = x;
}

function handleMouseDown(event) {
    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    beginInteraction(x);
}

function handleMouseUp(event) {
    isInteracting = false;
}

function handleMouseMove(event) {
    if (!audioBuffer || !isInteracting) return;

    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    handleInteraction(x, rect.width);
}

function handleTouchStart(event) {
    event.preventDefault();
    const touch = event.touches[0];
    const rect = event.target.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    beginInteraction(x);
}

function handleTouchEnd(event) {
    event.preventDefault();
    isInteracting = false;
}

function handleTouchMove(event) {
    event.preventDefault();
    if (!audioBuffer || !isInteracting) return;

    const touch = event.touches[0];
    const rect = event.target.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    handleInteraction(x, rect.width);
}

async function init() {
    function generateSine(sampleRate = 44100) {
        const duration = 5; // seconds
        const frequency = 440; // Hz
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
        waveform = new Waveform(WAVEFORM_CANVAS_ID, PLAYHEAD_ID);
    }
    waveform.plot(audioBuffer);
}
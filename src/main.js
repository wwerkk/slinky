import { Waveform } from './waveform.js';

const DEFAULT_SAMPLE_URL = './sine.wav';
const WAVEFORM_CANVAS_ID = 'waveformCanvas';
const PLAYHEAD_ID = 'playhead';

let audioContext;
let audioBuffer;
let channelData;
let olaNode;
let waveform;
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

let isInteracting = false;
let lastX = null;
let lastTime = null;

document.addEventListener('dragover', handleDragOver);
document.addEventListener('drop', handleDrop);
const recordButton = document.getElementById('recordButton');
recordButton.addEventListener('click', toggleRecording);
recordButton.addEventListener('touchend', handleRecordButtonTouch);

document.getElementById(WAVEFORM_CANVAS_ID).addEventListener('mousedown', handleMouseDown);
document.getElementById(WAVEFORM_CANVAS_ID).addEventListener('mousemove', handleWaveformMouseMove);
document.addEventListener('mouseup', handleMouseUp); // pick up mouseUp anywhere

document.getElementById(WAVEFORM_CANVAS_ID).addEventListener('touchstart', handleTouchStart);
document.getElementById(WAVEFORM_CANVAS_ID).addEventListener('touchmove', handleTouchMove);
document.addEventListener('touchend', handleTouchEnd); // pick up touchEnd anywhere


init();

function handleDragOver(event) {
    event.preventDefault();
}

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
        if (olaNode) {
            olaNode.port.postMessage({
                action: 'setBuffer',
                buffer: channelData.buffer
            }, [channelData.buffer.slice()]);
        }
        waveform.plot(audioBuffer);
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
            // Show waiting state immediately when clicked
            recordButton.classList.add('waiting');

            // Safari requires getUserMedia to be called synchronously with user gesture
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false
                }
            });
            recordedChunks = [];

            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };

            mediaRecorder.onstart = () => {
                // Remove waiting state and show recording state when recording actually starts
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
                    if (olaNode) {
                        olaNode.port.postMessage({
                            action: 'setBuffer',
                            buffer: channelData.buffer
                        }, [channelData.buffer.slice()]);
                    }
                    waveform.plot(audioBuffer);
                } catch (error) {
                    console.error('Error decoding recorded audio:', error);
                }

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();

        } catch (error) {
            console.error('Error accessing microphone:', error);
            // Remove waiting state if microphone access fails
            recordButton.classList.remove('waiting');

            // Show error messages for debugging
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

function beginInteraction() {
    isInteracting = true;
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function handleMouseDown(event) {
    beginInteraction();
}

function handleMouseUp(event) {
    isInteracting = false;
}

function handleTouchStart(event) {
    event.preventDefault();
    beginInteraction();
}

function handleTouchEnd(event) {
    event.preventDefault();
    isInteracting = false;
}

function handleTouchMove(event) {
    event.preventDefault(); // Prevent default touch behavior like scrolling
    if (!audioBuffer || !isInteracting) return;

    const touch = event.touches[0];
    const rect = event.target.getBoundingClientRect();
    const x = touch.clientX - rect.left;

    updateWaveformPosition(x, rect.width);
}

function handleWaveformMouseMove(event) {
    if (!audioBuffer || !isInteracting) return;

    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;

    updateWaveformPosition(x, rect.width);
}

function updateWaveformPosition(x, width) {
    const currentTime = performance.now();
    const position = Math.max(0, Math.min(1, x / width));
    let speed = 0;

    if (lastX !== null && lastTime !== null) {
        const dx = x - lastX;
        const dt = currentTime - lastTime;
        speed = dx / dt; // pixels/ms
    }

    olaNode.port.postMessage({
        action: 'updatePosition',
        position: position,
        rate: speed
    });

    waveform.updatePlayhead(position);
    lastX = x;
    lastTime = currentTime;
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

    if (!olaNode) {
        await audioContext.audioWorklet.addModule('./src/ola.js');
        olaNode = new AudioWorkletNode(audioContext, 'ola-processor');
        olaNode.connect(audioContext.destination);
    }
    olaNode.port.postMessage({
        action: 'setBuffer',
        buffer: channelData.buffer
    }, [channelData.buffer.slice()]);

    if (!waveform) {
        waveform = new Waveform(WAVEFORM_CANVAS_ID, PLAYHEAD_ID);
    }
    waveform.plot(audioBuffer);
}
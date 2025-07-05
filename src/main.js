import { Waveform } from './waveform.js';

let audioContext;
let audioBuffer;
let channelData;
let grainletNode;
let waveform;

let mouseDown = false;
let lastX = 0;
let lastTime = 0;

document.addEventListener('dragover', handleDragOver);
document.addEventListener('drop', handleDrop);
document.getElementById('waveformCanvas').addEventListener('mousedown', handleMouseDown);
document.addEventListener('mouseup', handleMouseUp); // pick up mouseUp anywhere
document.getElementById('waveformCanvas').addEventListener('mousemove', handleWaveformDrag);

initializeDefaultBuffer();

function handleDragOver(event) {
    event.preventDefault();
}

function handleDrop(event) {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        loadAudioFile(files[0]);
    }
}

async function loadAudioFile(file) {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    channelData = audioBuffer.getChannelData(0); // first channel for simplicity

    waveform.plot(audioBuffer);

    if (!grainletNode) {
        await audioContext.audioWorklet.addModule('./src/grain.js');
        grainletNode = new AudioWorkletNode(audioContext, 'grain-processor');
        grainletNode.connect(audioContext.destination);
    }
}

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

function handleMouseDown(event) {
    mouseDown = true;
}

function handleMouseUp(event) {
    mouseDown = false;
}

function handleWaveformDrag(event) {
    if (!audioBuffer || !mouseDown) return;

    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const currentTime = performance.now();

    // Calculate normalized position (0-1)
    const position = Math.max(0, Math.min(1, x / rect.width));

    // Calculate speed based on mouse movement
    let mouseSpeed = 0;
    if (lastX !== null && lastTime !== null) {
        const dx = x - lastX;
        const dt = currentTime - lastTime;
        mouseSpeed = dx / dt; // pixels/ms
    }


    // Send the current position and playbackRate to the processor
    grainletNode.port.postMessage({
        action: 'updatePosition',
        buffer: channelData.buffer,
        position: position,
        rate: mouseSpeed
    }, [channelData.buffer.slice()]);

    // Update visual feedback
    waveform.updatePlayhead(position);

    lastX = x;
    lastTime = currentTime;
}

function generateSineWave() {
    const duration = 5; // seconds
    const frequency = 440; // Hz
    const amplitude = 0.5;

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const sampleRate = audioContext.sampleRate;
    const length = sampleRate * duration;

    audioBuffer = audioContext.createBuffer(1, length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
        channelData[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * amplitude;
    }

    return audioBuffer;
}

async function initializeDefaultBuffer() {
    const defaultBuffer = generateSineWave();
    channelData = defaultBuffer.getChannelData(0);

    waveform = new Waveform('waveformCanvas', 'playhead');
    waveform.plot(defaultBuffer);

    await audioContext.audioWorklet.addModule('./src/grain.js');
    grainletNode = new AudioWorkletNode(audioContext, 'grain-processor');
    grainletNode.connect(audioContext.destination);
}
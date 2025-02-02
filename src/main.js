import { Waveform } from './waveform.js';

let audioContext;
let audioBuffer;
let channelData;
let grainletNode;
let waveform;

let mouseDown = false;
let lastX = 0;
let lastTime = 0;

document.getElementById('audioFile').addEventListener('change', handleFileInput);
document.getElementById('waveformCanvas').addEventListener('mousedown', handleMouseDown);
document.addEventListener('mouseup', handleMouseUp); // pick up mouseUp anywhere
document.getElementById('waveformCanvas').addEventListener('mousemove', handleWaveformDrag);

async function handleFileInput(event) {
    const file = event.target.files[0];
    if (file) {
        await loadAudioFile(file);
    }
}

async function loadAudioFile(file) {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    channelData = audioBuffer.getChannelData(0); // first channel for simplicity

    waveform = new Waveform('waveformCanvas', 'playhead');
    waveform.plot(audioBuffer);

    await audioContext.audioWorklet.addModule('./src/grain.js');
    grainletNode = new AudioWorkletNode(audioContext, 'grain-processor');
    grainletNode.connect(audioContext.destination);
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

    // Scale the playback rate based on mouse speed
    const speedScale = 0.1; // Adjust this value to taste
    const playbackRate = mouseSpeed * speedScale;

    // Send the current position and rate to the processor
    grainletNode.port.postMessage({
        action: 'updatePosition',
        buffer: channelData.buffer,
        position: position,
        rate: playbackRate
    }, [channelData.buffer.slice()]);

    // Update visual feedback
    waveform.updatePlayhead(position);

    lastX = x;
    lastTime = currentTime;
}
import { Waveform } from './waveform.js';

let audioContext;
let audioBuffer;
let workletNode;
let waveform;

let mouseDown = false;

let isOver = true;

// Event listeners
document.getElementById('audioFile').addEventListener('change', handleFileInput);
document.getElementById('play').addEventListener('click', playAudio);
document.getElementById('stop').addEventListener('click', stopAudio);
document.getElementById('rate').addEventListener('input', handleRateChange);
document.getElementById('loop').addEventListener('input', handleLoopChange);
document.getElementById('waveformCanvas').addEventListener('mousedown', handleMouseDown);
document.addEventListener('mouseup', handleMouseUp); // pick up mouseUp anywhere
document.getElementById('waveformCanvas').addEventListener('mousemove', handleWaveformDrag);

// File input handler
async function handleFileInput(event) {
    const file = event.target.files[0];
    if (file) {
        await loadAudioFile(file);
    }
}

// Load audio file
async function loadAudioFile(file) {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Draw the waveform
    waveform = new Waveform('waveformCanvas', 'playhead');
    waveform.plot(audioBuffer);

    // Load the custom processor
    await audioContext.audioWorklet.addModule('./src/processor.js');
    workletNode = new AudioWorkletNode(audioContext, 'playback-processor');

    // Send the buffer to the processor
    const channelData = audioBuffer.getChannelData(0); // Use the first channel for simplicity
    workletNode.port.postMessage({
        action: 'load',
        buffer: channelData.buffer, // Transfer the underlying ArrayBuffer
    }, [channelData.buffer]); // Transfer ownership of the buffer

    // Listen for playback progress updates
    workletNode.port.onmessage = (event) => {
        if (event.data.action === 'progress') {
            const progress = event.data.progress;
            waveform.updatePlayhead(progress);
        } else if (event.data.action === 'isOver') {
            console.log(event.data);
            isOver = event.data.isOver;
        }
    };
}

// Play audio
function playAudio() {
    if (!workletNode || !audioBuffer) return;

    // Connect the custom node to the destination
    workletNode.connect(audioContext.destination);
    console.log('Custom node connected:', workletNode);

    // Start playback
    workletNode.port.postMessage({ action: 'play' });
}

// Stop audio
function stopAudio() {
    if (workletNode) {
        workletNode.port.postMessage({ action: 'stop' });
        workletNode.disconnect();
    }
}

// Handle playback rate change
function handleRateChange(event) {
    const rate = parseFloat(event.target.value);
    setPlaybackRate(rate);
    document.getElementById('rateLabel').innerText = rate;
}

// Set playback rate
function setPlaybackRate(rate) {
    if (workletNode) {
        workletNode.port.postMessage({ action: 'setRate', rate: rate });
    }
}

// Handle loop change
function handleLoopChange(event) {
    if (workletNode) {
        workletNode.port.postMessage({ action: 'loop', loop: event.target.checked });
    }
}

// Helper function to read file as ArrayBuffer
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
    if (workletNode) {
        workletNode.port.postMessage({ action: 'stop' });
    }
}

function handleMouseUp(event) {
    if (!workletNode || !audioBuffer || !mouseDown) return;
    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    let position = x / rect.width;
    console.log(event.clientX);
    if (workletNode) {
        workletNode.port.postMessage({ action: 'position', position: position });
        console.log(isOver);
        if (!isOver) {
            workletNode.port.postMessage({ action: 'play' });
        }
    }
    mouseDown = false;
}

function handleWaveformDrag(event) {
    if (!workletNode || !audioBuffer || !mouseDown) return;
    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const position = x / rect.width;
    waveform.updatePlayhead(position);
}
import { Waveform } from './waveform.js';

let audioContext;
let audioBuffer;
let channelData;
let grainletNodes = [];
let waveform;

let mouseDown = false;

// Event listeners
document.getElementById('audioFile').addEventListener('change', handleFileInput);
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
    channelData = audioBuffer.getChannelData(0); // Use the first channel for simplicity

    waveform = new Waveform('waveformCanvas', 'playhead');
    waveform.plot(audioBuffer);

    await audioContext.audioWorklet.addModule('./src/grain.js');

}

function stopAudio() {
    for (let node of grainletNodes) {
        node.port.postMessage({ action: 'stop' });
        node.disconnect();
    }
    grainletNodes = [];
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
}

function handleMouseUp(event) {
    mouseDown = false;
}

function handleWaveformDrag(event) {
    if (!audioBuffer || !mouseDown) return;
    const rect = event.target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const position = x / rect.width;
    let grainletNode = new AudioWorkletNode(audioContext, 'grain-processor');
    grainletNode.connect(audioContext.destination);

    // TODO: Create a grain from a segment of the audio buffer
    /// ????

    // grainletNode.port.postMessage({
    //     action: 'play',
    //     buffer: grainBuffer.buffer, // Transfer the underlying buffer
    //     rate: 1,
    // }, [grainBuffer.buffer]); // Transfer ownership of the buffer

    grainletNodes.push(grainletNode);
    waveform.updatePlayhead(position);
}
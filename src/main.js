import { Waveform } from './waveform.js';

let audioContext;
let audioBuffer;
let channelData;
let grainletNodes = [];
let waveform;

let mouseDown = false;

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

    const grainDuration = 0.1; // in seconds
    const startTime = position * audioBuffer.duration;
    const endTime = Math.min(startTime + grainDuration, audioBuffer.duration);

    const startSample = Math.floor(startTime * audioBuffer.sampleRate);
    const endSample = Math.floor(endTime * audioBuffer.sampleRate);
    const grainLength = endSample - startSample;

    const grainBuffer = audioContext.createBuffer(1, grainLength, audioBuffer.sampleRate);
    const grainData = grainBuffer.getChannelData(0);

    for (let i = 0; i < grainLength; i++) {
        grainData[i] = channelData[startSample + i];
    }

    let grainletNode = new AudioWorkletNode(audioContext, 'grain-processor');
    grainletNode.connect(audioContext.destination);

    grainletNode.port.postMessage({
        action: 'play',
        buffer: grainBuffer.getChannelData(0).buffer,
        rate: 1,
    }, [grainBuffer.getChannelData(0).buffer]);

    grainletNodes.push(grainletNode);
    waveform.updatePlayhead(position);
}
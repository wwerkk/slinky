import { Waveform } from './waveform.js';

const DEFAULT_SAMPLE_URL = './sine.wav';

let audioContext;
let audioBuffer;
let channelData;
let olaNode;
let waveform;

let mouseDown = false;
let lastX = 0;
let lastTime = 0;

let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

document.addEventListener('dragover', handleDragOver);
document.addEventListener('drop', handleDrop);
document.getElementById('waveformCanvas').addEventListener('mousedown', handleMouseDown);
document.addEventListener('mouseup', handleMouseUp); // pick up mouseUp anywhere
document.getElementById('waveformCanvas').addEventListener('mousemove', handleWaveformDrag);
document.getElementById('recordButton').addEventListener('click', toggleRecording);

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
    channelData = audioBuffer.getChannelData(0); // first channel for simplicity

    waveform.plot(audioBuffer);

    if (!olaNode) {
        await audioContext.audioWorklet.addModule('./src/ola.js');
        olaNode = new AudioWorkletNode(audioContext, 'ola-processor');
        olaNode.connect(audioContext.destination);
    }
}

async function toggleRecording() {
    if (!isRecording) {
        await startRecording();
    } else {
        stopRecording();
    }
}

async function startRecording() {
    try {
        // Show waiting state immediately when clicked
        const button = document.getElementById('recordButton');
        button.classList.add('waiting');
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedChunks = [];
        
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstart = () => {
            // Remove waiting state and show recording state when recording actually starts
            button.classList.remove('waiting');
            button.classList.add('recording');
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
                waveform.plot(audioBuffer);
                
                if (!olaNode) {
                    await audioContext.audioWorklet.addModule('./src/ola.js');
                    olaNode = new AudioWorkletNode(audioContext, 'ola-processor');
                    olaNode.connect(audioContext.destination);
                }
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
        const button = document.getElementById('recordButton');
        button.classList.remove('waiting');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        const button = document.getElementById('recordButton');
        button.classList.remove('recording');
        button.classList.remove('waiting');
    }
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
    olaNode.port.postMessage({
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

async function initializeDefaultBuffer() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window['webkitAudioContext'])();
    }
    const response = await fetch(DEFAULT_SAMPLE_URL);
    const arrayBuffer = await response.arrayBuffer();
    const defaultBuffer = await audioContext.decodeAudioData(arrayBuffer);
    audioBuffer = defaultBuffer;
    channelData = audioBuffer.getChannelData(0);

    if (!waveform) {
        waveform = new Waveform('waveformCanvas', 'playhead');
    }
    waveform.plot(defaultBuffer);

    if (!olaNode) {
        await audioContext.audioWorklet.addModule('./src/ola.js');
        olaNode = new AudioWorkletNode(audioContext, 'ola-processor');
        olaNode.connect(audioContext.destination);
    }
}
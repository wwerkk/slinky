let audioContext;
let audioBuffer;
let workletNode;

// Event listeners
document.getElementById('audioFile').addEventListener('change', handleFileInput);
document.getElementById('play').addEventListener('click', playAudio);
document.getElementById('stop').addEventListener('click', stopAudio);
document.getElementById('rate').addEventListener('input', handleRateChange);
document.getElementById('loop').addEventListener('input', handleLoopChange);

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

    // Load the custom processor
    await audioContext.audioWorklet.addModule('custom-processor.js');
    workletNode = new AudioWorkletNode(audioContext, 'custom-playback-processor');

    // Send the buffer to the processor
    const channelData = audioBuffer.getChannelData(0); // Use the first channel for simplicity
    workletNode.port.postMessage({
        action: 'load',
        buffer: channelData.buffer, // Transfer the underlying ArrayBuffer
    }, [channelData.buffer]); // Transfer ownership of the buffer
}

// Play audio
function playAudio() {
    if (!workletNode || !audioBuffer) return;

    stopAudio();

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
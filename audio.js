let audioContext;
let audioBuffer;
let customNode;

document.getElementById('audioFile').addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (file) {
        loadAudioFile(file);
    }
});

document.getElementById('play').addEventListener('click', function () {
    playAudio();
});

document.getElementById('stop').addEventListener('click', function () {
    stopAudio();
});

document.getElementById('rate').addEventListener('input', function (event) {
    let rate = parseFloat(event.target.value);
    setPlaybackRate(rate);
    document.getElementById('rateLabel').innerText = rate;
});

document.getElementById('loop').addEventListener('input', function (event) {
    if (customNode) {
        customNode.port.postMessage({ action: 'loop', loop: event.target.checked });
    }
});

async function loadAudioFile(file) {
    const reader = new FileReader();
    reader.onload = async function (e) {
        const arrayBuffer = e.target.result;
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Load the custom processor
        await audioContext.audioWorklet.addModule('custom-processor.js');
        customNode = new AudioWorkletNode(audioContext, 'custom-playback-processor');

        // Send the buffer to the processor
        const channelData = audioBuffer.getChannelData(0); // Use the first channel for simplicity
        customNode.port.postMessage({
            action: 'load',
            buffer: channelData.buffer, // Transfer the underlying ArrayBuffer
        }, [channelData.buffer]); // Transfer ownership of the buffer
    };
    reader.readAsArrayBuffer(file);
}

function playAudio() {
    if (!customNode || !audioBuffer) return;

    stopAudio();

    // Connect the custom node to the destination
    customNode.connect(audioContext.destination);
    console.log('Custom node connected:', customNode);
    // Start playback
    customNode.port.postMessage({ action: 'play' });
}

function stopAudio() {
    if (customNode) {
        customNode.port.postMessage({ action: 'stop' });
        customNode.disconnect();
    }
}

function setPlaybackRate(rate) {
    if (customNode) {
        customNode.port.postMessage({ action: 'setRate', rate: rate });
    }
}
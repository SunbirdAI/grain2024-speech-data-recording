let mediaRecorder;
let audioChunks = [];
let currentIndex = 0;
let lines = [];
let recordings = {};
let metadata = []; // Store metadata for each recording

document.getElementById('loadTextButton').addEventListener('click', () => {
    const textAreaValue = document.getElementById('inputTextArea').value;
    const languageCode = document.getElementById('languageCode').value.trim();
    if (!languageCode) {
        alert("Please enter a language code.");
        return;
    }

    lines = textAreaValue.split('\n').map(line => {
        const [id, text] = line.split('\t');
        return { id, text };
    }).filter(line => line.id && line.text); // Filter out invalid lines

    if (lines.length > 0) {
        currentIndex = 0;
        updateTextToRead();
        document.getElementById('recordButton').disabled = false;
        document.getElementById('prevButton').disabled = true;
        document.getElementById('nextButton').disabled = false;
        updateProgressIndicator(); // Initial progress update
    }
});

document.getElementById('recordButton').addEventListener('click', async () => {
    let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
        let id = lines[currentIndex].id;
        let languageCode = document.getElementById('languageCode').value.trim();
        let timestamp = new Date().toISOString().replace(/[-:.]/g, "");
        let filename = `${id}_${languageCode}_${timestamp}.wav`;
        let filepath = `data/${filename}`;

        let audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        audioChunks = [];

        let wavBlob = await convertToWav(audioBlob);
        recordings[filepath] = wavBlob;

        // Add metadata entry
        metadata.push({ filename: filepath, text: lines[currentIndex].text });

        // Check if all recordings are completed
        if (Object.keys(recordings).length === lines.length) {
            document.getElementById('downloadAllButton').style.display = 'inline-block';
            document.getElementById('recordButton').disabled = true;
        }

        // Auto advance to next prompt
        if (currentIndex < lines.length - 1) {
            currentIndex++;
        }
        updateTextToRead();
        updateProgressIndicator();
    };

    mediaRecorder.start();
    document.getElementById('recordButton').disabled = true;
    document.getElementById('stopButton').disabled = false;
});

document.getElementById('stopButton').addEventListener('click', () => {
    mediaRecorder.stop();
    document.getElementById('recordButton').disabled = false;
    document.getElementById('stopButton').disabled = true;
});

document.getElementById('prevButton').addEventListener('click', () => {
    if (currentIndex > 0) {
        currentIndex--;
        updateTextToRead();
        updateProgressIndicator();
    }
});

document.getElementById('nextButton').addEventListener('click', () => {
    if (currentIndex < lines.length - 1) {
        currentIndex++;
        updateTextToRead();
        updateProgressIndicator();
    }
});

document.getElementById('downloadAllButton').addEventListener('click', () => {
    let zip = new JSZip();
    let folder = zip.folder("recordings");
    let dataFolder = folder.folder("data"); // Create the data folder inside recordings
    
    for (let filepath in recordings) {
        dataFolder.file(filepath.replace('data/', ''), recordings[filepath]);
    }

    // Create metadata.csv content
    let csvContent = "file_name,transcription\n";
    metadata.forEach(entry => {
        csvContent += `${entry.filename},${entry.text}\n`;
    });

    // Add metadata.csv to the zip
    folder.file("metadata.csv", csvContent);

    zip.generateAsync({ type: "blob" })
        .then(function (content) {
            let link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = "recordings.zip";
            link.click();
        });
});

function updateTextToRead() {
    document.getElementById('textToRead').textContent = lines[currentIndex].text;
    document.getElementById('prevButton').disabled = currentIndex === 0;
    document.getElementById('nextButton').disabled = currentIndex === lines.length - 1;
}

function updateProgressIndicator() {
    document.getElementById('progressIndicator').textContent = `Example ${currentIndex + 1} of ${lines.length}`;
}

async function convertToWav(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await decodeAudioData(arrayBuffer);
    const wavBuffer = encodeWAV(audioBuffer);
    return new Blob([wavBuffer], { type: 'audio/wav' });
}

function decodeAudioData(arrayBuffer) {
    return new Promise((resolve, reject) => {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContext.decodeAudioData(arrayBuffer, resolve, reject);
    });
}

function encodeWAV(audioBuffer) {
    const numOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    let result;

    const numberOfFrames = audioBuffer.length * numOfChannels;
    const buffer = new ArrayBuffer(44 + numberOfFrames * 2);
    const view = new DataView(buffer);

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* file length */
    view.setUint32(4, 36 + numberOfFrames * 2, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, format, true);
    /* channel count */
    view.setUint16(22, numOfChannels, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * numOfChannels * 2, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, numOfChannels * 2, true);
    /* bits per sample */
    view.setUint16(34, bitDepth, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, numberOfFrames * 2, true);

    // Write the PCM samples
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        const data = audioBuffer.getChannelData(i);
        for (let j = 0; j < data.length; j++) {
            const s = Math.max(-1, Math.min(1, data[j]));
            view.setInt16(44 + (i * data.length + j) * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }

    return buffer;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

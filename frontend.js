//The pitch detection and recording frontend for music improvisation
//Debasish (Debashish) Buragohain
//@ts-check
const showOctave = true;                //also detect the octaves
const interval = 125;                   //time in miliseconds between each note while listening to the song
const maxListenInterval = 4000;         //the maximum time to wait in case of a silence period
let detectingPitch = false;             //if we are currently detecting the pitch of the song
const sleep = ms => new Promise(req => setTimeout(req, ms));
const startListBtn = document.getElementsByClassName('btn')[0];
const stopListBtn = document.getElementsByClassName('btn')[1];
var songStartTime;
var songEndtime;
window.AudioContext = window.AudioContext || window.webkitAudioContext;
var audioContext = null;
var isPlaying = false;
var sourceNode = null;
var analyser = null;
var theBuffer = null;
var mediaStreamSource = null;
var pitchValue, noteValue, detuneValue;	  //the output variables
var adjustedNote;                           //the note combined with the adjusted octave
var rafID = null;
var tracks = null;
var buflen = 2048;
var buf = new Float32Array(buflen);
var noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
var canvas, ctx;

window.addEventListener('load', function () {
    canvas = document.getElementById('equalizer');
    ctx = canvas.getContext('2d');
    startListBtn.addEventListener('click', () => {
        audioContext = new AudioContext();
        MAX_SIZE = Math.max(4, Math.floor(audioContext.sampleRate / 5000));	// corresponds to a 5kHz signal
        var request = new XMLHttpRequest();
        var songURL = "./inputSong.wav";
        request.open("GET", songURL, true);
        request.responseType = "arraybuffer";
        request.onload = function () {
            //we start the pitch detection at this point
            audioContext.decodeAudioData(request.response, function (buffer) {
                theBuffer = buffer;
                togglePlayback();
                toggleListen();                     //start listening to the song now
            });
        }
        request.send();
    })
    stopListBtn.addEventListener('click', function () {
        toggleListen(true);                           //stop listening at this point
    })
});

var song = new Array(0);                //the song array contains all the notes serially to the end
//function to start and stop listening to the song
async function toggleListen(stop) {
    let continueListening = true;               //if we should continue listening to the song
    if (stop !== true) {
        console.log("started listening.");      //we won't clear the existig songs at this point
        var endTime = 0;                        //the end of the time period, initialized to 0
        var startTime = new Date().getTime();   //the start of the period of listening to the song
        songStartTime = startTime;              //set the global song start time
        while (continueListening) {
            var currentNote = adjustedNote;       //we use the adjusted note for recording the song
            if (currentNote !== null) {
                startTime = new Date().getTime();//update the last heard time
                song.push(adjustedNote)
            }
            else {
                if (endTime - startTime <= maxListenInterval) {
                    endTime = new Date().getTime();
                    song.push('null');          //in this case the 'null' is a string which represents a silence period
                }
                else if (endTime - startTime > maxListenInterval) {
                    console.log("Stopped listening as no note detected for too long.")
                    stopListening(true, song);
                }
            }
            await sleep(interval);
        }
    }
    else stopListening(true, song);

    //stop listening to the song
    function stopListening(sendToBackend, song) {
        songEndtime = new Date().getTime();
        if (isPlaying) togglePlayback();
        continueListening = false;
        if (sendToBackend !== false) {
            console.log("stopped listening. Song duration: ", (song.length * interval) / 10000, 's');
            //we won't send the song immdediately after we have stopped listening
        }
    }
}

function togglePlayback() {
    if (isPlaying) {
        //stop playing and return
        sourceNode.stop(0);
        sourceNode = null;
        analyser = null;
        isPlaying = false;
        //animation frames are required in the program
        if (!window.cancelAnimationFrame) window.cancelAnimationFrame = window.webkitCancelAnimationFrame;
        window.cancelAnimationFrame(rafID);
        console.log("Stopped listening.")
        return "start";
    }
    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = theBuffer;
    sourceNode.loop = false;                    //we don't want the track to continue playing on and on
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    sourceNode.connect(analyser);
    analyser.connect(audioContext.destination);
    sourceNode.start(0);
    isPlaying = true;
    updatePitch();
    return "stop";
}

function noteFromPitch(frequency) {
    var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    return Math.round(noteNum) + 69;
}

function frequencyFromNoteNumber(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
}

function centsOffFromPitch(frequency, note) {
    return Math.floor(1200 * Math.log(frequency / frequencyFromNoteNumber(note)) / Math.log(2));
}

function autoCorrelate(buf, sampleRate) {
    // Implements the ACF2+ algorithm
    var SIZE = buf.length;
    var rms = 0;
    for (var i = 0; i < SIZE; i++) {
        var val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) // not enough signal
        return -1;
    var r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (var i = 0; i < SIZE / 2; i++)
        if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (var i = 1; i < SIZE / 2; i++)
        if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }

    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    var c = new Array(SIZE).fill(0);
    for (var i = 0; i < SIZE; i++)
        for (var j = 0; j < SIZE - i; j++)
            c[i] = c[i] + buf[j] * buf[j + i];

    var d = 0; while (c[d] > c[d + 1]) d++;
    var maxval = -1, maxpos = -1;
    for (var i = d; i < SIZE; i++) {
        if (c[i] > maxval) {
            maxval = c[i];
            maxpos = i;
        }
    }
    var T0 = maxpos;
    var x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);
    return sampleRate / T0;
}

function updatePitch(time) {
    //the frequency bars
    var fbc_array = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(fbc_array);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00ccFF'; //color of the bars
    const bars = 100
    for (let i = 0; i < bars; i++) {
        let bar_x = i * 3;
        let bar_width = 2;
        let bar_height = -(fbc_array[i] / 2);
        ctx.fillRect(bar_x, canvas.height, bar_width, bar_height);
    }
    //the pitch detection model
    analyser.getFloatTimeDomainData(buf);
    var ac = autoCorrelate(buf, audioContext.sampleRate);
    let detectionType;
    if (ac == -1) {
        detectionType = 'vague'
        pitchValue = null;
        noteValue = null;
        detuneValue = null;
    } else {
        detectionType = 'confident';
        var pitch = ac;
        pitchValue = Math.round(pitch);
        var note = noteFromPitch(pitch);
        noteValue = noteStrings[note % 12];
        adjustedNote = noteValue + determineOctave(pitch, 2);           //adjustment for suitable MIDI to WAV conversion  
        var detune = centsOffFromPitch(pitch, note);
        detuneValue = Math.abs(detune);		//finally get the detune value
        if (showOctave) {
            noteValue += determineOctave(pitchValue);

        }
    }
    document.getElementById("outputArea").innerText = 'confidence: ' + detectionType + ', note: ' + noteValue + " , pitch: " + pitchValue + " Hz , cents off pitch: " + detuneValue;
    if (!window.requestAnimationFrame) window.requestAnimationFrame = window.webkitRequestAnimationFrame;
    rafID = window.requestAnimationFrame(updatePitch);
}

function determineOctave(freq, adjustment = 0) {
    function inBet(num, lwr, upp) {
        if (num >= lwr && num < upp) return true;
        else return false;
    }
    let octave;		//we assume an empty octave here
    if (inBet(freq, 16, 33)) octave = 0 + adjustment
    else if (inBet(freq, 33, 65)) octave = 1 + adjustment
    else if (inBet(freq, 65, 131)) octave = 2 + adjustment
    else if (inBet(freq, 131, 262)) octave = 3 + adjustment
    else if (inBet(freq, 262, 523)) octave = 4 + adjustment
    else if (inBet(freq, 523, 1047)) octave = 5 + adjustment
    else if (inBet(freq, 1047, 2093)) octave = 6 + adjustment
    else if (inBet(freq, 2093, 4186)) octave = 7 + adjustment
    else if (freq >= 4186) octave = 8 + adjustment;
    return String(Math.min(octave + adjustment, 8));
}

//playback function
const playBtn = document.getElementsByClassName('btn')[2];
playBtn.addEventListener('click', () => {
    //the first step is to send the songs to the backend
    var songLength = (songEndtime - songStartTime) / 1000;
    songEndtime = undefined;
    songStartTime = undefined;
    console.log("Sent song of calculated interval ", (song.length * interval) / 1000, ' s and recorded interval: ', songLength, 's to the backend.')
    fetch('http://127.0.0.1:4756/songImproviseBackend', {
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: song, length: songLength }),
        method: 'POST'
    })
        //now time to finally play the improvised audio
        .then(d => d.json())
        .then(res => {
            if (res.status == 'success') initAudioPlayer(res.file);
            else console.error("Error in server.");
        })
        .catch(err => console.error("Error sending song to backend: ", err));
})

function initAudioPlayer(url) {
    console.log("PLaying the improvised audio.")
    var audio = new Audio();
    audio.src = url;
    audio.controls = true;
    audio.loop = true;
    document.getElementById('audio_box').appendChild(audio);
    analyser = audioContext.createAnalyser();               //AnalyserNode method
    let source = audioContext.createMediaElementSource(audio);   //connect the audio tag as the source
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    frameLooper();
    function frameLooper() {
        (window.requestAnimationFrame || window.webkitRequestAnimationFrame)(frameLooper);
        let fbc_array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(fbc_array);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#00ccFF'; //color of the bars
        const bars = 100
        for (let i = 0; i < bars; i++) {
            let bar_x = i * 3;
            let bar_width = 2;
            let bar_height = -(fbc_array[i] / 2);
            ctx.fillRect(bar_x, canvas.height, bar_width, bar_height);
        }
    }
}

const exitBtn = document.getElementsByClassName('btn')[3];
exitBtn.addEventListener('click', function () {
    //we inform every program to stop execution
    fetch('http://127.0.0.1:4756/exit', {
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ exit: true }),
        method: 'POST'
    })
})
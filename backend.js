//NodeJS backend for song improvisation module
//Debasish (Debashish) Buragohain
//@ts-check 

const interval = 125;                                       //beat interval
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');
const fetch = require('./node-fetch/lib/index');            //the commonJS version of node-fetch that is currently not available on npm
const MidiWriter = require('midi-writer-js');
const child_process = require('child_process');
const app = express();
app.use(bodyParser.json({ limit: '50MB' }));
app.use(function (err, req, res, next) {
    res.status(500).send('Something broke!')
    next();
});
//CORS headers
app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    res.setHeader('Access-Control-Allow-Credentials', false); //no cookies needed
    next(); //pass to the next layer of middleware
});
app.use('/file', express.static(path.join(__dirname)));         //define a static file server
const jsonOptions = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
}

//start the python backends
child_process.exec('start py -3.6 ./midi2voice/voice.py', function (err, stdout, stderr) {
    if (err) console.error('Error in starting midi2voice python server: ', err);
})
child_process.exec('start py -3.7 ./ai_duet/ai_duet_backend.py', function (err, stdout, stderr) {
    if (err) console.error('Error in starting AI Duet python server: ', err);
})

app.post('/songImproviseBackend', async function (req, res) {
    let songLength = req.body.length;                                      //get the calculated duration of the song
    let songArr = req.body.data;                                           //we use the duration only for the trimming purpose
    console.log("Song length: ", songLength);
    console.log("Calculated song length: ", songArr.length * interval / 1000);
    if (songArr.length !== 0) {
        var track = new MidiWriter.Track();
        let savedTimes = 0;
        const unitImproviseDuration = 4000;                                 //the duration in ms of a single MIDI section        
        //we will stop as soon as we have reached the original song length
        for (var j = 0, m = 0; j < songArr.length; j++, m++) {
            let note;
            if (songArr[j] !== 'null') note = new MidiWriter.NoteEvent({ pitch: [songArr[j]], duration: '8' });
            else note = new MidiWriter.NoteEvent({ pitch: undefined, duration: '8' });
            track.addEvent(note)
            //if we have enough length for an improvisation unit
            //we leave the very last unitMIDI song to make sure we are not overlength
            if ((m + 1) * interval >= unitImproviseDuration) {
                m = 0;                                                             //reset the counter
                var write = new MidiWriter.Writer(track);
                fs.writeFileSync('./ai_duet/inputs/song.mid', write.buildFile());   //save the MIDI section into the input folder of ai_duet
                await fetch('http://127.0.0.1:5030/predict', {                      //inform the ai duet server to improvise the song
                    headers: jsonOptions,
                    method: 'POST',
                    body: JSON.stringify({ improvise_song: true })
                })
                    .then(res => res.buffer())
                    .then(midiFile => {
                        console.log("received ai-duet improvised section.")
                        fs.createWriteStream('./midi2voice/improvisedMidiUnits/' + savedTimes + '.mid').write(midiFile);
                        savedTimes++;
                        track = new MidiWriter.Track();                             //reset the track now
                    })
                    .catch(err => console.error('Error: Error in sending request to music improvisation server: ' + err));
            }
        }
        //the combination of individual MIDI files through subloops each subloop has groupMIDI midi files but the last subloop has savedTimes % groupMIDI files        
        const groupMIDI = 10;
        console.log("saved times:", savedTimes);
        let subLoops = (savedTimes >= 10) ? Math.floor(savedTimes / groupMIDI) : 1; //number of subloops required
        let initCommand = 'py -3.6 midi_sox_py.py ';          //initial command
        for (var i = 0; i < subLoops; i++) {
            let thisCommand = initCommand + '--combine concatenate ';                //we are to concatenate the files
            if (i == subLoops - 1) {                                                //if we are in the last subloop
                let remIterations = savedTimes % groupMIDI;
                for (var d = 0; d < remIterations; d++) thisCommand += './midi2voice/improvisedMidiUnits/' + (i * 10 + d) + '.mid ';
            }
            else for (var d = 0; d < groupMIDI; d++) thisCommand += './midi2voice/improvisedMidiUnits/' + (i * 10 + d) + '.mid ';
            thisCommand += './midi2voice/improvisedMidiUnits/subLoop' + i + '.mid'
            try {
                child_process.execSync(thisCommand);                               //synchronous execution is necessary here
                console.log("Combined subloop" + i + ".mid");
            }
            catch (err) {
                console.error("Error combining MIDI files of subloop: ", subLoops, ": ", err.message);
                console.error("Files within subloop: ", savedTimes % groupMIDI);
            }
        }
        //the loop where we combine all the subloops
        let thisCommand = initCommand;
        for (var i = 0; i < subLoops; i++) thisCommand += './midi2voice/improvisedMidiUnits/subLoop' + i + '.mid ';
        thisCommand += './midi2voice/improvisedMidiUnits/improvisedSong.mid';
        try { child_process.execSync(thisCommand); console.log("Combined final MIDI files") }
        catch (err) { console.error("Error combining final MIDI files: ", err.message); }
        //finally delete the RAW files
        for (var i = 0; i < savedTimes; i++) {
            try { fs.unlinkSync('./midi2voice/improvisedMidiUnits/' + i + '.mid'); console.log("Deleted " + i + '.mid'); }
            catch (error) { console.error("Error in deleting " + i + '.mid: ', error.message) }
        }
        for (var i = 0; i < subLoops; i++) {
            try { fs.unlinkSync('./midi2voice/improvisedMidiUnits/subLoop' + i + '.mid'); console.log("Deleted subLoop" + i + ".mid"); }
            catch (error) { console.error("Error in deleting subloop " + i + ".mid: ", error.message); }
        }
        //before requesting the midi2voice server we are going to trim the generated MIDI file
        thisCommand = initCommand + './midi2voice/improvisedMidiUnits/improvisedSong.mid ./midi2voice/improvisedMidiUnits/improvisedSong.mid trim 0 ' + songLength;
        try { child_process.execSync(thisCommand); console.log("Trimmed MIDI file to the original length.") }
        catch (err) { console.error("Error in trimming final MIDI file: ", err.message) }
        //before that we mix the original MIDI file and the improvised file
        thisCommand = initCommand + '-m ./midi2voice/improvisedMidiUnits/improvisedSong.mid ./inputSong.mid ./midi2voice/improvisedMidiUnits/improvisedSong.mid';
        try { child_process.execSync(thisCommand); console.log("Mixed original and improvised MIDI files") }
        catch (err) { console.error("Error in mixing original and improvised MIDI files: ", err.message) }
        //finally request the midi2voice server to perform the voice renderizations
        fetch('http://127.0.0.1:5010/voice', {
            headers: jsonOptions,
            method: "POST",
            body: JSON.stringify({ convert: true })
        })
            .then(r => r.text())
            .then(givText => {
                //we can include the res.json() at this point
                if (givText.includes("converted file to WAV.")) {
                    console.log("Voice renderization successful.");
                    res.json({ status: 'success', file: 'outputSong.wav' })       //inform the frontend at this
                }
                else {
                    console.error("Error in voice renderization");
                    res.json({ status: 'error' });
                }
            })
            .catch(err => console.error("Error in connecting to midi2voice server: ", err));
    }
    else {
        console.error('Given song has 0 length.');
        res.json({ status: 'error' });          //inform the frontend that there has been an error in the server
    }
})

app.post('/exit', async function (req, res) {
    res.json({ received: true });
    //exit midi2voice
    await fetch('http://127.0.0.1:5010/exit', {
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: 'exit',
        method: 'POST'
    })
        .catch(err => console.error("Error in sending exit request to midi2voice server: ", err));
    //exit ai duet
    await fetch('http://127.0.0.1:5030/exit', {
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: 'exit',
        method: 'POST'
    })
        .catch(err => console.error("Error in sending exit request to ai-duet server: ", err));
    //exit chrome
    child_process.exec('TASKKILL /F /IM chrome.exe', function (err, stdout, stderr) {
        if (err) console.error("Error in exiting chrome: ", err)
    })
    //exit node js finally
    process.exit();
})

app.listen(4756, () => console.log('music improvisation backend running at http://127.0.0.1:4756/'));
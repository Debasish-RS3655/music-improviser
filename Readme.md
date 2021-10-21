## Music Improviser

A simple program which takes an MIDI and a lyrics.txt file, improvises it using machine learning, mixes with the original MIDI file, applies 
the lyrics and plays back in a web interface. 

## Warning 
Music Improviser is still beta.

## Credits
It's based primarily on Google's AI duet, [mathigatti's midi2voice], Web Audio API and FFT. 

## Overview
The frontend is the interface for recording songs. The backend composed of NodeJS and Python3 are responsible for improvising and combining with
the lyrics.


## Platform
Tested on Windows 10 64 bit

## Installation
Requires python3 and NodeJS installed
```bash
pip install -r requirements.txt
npm install
```

## Execution
Run the following files:
```bash
node backend.js
```
```bash
python ./ai_duet/ai_duet_backend.py
```
```bash
python ./midi2voice/voice.py
```
The frontend is available at http://127.0.01:4756/file/frontend.html
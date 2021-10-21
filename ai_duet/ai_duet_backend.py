#AI duet module for music improvisation
#Debasish Buragohain
from flask import Flask
import json
import time
from predict import generate_midi
import os
from flask import send_file, request
import pretty_midi
import sys

if sys.version_info.major <= 2:
    from cStringIO import StringIO
else:
    from io import StringIO

def initialise():
    print('initialising AI duet..')
    initialData = pretty_midi.PrettyMIDI('./ai_duet/inputs/initialise.mid')
    initialImpovised = generate_midi(initialData)
    print('AI duet successfully initialised.')

initialise()
app = Flask(__name__)
print("AI duet python backend running at http://127.0.0.1:5030/")

#immediate exiting of the code
@app.route('/exit', methods = ["POST"])
def exitFunc():    
    os._exit(0)

@app.route('/predict', methods=['GET', 'POST'])
def predict():
    now = time.time()
    # input song
    midi_data = pretty_midi.PrettyMIDI('./ai_duet/inputs/song.mid')
    ret_midi = generate_midi(midi_data)
    # send the modified midi file back to the matrix
    return send_file(ret_midi, attachment_filename='return.mid',
                mimetype='audio/midi', as_attachment=True)

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5030, debug = False)
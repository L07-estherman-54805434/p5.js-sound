define(function (require) {

  'use strict';

  require('sndcore');
  var p5sound = require('master');
  var ac = p5sound.audiocontext;

  /**
   *  <p>SoundFile object with a path to a file.</p>
   *  
   *  <p>The p5.SoundFile may not be available immediately because
   *  it loads the file information asynchronously.</p>
   * 
   *  <p>To do something with the sound as soon as it loads
   *  pass the name of a function as the second parameter.</p>
   *  
   *  <p>Only one file path is required. However, audio file formats 
   *  (i.e. mp3, ogg, wav and m4a/aac) are not supported by all
   *  web browsers. If you want to ensure compatability, instead of a single
   *  file path, you may include an Array of filepaths, and the browser will
   *  choose a format that works.</p>
   * 
   *  @class p5.SoundFile
   *  @constructor
   *  @param {String/Array} path   path to a sound file (String). Optionally,
   *                               you may include multiple file formats in
   *                               an array.
   *  @param {Function} [callback]   Name of a function to call once file loads
   *  @return {Object}    p5.SoundFile Object
   *  @example 
   *  <div><code>
   *  function preload() {
   *    mySound = loadSound('assets/doorbell.mp3');
   *  }
   *
   *  function setup() {
   *    mySound.play(0, 0.2, 0.2);
   *  }
   * 
   * </code></div>
   */
  p5.SoundFile = function(paths, onload, whileLoading) {
    if((typeof paths) == "string"){
      var path = p5.prototype._checkFileFormats(paths);
      this.url = path;
    }
    else if((typeof paths) == "object"){
      this.file = paths;
    }
    
    this._looping = false;
    this._playing = false;
    this._paused = false;
    this._pauseTime = 0;

    //  position of the most recently played sample
    this._lastPos = 0;
    this._counterNode;
    this._scopeNode;

    // array of sources so that they can all be stopped!
    this.bufferSourceNodes = [];

    // current source
    this.bufferSourceNode = null;

    this.buffer = null;
    this.playbackRate = 1;
    this.gain = 1;

    this.input = p5sound.audiocontext.createGain();
    this.output = p5sound.audiocontext.createGain();

    this.reversed = false;

    // start and end of playback / loop
    this.startTime = 0;
    this.endTime = null;
    this.pauseTime = 0;

    // "restart" would stop playback before retriggering
    this.mode = 'sustain';

    // time that playback was started, in millis
    this.startMillis = null;

    this.amplitude = new p5.Amplitude();
    this.output.connect(this.amplitude.input);

    // stereo panning
    this.panPosition = 0.0;
    this.panner = new p5.Panner(this.output, p5sound.input, 2);

    // it is possible to instantiate a soundfile with no path
    if (this.url || this.file) {
      this.load(onload);
    }

    // add this p5.SoundFile to the soundArray
    p5sound.soundArray.push(this);

    if (typeof(whileLoading) === 'function') {
      this.whileLoading = whileLoading;
    } else {
      this.whileLoading = function() {};
    }
  };

  // register preload handling of loadSound
  p5.prototype.registerPreloadMethod('loadSound');

  /**
   *  loadSound() returns a new p5.SoundFile from a specified
   *  path. If called during preload(), the p5.SoundFile will be ready
   *  to play in time for setup() and draw(). If called outside of
   *  preload, the p5.SoundFile will not be ready immediately, so
   *  loadSound accepts a callback as the second parameter. Using a
   *  <a href="https://github.com/processing/p5.js/wiki/Local-server">
   *  local server</a> is recommended when loading external files.
   *  
   *  @method loadSound
   *  @param  {String/Array}   path     Path to the sound file, or an array with
   *                                    paths to soundfiles in multiple formats
   *                                    i.e. ['sound.ogg', 'sound.mp3']
   *  @param {Function} [callback]   Name of a function to call once file loads
   *  @param {Function} [callback]   Name of a function to call while file is loading.
   *                                 This function will receive a percentage from 0.0
   *                                 to 1.0.
   *  @return {SoundFile}            Returns a p5.SoundFile
   *  @example 
   *  <div><code>
   *  function preload() {
   *   mySound = loadSound('assets/doorbell.mp3');
   *  }
   *
   *  function setup() {
   *    mySound.play();
   *  }
   *  </code></div>
   */
  p5.prototype.loadSound = function(path, callback, whileLoading){
    // if loading locally without a server
    if (window.location.origin.indexOf('file://') > -1 && window.cordova === 'undefined' ) {
      alert('This sketch may require a server to load external files. Please see http://bit.ly/1qcInwS');
    }

    var s = new p5.SoundFile(path, callback, whileLoading);
    return s;
  };

  /**
   * This is a helper function that the p5.SoundFile calls to load
   * itself. Accepts a callback (the name of another function)
   * as an optional parameter.
   *
   * @private
   * @param {Function} [callback]   Name of a function to call once file loads
   */
  p5.SoundFile.prototype.load = function(callback){
    if(this.url != undefined && this.url != ""){
      var sf = this;
      var request = new XMLHttpRequest();
      request.addEventListener('progress', function(evt) {
                                            sf._updateProgress(evt);
                                           }, false);
      request.open('GET', this.url, true);
      request.responseType = 'arraybuffer';
      // decode asyncrohonously
      var self = this;
      request.onload = function() {
        ac.decodeAudioData(request.response, function(buff) {
          self.buffer = buff;
          self.panner.inputChannels(buff.numberOfChannels);
          if (callback) {
            callback(self);
          }
        });
      };
      request.send();
    }
    else if(this.file != undefined){
      var reader = new FileReader();
      var self = this;
      reader.onload = function() {
        ac.decodeAudioData(reader.result, function(buff) {
          self.buffer = buff;
          self.panner.inputChannels(buff.numberOfChannels);
          if (callback) {
            callback(self);
          }
        });
      };
      reader.readAsArrayBuffer(this.file);
    }
  };

  // TO DO: use this method to create a loading bar that shows progress during file upload/decode.
  p5.SoundFile.prototype._updateProgress = function(evt) {
    if (evt.lengthComputable) {
      var percentComplete = Math.log(evt.loaded / evt.total * 9.9);
      this.whileLoading(percentComplete);
      // ...
    } else {
      console.log('size unknown');
      // Unable to compute progress information since the total size is unknown
    }
  };

  /**
   *  Returns true if the sound file finished loading successfully.
   *  
   *  @method  isLoaded
   *  @return {Boolean} 
   */
  p5.SoundFile.prototype.isLoaded = function() {
    if (this.buffer) {
      return true;
    } else {
      return false;
    }
  };

  /**
   * Play the p5.SoundFile
   *
   * @method play
   * @param {Number} [startTime]            (optional) schedule playback to start (in seconds from now).
   * @param {Number} [rate]             (optional) playback rate
   * @param {Number} [amp]              (optional) amplitude (volume)
   *                                     of playback
   * @param {Number} [cueStart]        (optional) cue start time in seconds
   * @param {Number} [duration]          (optional) duration of playback in seconds
   */
  p5.SoundFile.prototype.play = function(time, rate, amp, _cueStart, duration) {
    var self = this;
    var now = p5sound.audiocontext.currentTime;
    var cueStart, cueEnd;
    var time = time || 0;
    if (time < 0) {
      time = 0;
    }

    time = time + now;

    // TO DO: if already playing, create array of buffers for easy stop()
    if (this.buffer) {

      // reset the pause time (if it was paused)
      this._pauseTime = 0;

      // handle restart playmode
      if (this.mode === 'restart' && this.buffer && this.bufferSourceNode) {
        var now = p5sound.audiocontext.currentTime;
        this.bufferSourceNode.stop(time);
        this._counterNode.stop(time);
      }

      // make a new source and counter. They are automatically assigned playbackRate and buffer
      this.bufferSourceNode = this._initSourceNode();
      this._counterNode = this._initCounterNode();

      if (_cueStart) {
        if (_cueStart >=0 && _cueStart < this.buffer.duration){
          // this.startTime = cueStart;
          cueStart = _cueStart;
        } else { throw 'start time out of range'; }
      } else {
        cueStart = 0;
      }

      if (duration) {
        // if duration is greater than buffer.duration, just play entire file anyway rather than throw an error
        duration = duration <= this.buffer.duration - cueStart ? duration : this.buffer.duration;
      } else {
        duration = this.buffer.duration - cueStart;
      }

      // method of controlling gain for individual bufferSourceNodes, without resetting overall soundfile volume
      if (!this.bufferSourceNode.gain) {
        this.bufferSourceNode.gain = p5sound.audiocontext.createGain();
        this.bufferSourceNode.connect(this.bufferSourceNode.gain);

        // set local amp if provided, otherwise 1
        var a = amp || 1;
        this.bufferSourceNode.gain.gain.setValueAtTime(a, p5sound.audiocontext.currentTime);
        this.bufferSourceNode.gain.connect(this.output); 
      }

      // not necessary with _initBufferSource ?
      // this.bufferSourceNode.playbackRate.cancelScheduledValues(now);
      rate = rate || Math.abs(this.playbackRate);
      this.bufferSourceNode.playbackRate.setValueAtTime(rate, now);

      // if it was paused, play at the pause position
      if (this._paused){
        this.bufferSourceNode.start(time, this.pauseTime, duration);
        this._counterNode.start(time, this.pauseTime, duration);
      }
      else {
        // this.pauseTime = 0;
        this.bufferSourceNode.start(time, cueStart, duration);
        this._counterNode.start(time, cueStart, duration);
      }

      this._playing = true;
      this._paused = false;

      // add source to sources array, which is used in stopAll()
      this.bufferSourceNodes.push(this.bufferSourceNode);
      this.bufferSourceNode._arrayIndex = this.bufferSourceNodes.length - 1;

      // delete this.bufferSourceNode from the sources array when it is done playing:
      this.bufferSourceNode.onended = function(e) {
        var theNode = this;
        setTimeout( function(){
          self.bufferSourceNodes.splice(theNode._arrayIndex, 1);
        }, 1);
      }
    }
    // If soundFile hasn't loaded the buffer yet, throw an error
    else {
      throw 'not ready to play file, buffer has yet to load. Try preload()';
    }

    // if looping, will restart at original time
    this.bufferSourceNode.loop = this._looping;
    this._counterNode.loop = this._looping;

    if (this._looping === true){
      var cueEnd = cueStart + duration;
      console.log('cueEnd = ' + cueEnd);
      this.bufferSourceNode.loopStart = cueStart;
      this.bufferSourceNode.loopEnd = cueEnd;
      this._counterNode.loopStart = cueStart;
      this._counterNode.loopEnd = cueEnd;

    }
  };


  /**
   *  p5.SoundFile has two play modes: <code>restart</code> and
   *  <code>sustain</code>. Play Mode determines what happens to a
   *  p5.SoundFile if it is triggered while in the middle of playback.
   *  In sustain mode, playback will continue simultaneous to the
   *  new playback. In restart mode, play() will stop playback
   *  and start over. Sustain is the default mode. 
   *  
   *  @method  playMode
   *  @param  {String} str 'restart' or 'sustain'
   *  @example
   *  <div><code>
   *  function setup(){
   *    mySound = loadSound('assets/Damscray_DancingTiger.mp3');
   *  }
   *  function mouseClicked() {
   *    mySound.playMode('sustain');
   *    mySound.play();
   *  }
   *  function keyPressed() {
   *    mySound.playMode('restart');
   *    mySound.play();
   *  }
   * 
   * </code></div>
   */
  p5.SoundFile.prototype.playMode = function(str) {
    var s = str.toLowerCase();

    // if restart, stop all other sounds from playing
    if (s === 'restart' && this.buffer && this.bufferSourceNode) {
      for (var i = 0; i < this.bufferSourceNodes.length - 1; i++){
        var now = p5sound.audiocontext.currentTime;
        this.bufferSourceNodes[i].stop(now);
      }
    }

    // set play mode to effect future playback
    if (s === 'restart' || s === 'sustain') {
      this.mode = s;
    } else {
      throw 'Invalid play mode. Must be either "restart" or "sustain"';
    }
  };

  /**
   *  Pauses a file that is currently playing. If the file is not
   *  playing, then nothing will happen.
   *
   *  After pausing, .play() will resume from the paused
   *  position.
   *  If p5.SoundFile had been set to loop before it was paused,
   *  it will continue to loop after it is unpaused with .play().
   *
   *  @method pause
   *  @param {Number} [startTime] (optional) schedule event to occur
   *                               seconds from now
   *  @example
   *  <div><code>
   *  var soundFile;
   *  
   *  function preload() {
   *    soundFormats('ogg', 'mp3');
   *    soundFile = loadSound('../_files/Damscray_-_Dancing_Tiger_02');
   *  }
   *  function setup() {
   *    background(0, 255, 0);
   *    soundFile.loop();
   *  }
   *  function keyTyped() {
   *    if (key == 'p') {
   *      soundFile.pause();
   *      background(255, 0, 0);
   *    }
   *  }
   *  
   *  function keyReleased() {
   *    if (key == 'p') {
   *      soundFile.play();
   *      background(0, 255, 0);
   *    }
   *  </code>
   *  </div>
   */
  p5.SoundFile.prototype.pause = function(time) {
    var now = p5sound.audiocontext.currentTime;
    var time = time || 0;
    var pTime = time + now;

    if (this.isPlaying() && this.buffer && this.bufferSourceNode) {
      this.pauseTime = this.currentTime();
      this.bufferSourceNode.stop(pTime);
      this._counterNode.stop(pTime);
      this._paused = true;
      this._playing = false;

      this._pauseTime = this.currentTime();
      // TO DO: make sure play() still starts from orig start position
    } else {
      this._pauseTime = 0;
    }
  };

  /**
   * Loop the p5.SoundFile. Accepts optional parameters to set the
   * playback rate, playback volume, loopStart, loopEnd.
   *
   * @method loop
   * @param {Number} [startTime] (optional) schedule event to occur
   *                             seconds from now
   * @param {Number} [rate]        (optional) playback rate
   * @param {Number} [amp]         (optional) playback volume
   * @param {Number} [cueLoopStart](optional) startTime in seconds
   * @param {Number} [duration]  (optional) loop duration in seconds
   */
  p5.SoundFile.prototype.loop = function(startTime, rate, amp, loopStart, duration) {
    this._looping = true;
    this.play(startTime, rate, amp, loopStart, duration);
  };

  /**
   * Set a p5.SoundFile's looping flag to true or false. If the sound
   * is currently playing, this change will take effect when it
   * reaches the end of the current playback. 
   * 
   * @param {Boolean} Boolean   set looping to true or false
   */
  p5.SoundFile.prototype.setLoop = function(bool) {
    if (bool === true) {
      this._looping = true;
    }
    else if (bool === false) {
      this._looping = false;
    }
    else {
      throw 'Error: setLoop accepts either true or false';
    }
    if (this.bufferSourceNode) {
      this.bufferSourceNode.loop = this._looping;
      this._counterNode.loop = this._looping;
    }
  };

 /**
   * Returns 'true' if a p5.SoundFile is currently looping and playing, 'false' if not.
   *
   * @return {Boolean}
   */
  p5.SoundFile.prototype.isLooping = function() {
    if (!this.bufferSourceNode) {
      return false;
    }
    if (this._looping === true && this.isPlaying() === true) {
      return true;
    }
    return false;
  };

  /**
   *  Returns true if a p5.SoundFile is playing, false if not (i.e.
   *  paused or stopped).
   *
   *  @method isPlaying
   *  @return {Boolean}
   */
  p5.SoundFile.prototype.isPlaying = function() {
    return this._playing;
  };

  /**
   *  Returns true if a p5.SoundFile is paused, false if not (i.e.
   *  playing or stopped).
   *
   *  @method  isPaused
   *  @return {Boolean}
   */
  p5.SoundFile.prototype.isPaused = function() {
    return this._paused;
  };

  /**
   * Stop soundfile playback.
   *
   * @method stop
   * @param {Number} [startTime] (optional) schedule event to occur
   *                             in seconds from now
   */
  p5.SoundFile.prototype.stop = function(time) {
    if (this.mode == 'sustain') {
      this.stopAll();
      this._playing = false;
      this.pauseTime = 0;
      this._paused = false;
    }
    else if (this.buffer && this.bufferSourceNode) {
      var now = p5sound.audiocontext.currentTime;
      var t = time || 0;
      this.pauseTime = 0;
      this.bufferSourceNode.stop(now + t);

      this._counterNode.stop(now + t);
      this._playing = false;
      this._paused = false;
    }
  };

  /**
   *  Stop playback on all of this soundfile's sources.
   *  @private
   */
  p5.SoundFile.prototype.stopAll = function() {
    var now = p5sound.audiocontext.currentTime;
    if (this.buffer && this.bufferSourceNode) {
      for (var i = 0; i < this.bufferSourceNodes.length; i++){
        if (typeof(this.bufferSourceNodes[i]) != undefined){
          try {
            this.bufferSourceNodes[i].stop(now);
          } catch(e) {
            // this was throwing errors only on Safari
          }
        }
      }
    this._counterNode.stop(now);

    }
  };

  /**
   *  Multiply the output volume (amplitude) of a sound file
   *  between 0.0 (silence) and 1.0 (full volume).
   *  1.0 is the maximum amplitude of a digital sound, so multiplying
   *  by greater than 1.0 may cause digital distortion. To
   *  fade, provide a <code>rampTime</code> parameter. For more
   *  complex fades, see the Env class.
   *
   *  Alternately, you can pass in a signal source such as an
   *  oscillator to modulate the amplitude with an audio signal.
   *
   *  @method  setVolume
   *  @param {Number|Object} volume  Volume (amplitude) between 0.0
   *                                     and 1.0 or modulating signal/oscillator
   *  @param {Number} [rampTime]  Fade for t seconds
   *  @param {Number} [timeFromNow]  Schedule this event to happen at
   *                                 t seconds in the future
   */
  p5.SoundFile.prototype.setVolume = function(vol, rampTime, tFromNow){
    if (typeof(vol) === 'number') {
      var rampTime = rampTime || 0;
      var tFromNow = tFromNow || 0;
      var now = p5sound.audiocontext.currentTime;
      var currentVol = this.output.gain.value;
      this.output.gain.cancelScheduledValues(now + tFromNow);
      this.output.gain.linearRampToValueAtTime(currentVol, now + tFromNow);
      this.output.gain.linearRampToValueAtTime(vol, now + tFromNow + rampTime);
    }
    else if (vol) {
      vol.connect(this.output.gain);
    } else {
      // return the Gain Node
      return this.output.gain;
    }
  };

  // same as setVolume, to match Processing Sound
  p5.SoundFile.prototype.amp = p5.SoundFile.prototype.setVolume;

  // these are the same thing
  p5.SoundFile.prototype.fade = p5.SoundFile.prototype.setVolume;

  p5.SoundFile.prototype.getVolume = function() {
    return this.output.gain.value;
  };

  /**
   * Set the stereo panning of a p5.sound object to
   * a floating point number between -1.0 (left) and 1.0 (right).
   * Default is 0.0 (center).
   *
   * @method pan
   * @param {Number} [panValue]     Set the stereo panner
   * @param  {Number} timeFromNow schedule this event to happen
   *                                seconds from now
   * @example
   * <div><code>
   *
   *  var ball = {};
   *  var soundFile;
   *
   *  function setup() {
   *    soundFormats('ogg', 'mp3');
   *    soundFile = loadSound('assets/beatbox.mp3');
   *  }
   *  
   *  function draw() {
   *    background(0);
   *    ball.x = constrain(mouseX, 0, width);
   *    ellipse(ball.x, height/2, 20, 20)
   *  }
   *  
   *  function mousePressed(){
   *    // map the ball's x location to a panning degree 
   *    // between -1.0 (left) and 1.0 (right)
   *    var panning = map(ball.x, 0., width,-1.0, 1.0);
   *    soundFile.pan(panning);
   *    soundFile.play();
   *  }
   *  </div></code>
   */
  p5.SoundFile.prototype.pan = function(pval, tFromNow) {
    this.panPosition = pval;
    this.panner.pan(pval, tFromNow);
  };

  /**
   * Returns the current stereo pan position (-1.0 to 1.0)
   *
   * @return {Number} Returns the stereo pan setting of the Oscillator
   *                          as a number between -1.0 (left) and 1.0 (right).
   *                          0.0 is center and default.
   */
  p5.SoundFile.prototype.getPan = function() {
    return this.panPosition;
  };

  /**
   *  Set the playback rate of a sound file. Will change the speed and the pitch.
   *  Values less than zero will reverse the audio buffer.
   *
   *  @method rate
   *  @param {Number} [playbackRate]     Set the playback rate. 1.0 is normal,
   *                                     .5 is half-speed, 2.0 is twice as fast.
   *                                     Must be greater than zero.
   *  @example
   *  <div><code>
   *  var song;
   *  
   *  function preload() {
   *    song = loadSound('assets/Damscray_DancingTiger.mp3');
   *  }
   *
   *  function setup() {
   *    song.loop();
   *  }
   *
   *  function draw() {
   *    background(200);
   *    
   *    // Set the rate to a range between 0.1 and 4
   *    // Changing the rate also alters the pitch
   *    var speed = map(mouseY, 0.1, height, 0, 2);
   *    speed = constrain(speed, 0.01, 4);
   *    song.rate(speed);
   *    
   *    // Draw a circle to show what is going on
   *    stroke(0);
   *    fill(51, 100);
   *    ellipse(mouseX, 100, 48, 48);
   *  }
   *  
   * </code>
   * </div>
   *  
   */
  p5.SoundFile.prototype.rate = function(playbackRate) {
    if (this.playbackRate === playbackRate && this.bufferSourceNode) {
      if (this.bufferSourceNode.playbackRate.value === playbackRate) {
        return;
      }
    }
    this.playbackRate = playbackRate;
    var rate = playbackRate;
    if (this.playbackRate === 0 && this._playing) {
      this.pause();
    }
    if (this.playbackRate < 0 && !this.reversed) {
      var cPos = this.currentTime();
      var cRate = this.bufferSourceNode.playbackRate.value;

      // this.pause();
      this.reverseBuffer();
      rate = Math.abs(playbackRate);

      var newPos = ( cPos - this.duration() ) / rate;
      this.pauseTime = newPos;
      // this.play();
    }
    else if (this.playbackRate > 0 && this.reversed) {
      this.reverseBuffer();
    }
    if (this.bufferSourceNode){
      var now = p5sound.audiocontext.currentTime;
      this.bufferSourceNode.playbackRate.cancelScheduledValues(now);
      this.bufferSourceNode.playbackRate.linearRampToValueAtTime(Math.abs(rate), now);
      this._counterNode.playbackRate.cancelScheduledValues(now);
      this._counterNode.playbackRate.linearRampToValueAtTime(Math.abs(rate), now);

    }
  };

  p5.SoundFile.prototype.getPlaybackRate = function() {
    return this.playbackRate;
  };

  /**
   * Returns the duration of a sound file in seconds.
   *
   * @method duration
   * @return {Number} The duration of the soundFile in seconds.
   */
  p5.SoundFile.prototype.duration = function() {
    // Return Duration
    if (this.buffer) {
      return this.buffer.duration;
    } else {
      return 0;
    }
  };

  /**
   * Return the current position of the p5.SoundFile playhead, in seconds.
   * Note that if you change the playbackRate while the p5.SoundFile is
   * playing, the results may not be accurate.
   *
   * @method currentTime
   * @return {Number}   currentTime of the soundFile in seconds.
   */
  p5.SoundFile.prototype.currentTime = function() {
    // TO DO --> make reverse() flip these values appropriately
    if (this._pauseTime > 0) {
      return this._pauseTime;
    } else {
      return this._lastPos / ac.sampleRate;
    }
  };

  /**
   * Move the playhead of the song to a position, in seconds. Start
   * and Stop time. If none are given, will reset the file to play
   * entire duration from start to finish.
   *
   * @method jump
   * @param {Number} cueTime    cueTime of the soundFile in seconds.
   * @param {Number} uuration    duration in seconds.
   */
  p5.SoundFile.prototype.jump = function(cueTime, duration) {
    if (cueTime<0 || cueTime > this.buffer.duration) {
      throw 'jump time out of range';
    }
    if (duration > this.buffer.duration - cueTime) {
      throw 'end time out of range';
    }

    var cTime = cueTime || 0;
    var eTime = duration || this.buffer.duration - cueTime;

    if (this.isPlaying()){
      this.stop();
    }

    this.play(0, this.playbackRate, this.output.gain.value, cTime, eTime);
  };

  /**
    * Return the number of channels in a sound file.
    * For example, Mono = 1, Stereo = 2.
    *
    * @method channels
    * @return {Number} [channels]
    */
  p5.SoundFile.prototype.channels = function() {
    return this.buffer.numberOfChannels;
  };

  /**
    * Return the sample rate of the sound file.
    *
    * @method sampleRate
    * @return {Number} [sampleRate]
    */
  p5.SoundFile.prototype.sampleRate = function() {
    return this.buffer.sampleRate;
  };

  /**
    * Return the number of samples in a sound file.
    * Equal to sampleRate * duration.
    *
    * @method frames
    * @return {Number} [sampleCount]
    */
  p5.SoundFile.prototype.frames = function() {
    return this.buffer.length;
  };

  /**
   * Returns an array of amplitude peaks in a p5.SoundFile that can be
   * used to draw a static waveform. Scans through the p5.SoundFile's
   * audio buffer to find the greatest amplitudes. Accepts one
   * parameter, 'length', which determines size of the array.
   * Larger arrays result in more precise waveform visualizations.
   * 
   * Inspired by Wavesurfer.js.
   * 
   * @method  getPeaks
   * @params {Number} [length] length is the size of the returned array.
   *                          Larger length results in more precision.
   *                          Defaults to 5*width of the browser window.
   * @returns {Float32Array} Array of peaks.
   */
  p5.SoundFile.prototype.getPeaks = function(length) {
    if (this.buffer) {
      // set length to window's width if no length is provided
      if (!length) {
        length = window.width*5;
      }
      if (this.buffer) {
        var buffer = this.buffer;
        var sampleSize = buffer.length / length;
        var sampleStep = ~~(sampleSize / 10) || 1;
        var channels = buffer.numberOfChannels;
        var peaks = new Float32Array(Math.round(length));

        for (var c = 0; c < channels; c++) {
          var chan = buffer.getChannelData(c);
          for (var i = 0; i < length; i++) {
            var start = ~~(i*sampleSize);
            var end = ~~(start + sampleSize);
            var max = 0;
            for (var j = start; j < end; j+= sampleStep) {
              var value = chan[j];
              if (value > max) {
                max = value;
              // faster than Math.abs
              } else if (-value > max) {
                max = value;
              }
            }
            if (c === 0 || max > peaks[i]) {
              peaks[i] = max;
            }
          }
        }

        return peaks;
      }
    }
    else {
      throw 'Cannot load peaks yet, buffer is not loaded';
    }
  };

  /**
   *  Reverses the p5.SoundFile's buffer source.
   *  Playback must be handled separately (see example).
   *
   *  @method  reverseBuffer
   *  @example
   *  <div><code>
   *  var drum;
   *  
   *  function preload() {
   *    drum = loadSound('assets/drum.mp3');
   *  }
   *
   *  function setup() {
   *    drum.reverseBuffer();
   *    drum.play();
   *  }
   *  
   * </code>
   * </div>
   */
  p5.SoundFile.prototype.reverseBuffer = function() {
    var curVol = this.getVolume();
    this.setVolume(0, 0.01, 0);
    this.pause();
    if (this.buffer) {
      for (var i = 0; i < this.buffer.numberOfChannels; i++) {
        Array.prototype.reverse.call( this.buffer.getChannelData(i) );
      }
    // set reversed flag
    this.reversed = !this.reversed;
    // this.playbackRate = -this.playbackRate;
    } else {
      throw 'SoundFile is not done loading';
    }
    this.setVolume(curVol, 0.01, 0.0101);
    this.play();
  };

  // private function for onended behavior
  p5.SoundFile.prototype._onEnded = function(s) {
    s.onended = function(s){
      var now = p5sound.audiocontext.currentTime;
      s.stop(now);
    };
  };

  p5.SoundFile.prototype.add = function() {
    // TO DO
  };

  p5.SoundFile.prototype.dispose = function() {
    this.stop(now);
    if (this.buffer && this.bufferSourceNode) {
      for (var i = 0; i < this.bufferSourceNodes.length - 1; i++) {
        if (this.bufferSourceNodes[i] !== null) {
          // this.bufferSourceNodes[i].disconnect();
          this.bufferSourceNodes[i].stop(now);
          this.bufferSourceNodes[i] = null;
        }
      }
      if ( this.isPlaying() ) {
        try {
          this._counterNode.stop(now);
        } catch(e){console.log(e)}
        this._counterNode = null;
      }
    }
    if (this.output){
      this.output.disconnect();
      this.output = null;
    }
    if (this.panner) {
      this.panner.disconnect();
      this.panner = null;
    }
  };

  /**
   * Connects the output of a p5sound object to input of another
   * p5.sound object. For example, you may connect a p5.SoundFile to an
   * FFT or an Effect. If no parameter is given, it will connect to
   * the master output. Most p5sound objects connect to the master
   * output when they are created.
   *
   * @method connect
   * @param {Object} [object] Audio object that accepts an input
   */
  p5.SoundFile.prototype.connect = function(unit) {
    if (!unit) {
       this.panner.connect(p5sound.input);
    }
    else {
      if (unit.hasOwnProperty('input')){
        this.panner.connect(unit.input);
      } else {
        this.panner.connect(unit);
      }
    }
  };

  /**
   * Disconnects the output of this p5sound object.
   *
   * @method disconnect
   */
  p5.SoundFile.prototype.disconnect = function(unit){
    this.panner.disconnect(unit);
  };

  /**
   *  Read the Amplitude (volume level) of a p5.SoundFile. The
   *  p5.SoundFile class contains its own instance of the Amplitude
   *  class to help make it easy to get a SoundFile's volume level.
   *  Accepts an optional smoothing value (0.0 < 1.0).
   *  
   *  @method  getLevel
   *  @param  {Number} [smoothing] Smoothing is 0.0 by default.
   *                               Smooths values based on previous values.
   *  @return {Number}           Volume level (between 0.0 and 1.0)
   */
  p5.SoundFile.prototype.getLevel = function(smoothing) {
    if (smoothing) {
      this.amplitude.smoothing = smoothing;
    }
    return this.amplitude.getLevel();
  };

  /**
   *  Reset the source for this SoundFile to a
   *  new path (URL).
   *
   *  @method  setPath
   *  @param {String}   path     path to audio file
   *  @param {Function} callback Callback
   */
  p5.SoundFile.prototype.setPath = function(p, callback) {
    var path = p5.prototype._checkFileFormats(p);
    this.url = path;
    this.load(callback);
  };

  /**
   *  Replace the current Audio Buffer with a new Buffer.
   *  
   *  @param {Array} buf Array of Float32 Array(s). 2 Float32 Arrays
   *                     will create a stereo source. 1 will create
   *                     a mono source.
   */
  p5.SoundFile.prototype.setBuffer = function(buf){
    var newBuffer = ac.createBuffer(2, buf[0].length, ac.sampleRate);
    var numChannels = 0;
    for (var channelNum = 0; channelNum < buf.length; channelNum++){
      var channel = newBuffer.getChannelData(channelNum);
      channel.set(buf[channelNum]);
      numChannels++;
    }
    this.buffer = newBuffer;

    // set numbers of channels on input to the panner
    this.panner.inputChannels(numChannels);
  };

  //////////////////////////////////////////////////
  // script processor node with an empty buffer to help
  // keep a sample-accurate position in playback buffer.
  // Inspired by Chinmay Pendharkar's technique for Sonoport --> http://bit.ly/1HwdCsV
  // Copyright [2015] [Sonoport (Asia) Pte. Ltd.],
  // Licensed under the Apache License http://apache.org/licenses/LICENSE-2.0
  ////////////////////////////////////////////////////////////////////////////////////

  // initialize counterNode, set its initial buffer and playbackRate
  p5.SoundFile.prototype._initCounterNode = function() {
    var self = this;
    var now = ac.currentTime;

    var cNode = ac.createBufferSource();

    // dispose of scope node if it already exists
    if (self._scopeNode) {
      self._scopeNode.disconnect();
      self._scopeNode = null;
    }

    self._scopeNode = ac.createScriptProcessor( 256, 1, 1 );

    // create counter buffer of the same length as self.buffer
    cNode.buffer = _createCounterBuffer( self.buffer );

    cNode.playbackRate.setValueAtTime(self.playbackRate, now);

    cNode.connect( self._scopeNode );
    self._scopeNode.connect( p5.soundOut._silentNode );

    self._scopeNode.onaudioprocess = function(processEvent) {
      var inputBuffer = processEvent.inputBuffer.getChannelData( 0 );

      // update the lastPos
      self._lastPos = inputBuffer[ inputBuffer.length - 1 ] || 0;
    };

    return cNode;
  };

  // initialize sourceNode, set its initial buffer and playbackRate
  p5.SoundFile.prototype._initSourceNode = function() {
    var self = this;
    var now = ac.currentTime;
    var bufferSourceNode = ac.createBufferSource();
    bufferSourceNode.buffer = self.buffer;
    bufferSourceNode.playbackRate.setValueAtTime(self.playbackRate, now);
    return bufferSourceNode;
  };

  var _createCounterBuffer = function(buffer) {
    var array = new Float32Array( buffer.length );
    var audioBuf = ac.createBuffer( 1, buffer.length, 44100 );

    for ( var index = 0; index < buffer.length; index++ ) {
      array[ index ] = index;
    }

    audioBuf.getChannelData( 0 ).set( array );
    return audioBuf;
  };

});

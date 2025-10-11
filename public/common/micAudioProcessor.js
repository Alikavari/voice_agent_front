let micProc;

class MicAudioProcessor {
  constructor() {
    micProc = this;

    if (
      window.hasOwnProperty('webkitAudioContext') &&
      !window.hasOwnProperty('AudioContext')
    ) {
      window.AudioContext = webkitAudioContext;
    }

    if (
      navigator.hasOwnProperty('webkitGetUserMedia') &&
      !navigator.hasOwnProperty('getUserMedia')
    ) {
      navigator.getUserMedia = webkitGetUserMedia;
      if (!AudioContext.prototype.hasOwnProperty('createScriptProcessor')) {
        AudioContext.prototype.createScriptProcessor =
          AudioContext.prototype.createJavaScriptNode;
      }
    }

    this.audioContext = new AudioContext();

    this.browserSampleRate = this.audioContext.sampleRate; // 44100
    this.srcBufferSize = 1024;
    // with buffer size of 1024, we can capture 44032 features for original sample rate of 44100
    // once audio of 44100 features is down sampled to 16000 features,
    // resulting number of features is 15953

    this.initDownSampleNode();
    this.data = [];
  }

  getMicPermission() {
    this.permissionDeferred = $.Deferred();

    const successCallback = (micStream) => {
      console.log('✅ User allowed microphone access.');
      micProc.micSource =
        micProc.audioContext.createMediaStreamSource(micStream);
      micProc.micSource.connect(micProc.downSampleNode);
      micProc.downSampleNode.connect(micProc.audioContext.destination);
      visualizer({ parent: '#waveform', stream: micStream });

      // Chrome auto-suspends AudioContext until user gesture → resume it
      if (micProc.audioContext.state === 'suspended') {
        micProc.audioContext.resume();
      }

      micProc.permissionDeferred.resolve();
    };

    const errorCallback = (err) => {
      console.error('❌ Initializing microphone failed:', err);
      micProc.permissionDeferred.reject(err);
    };

    // ✅ modern getUserMedia path
    const constraints = { audio: true, video: false };
    console.log('🎤 Requesting microphone permission...');

    // prefer mediaDevices if available
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia(constraints)
        .then(successCallback)
        .catch(errorCallback);
    } else if (navigator.getUserMedia) {
      // legacy browsers
      navigator.getUserMedia(constraints, successCallback, errorCallback);
    } else if (navigator.webkitGetUserMedia) {
      navigator.webkitGetUserMedia(constraints, successCallback, errorCallback);
    } else {
      alert('🎙️ getUserMedia is not supported in this browser.');
      micProc.permissionDeferred.reject('unsupported');
    }

    return this.permissionDeferred.promise();
  }

  initDownSampleNode() {
    this.downSampleNode = this.audioContext.createScriptProcessor(
      this.srcBufferSize,
      1,
      1
    );
    this.downSampledBufferSize =
      (audioConfig.offlineSampleRate / this.browserSampleRate) *
      this.srcBufferSize;

    function interpolateArray(data, fitCount) {
      var linearInterpolate = function (before, after, atPoint) {
        return before + (after - before) * atPoint;
      };

      var newData = new Array();
      var springFactor = new Number((data.length - 1) / (fitCount - 1));
      newData[0] = data[0]; // for new allocation
      for (var i = 1; i < fitCount - 1; i++) {
        var tmp = i * springFactor;
        var before = new Number(Math.floor(tmp)).toFixed();
        var after = new Number(Math.ceil(tmp)).toFixed();
        var atPoint = tmp - before;
        newData[i] = linearInterpolate(data[before], data[after], atPoint);
      }
      newData[fitCount - 1] = data[data.length - 1]; // for new allocation
      return newData;
    }

    this.downSampleNode.onaudioprocess = function (audioProcessingEvent) {
      var inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
      var downSampledData = interpolateArray(
        inputData,
        micProc.downSampledBufferSize
      );
      if (micProc.data.length > audioConfig.offlineSampleRate) {
        micProc.data.splice(0, micProc.downSampledBufferSize);
      }
      micProc.data = micProc.data.concat(downSampledData);
    };
  }

  getData() {
    return this.data;
  }
}

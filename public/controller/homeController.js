let toggleTime = 1500;
let wakewordEnabled = true; // 🔹 track pause/resume state

// ✅ Listen for control events from VoiceRecorder
window.addEventListener('wakeword-control', (e) => {
  const action = e.detail;
  if (action === 'pause') {
    console.log('🛑 Wake-word detection paused by VoiceRecorder');
    wakewordEnabled = false;
  } else if (action === 'resume') {
    console.log('▶️ Wake-word detection resumed by VoiceRecorder');
    wakewordEnabled = true;
  }
});

function init_view(commands) {
  reordered = [];
  commands.forEach(function (command) {
    if (command != 'silence' && command != 'unknown') {
      reordered.push(command);
    }
  });

  let split = Math.floor(reordered.length / 2);
  for (let i = 0; i < split; i++) {
    $('#commandList1').append(
      $('<li>')
        .attr(
          'class',
          'list-group-item ' + reordered[i] + '_button text-center'
        )
        .append(reordered[i].toUpperCase())
    );
  }

  for (let i = split; i < reordered.length; i++) {
    $('#commandList2').append(
      $('<li>')
        .attr(
          'class',
          'list-group-item ' + reordered[i] + '_button text-center'
        )
        .append(reordered[i].toUpperCase())
    );
  }

  $('#commandList3').append(
    $('<li>')
      .attr('class', 'list-group-item unknown_button text-center')
      .append('unknown')
  );

  $('.unknown_button').addClass('list-group-item-dark');
}

let lastCommand;
let lastToggleTime = 0;

function toggleCommand(command) {
  lastCommand = command;
  lastToggleTime = new Date().getTime();
  $('.commandList .active').removeClass('active');
  $('.commandList .' + command + '_button').addClass('active');
}

function updateToggledCommand(command) {
  if (!wakewordEnabled) return; // 🔸 Skip everything while paused

  if (command == 'silence') command = 'unknown';
  const currentTime = new Date().getTime();

  if (command != 'unknown') {
    if (lastCommand != command) {
      $('#statusBar').text(
        'keyword spoken is ... ' + command.toUpperCase() + ' !!'
      );
      toggleCommand(command);

      try {
        window.dispatchEvent(
          new CustomEvent('keyword-detected', { detail: command })
        );
      } catch (e) {
        console.warn('keyword-detected event failed:', e);
      }
    }
  } else if (
    lastCommand != 'unknown' &&
    currentTime > lastToggleTime + toggleTime
  ) {
    $('#statusBar').text('Say one of the following keywords');
    console.log(` ${lastCommand} word triggered!`);
    toggleCommand(command);
  }
}

// ✅ Delay mic initialization slightly so browser is ready
setTimeout(() => {
  const micAudioProcessor = new MicAudioProcessor(audioConfig);
  const model = new SpeechResModel('RES8_NARROW', commands);

  micAudioProcessor
    .getMicPermission()
    .done(function () {
      console.log('🎙️ Mic initialized successfully!');
      setInterval(function () {
        // 🔸 Skip recognition while wake-word is paused
        if (!wakewordEnabled) return;

        const offlineProcessor = new OfflineAudioProcessor(
          audioConfig,
          micAudioProcessor.getData()
        );
        offlineProcessor.getMFCC().done(function (mfccData) {
          updateToggledCommand(predictKeyword(mfccData, model, commands));
        });
      }, predictionFrequency);
    })
    .fail(function (err) {
      console.error('🎙️ Mic initialization failed:', err);
      alert(
        '🎙️ Mic permission failed. Please refresh and re-allow microphone access.'
      );
    });
}, 1000);

// ✅ Initialize UI only once
init_view(commands);

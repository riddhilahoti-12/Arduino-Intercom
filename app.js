/* ==========================================================================
   SMART MULTI-ROOM INTERCOM - APPLICATION LOGIC & SIMULATION ENGINE
   PBL Review 1 - Riddhi Lahoti (2510040078) | KLH University
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // --- ROOM DATA DEFINITIONS ---
  const rooms = {
    master: { id: 'master', name: 'Master Bedroom', priority: 1, muxCode: 'S0:0 S1:0 S2:0 (Y0)', state: 'idle', dcVoltage: 0.12, talkingTimer: null },
    hall:   { id: 'hall',   name: 'Living Hall',    priority: 2, muxCode: 'S0:1 S1:0 S2:0 (Y1)', state: 'idle', dcVoltage: 0.10, talkingTimer: null },
    kitchen:{ id: 'kitchen',name: 'Kitchen',        priority: 3, muxCode: 'S0:0 S1:1 S2:0 (Y2)', state: 'idle', dcVoltage: 0.14, talkingTimer: null },
    bed2:   { id: 'bed2',   name: 'Bedroom 2',      priority: 4, muxCode: 'S0:1 S1:1 S2:0 (Y3)', state: 'idle', dcVoltage: 0.11, talkingTimer: null },
    bed3:   { id: 'bed3',   name: 'Bedroom 3',      priority: 4, muxCode: 'S0:0 S1:0 S2:1 (Y4)', state: 'idle', dcVoltage: 0.09, talkingTimer: null },
    bed4:   { id: 'bed4',   name: 'Bedroom 4',      priority: 4, muxCode: 'S0:1 S1:0 S2:1 (Y5)', state: 'idle', dcVoltage: 0.10, talkingTimer: null }
  };

  let activeTransmitter = null;
  let targetReceivers = [];
  let speechHangoverMs = 2000;
  let ambientNoiseFloor = 0.4;
  let realAudioEnabled = true;
  let autoDemoRunning = false;

  // Web Audio Context for Real Synthesis
  let audioCtx = null;
  let synthOscillator = null;

  // Canvas References
  const miniCanvases = {};
  Object.keys(rooms).forEach(rId => {
    const el = document.getElementById(`canvas-${rId}`);
    if (el) miniCanvases[rId] = el.getContext('2d');
  });

  const oscAcCtx = document.getElementById('osc-ac-canvas')?.getContext('2d');
  const oscDcCtx = document.getElementById('osc-dc-canvas')?.getContext('2d');
  const hubWireCtx = document.getElementById('hub-wiring-canvas')?.getContext('2d');

  // --- INITIALIZATION ---
  initTabNavigation();
  initControlListeners();
  startMiniWaveformLoop();
  drawHubWiringCanvas();
  startOscilloscopeLoop();

  // --- TAB NAVIGATION ---
  function initTabNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn[data-tab]');
    navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabTarget = btn.getAttribute('data-tab');
        navBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.tab-pane').forEach(pane => {
          pane.classList.remove('active');
        });
        document.getElementById(`tab-${tabTarget}`)?.classList.add('active');
      });
    });
  }

  // --- CONTROL LISTENERS ---
  function initControlListeners() {
    // Noise Slider
    const sliderNoise = document.getElementById('slider-noise');
    sliderNoise?.addEventListener('input', (e) => {
      ambientNoiseFloor = parseFloat(e.target.value);
      document.getElementById('val-noise').textContent = `${ambientNoiseFloor.toFixed(1)}V DC`;
    });

    // Hangover Slider
    const sliderHang = document.getElementById('slider-hangover');
    sliderHang?.addEventListener('input', (e) => {
      speechHangoverMs = parseInt(e.target.value);
      document.getElementById('val-hangover').textContent = `${(speechHangoverMs / 1000).toFixed(1)} sec`;
    });

    // Toggle Real Audio
    const toggleAudio = document.getElementById('toggle-real-audio');
    toggleAudio?.addEventListener('change', (e) => {
      realAudioEnabled = e.target.checked;
    });

    // Talk Buttons per Room
    Object.keys(rooms).forEach(rId => {
      const btn = document.getElementById(`btn-talk-${rId}`);
      btn?.addEventListener('click', () => {
        triggerRoomTalk(rId, 3000);
      });
    });

    // Scenario Buttons
    document.getElementById('scen-kitchen-bed2')?.addEventListener('click', runScenarioKitchenToBed2);
    document.getElementById('scen-master-override')?.addEventListener('click', runScenarioMasterOverride);
    document.getElementById('scen-emergency-all')?.addEventListener('click', runScenarioEmergencyBroadcast);
    document.getElementById('scen-reset')?.addEventListener('click', resetAllRooms);

    // Auto Demo Mode Button
    document.getElementById('btn-demo-mode')?.addEventListener('click', startAutoDemoMode);

    // Osc Controls
    document.getElementById('osc-btn-voice')?.addEventListener('click', () => {
      if (!activeTransmitter) triggerRoomTalk('kitchen', 3000);
    });
    document.getElementById('osc-btn-clear')?.addEventListener('click', resetAllRooms);
  }

  // --- CORE PRIORITY MATRIX RESOLVER ---
  function triggerRoomTalk(roomId, durationMs = 3000) {
    initWebAudio();
    const candidate = rooms[roomId];
    if (!candidate) return;

    // Check Priority against currently active transmitter
    if (activeTransmitter && activeTransmitter.id !== roomId) {
      if (candidate.priority < activeTransmitter.priority) {
        // Candidate HAS HIGHER PRIORITY (Lower number = Higher Priority) -> OVERRIDE!
        console.log(`[PRIORITY OVERRIDE] ${candidate.name} (Prio ${candidate.priority}) overrides ${activeTransmitter.name} (Prio ${activeTransmitter.priority})`);
        
        // Mark previous active as OVERRIDDEN
        rooms[activeTransmitter.id].state = 'overridden';
        updateRoomUI(activeTransmitter.id);
        
        playChimeSound(880); // High override chime
      } else {
        // Candidate HAS LOWER OR EQUAL PRIORITY -> REJECTED / MUTED!
        console.log(`[PRIORITY REJECTED] ${candidate.name} (Prio ${candidate.priority}) blocked by ${activeTransmitter.name}`);
        rooms[roomId].state = 'muted';
        updateRoomUI(roomId);
        return;
      }
    }

    // Set new active transmitter
    activeTransmitter = candidate;
    candidate.state = 'talking';
    candidate.dcVoltage = 3.8 + (Math.random() * 0.6); // Speech DC voltage 3.8V-4.4V DC

    // Clear existing timer if any
    if (candidate.talkingTimer) clearTimeout(candidate.talkingTimer);

    // Determine target receivers
    if (roomId === 'master') {
      // Master broadcasts to ALL other rooms
      targetReceivers = Object.keys(rooms).filter(id => id !== 'master');
    } else {
      // Standard call targets remaining rooms or default bed2
      targetReceivers = Object.keys(rooms).filter(id => id !== roomId);
    }

    // Update receiver room states
    targetReceivers.forEach(rId => {
      if (rooms[rId].state !== 'overridden') {
        rooms[rId].state = 'listening';
      }
      updateRoomUI(rId);
    });

    updateRoomUI(roomId);
    updateHubDiagnostics();
    playSpeechSynthAudio();

    // Set Speech Hangover Timer
    candidate.talkingTimer = setTimeout(() => {
      endRoomTalk(roomId);
    }, durationMs);
  }

  function endRoomTalk(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.state = 'idle';
    room.dcVoltage = ambientNoiseFloor;
    updateRoomUI(roomId);

    if (activeTransmitter && activeTransmitter.id === roomId) {
      activeTransmitter = null;
      targetReceivers.forEach(rId => {
        rooms[rId].state = 'idle';
        updateRoomUI(rId);
      });
      targetReceivers = [];
      updateHubDiagnostics();
      stopSpeechSynthAudio();
    }
  }

  function resetAllRooms() {
    Object.keys(rooms).forEach(rId => {
      if (rooms[rId].talkingTimer) clearTimeout(rooms[rId].talkingTimer);
      rooms[rId].state = 'idle';
      rooms[rId].dcVoltage = ambientNoiseFloor;
      updateRoomUI(rId);
    });
    activeTransmitter = null;
    targetReceivers = [];
    updateHubDiagnostics();
    stopSpeechSynthAudio();
  }

  // --- UI UPDATE HELPERS ---
  function updateRoomUI(roomId) {
    const room = rooms[roomId];
    const card = document.getElementById(`room-${roomId}`);
    const statusBadge = document.getElementById(`status-${roomId}`);
    const dcMeter = document.getElementById(`dc-${roomId}`);

    if (!card || !statusBadge || !dcMeter) return;

    // Reset classes
    card.classList.remove('talking-active', 'receiving-active', 'overridden');
    statusBadge.className = 'room-status-badge';

    dcMeter.textContent = `${room.dcVoltage.toFixed(2)}V DC`;

    if (room.state === 'talking') {
      card.classList.add('talking-active');
      statusBadge.classList.add('talking');
      statusBadge.textContent = '🎙️ TRANSMITTING';
    } else if (room.state === 'listening') {
      card.classList.add('receiving-active');
      statusBadge.classList.add('listening');
      statusBadge.textContent = '🔊 RECEIVING AUDIO';
    } else if (room.state === 'overridden') {
      card.classList.add('overridden');
      statusBadge.classList.add('muted');
      statusBadge.textContent = '⚠️ OVERRIDDEN BY PRIO 1';
    } else {
      statusBadge.classList.add('idle');
      statusBadge.textContent = 'IDLE';
    }
  }

  function updateHubDiagnostics() {
    const elActive = document.getElementById('hub-active-channel');
    const elPriority = document.getElementById('hub-priority-level');
    const elMux = document.getElementById('hub-mux-pins');
    const elMaxDc = document.getElementById('hub-max-dc');

    if (!activeTransmitter) {
      if (elActive) elActive.textContent = 'IDLE';
      if (elPriority) elPriority.textContent = 'NONE';
      if (elMux) elMux.textContent = 'S0:0 S1:0 S2:0 (INH:1 - Muted)';
      if (elMaxDc) elMaxDc.textContent = `${ambientNoiseFloor.toFixed(2)} V`;
    } else {
      if (elActive) elActive.textContent = `${activeTransmitter.name.toUpperCase()} (Y${activeTransmitter.priority - 1})`;
      if (elPriority) elPriority.textContent = `PRIORITY ${activeTransmitter.priority}`;
      if (elMux) elMux.textContent = `${activeTransmitter.muxCode} (INH:0 - Active)`;
      if (elMaxDc) elMaxDc.textContent = `${activeTransmitter.dcVoltage.toFixed(2)} V DC`;
    }

    drawHubWiringCanvas();
  }

  // --- SCENARIOS ---
  function runScenarioKitchenToBed2() {
    resetAllRooms();
    setTimeout(() => {
      triggerRoomTalk('kitchen', 4000);
    }, 200);
  }

  function runScenarioMasterOverride() {
    resetAllRooms();
    // Step 1: Kitchen starts speaking (Priority 3)
    triggerRoomTalk('kitchen', 6000);

    // Step 2: 1.2 seconds later, Master Bedroom speaks (Priority 1) -> OVERRIDE!
    setTimeout(() => {
      triggerRoomTalk('master', 4000);
    }, 1200);
  }

  function runScenarioEmergencyBroadcast() {
    resetAllRooms();
    triggerRoomTalk('master', 5000);
  }

  function startAutoDemoMode() {
    if (autoDemoRunning) return;
    autoDemoRunning = true;

    // Switch to simulator tab
    document.querySelector('.nav-btn[data-tab="simulator"]')?.click();

    runScenarioKitchenToBed2();

    setTimeout(() => {
      runScenarioMasterOverride();
    }, 5000);

    setTimeout(() => {
      resetAllRooms();
      autoDemoRunning = false;
    }, 11000);
  }

  // --- CANVAS ANIMATIONS & OSCILLOSCOPE ---
  let wavePhase = 0;

  function startMiniWaveformLoop() {
    function animate() {
      wavePhase += 0.15;
      Object.keys(rooms).forEach(rId => {
        const ctx = miniCanvases[rId];
        if (!ctx) return;
        const room = rooms[rId];
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;

        ctx.clearRect(0, 0, w, h);
        ctx.beginPath();
        ctx.lineWidth = 1.5;

        if (room.state === 'talking' || room.state === 'listening') {
          ctx.strokeStyle = room.state === 'talking' ? '#10b981' : '#38bdf8';
          const amp = room.state === 'talking' ? 14 : 8;
          for (let x = 0; x < w; x++) {
            const y = (h / 2) + Math.sin(x * 0.1 + wavePhase) * amp * Math.cos(x * 0.03);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          for (let x = 0; x < w; x++) {
            const y = (h / 2) + (Math.random() - 0.5) * 2;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      });
      requestAnimationFrame(animate);
    }
    animate();
  }

  function startOscilloscopeLoop() {
    let oscPhase = 0;
    function animateOsc() {
      oscPhase += 0.2;

      // Channel A: AC Audio Waveform
      if (oscAcCtx) {
        const w = oscAcCtx.canvas.width;
        const h = oscAcCtx.canvas.height;
        oscAcCtx.clearRect(0, 0, w, h);

        oscAcCtx.beginPath();
        oscAcCtx.lineWidth = 2;
        oscAcCtx.strokeStyle = '#38bdf8';

        const isTalking = activeTransmitter !== null;
        const amp = isTalking ? 60 : 6;

        for (let x = 0; x < w; x++) {
          const speechMod = Math.sin(x * 0.02) * Math.sin(x * 0.08 + oscPhase);
          const y = (h / 2) + speechMod * amp;
          if (x === 0) oscAcCtx.moveTo(x, y);
          else oscAcCtx.lineTo(x, y);
        }
        oscAcCtx.stroke();
      }

      // Channel B: Rectified DC Envelope Voltage Signal
      if (oscDcCtx) {
        const w = oscDcCtx.canvas.width;
        const h = oscDcCtx.canvas.height;
        oscDcCtx.clearRect(0, 0, w, h);

        oscDcCtx.beginPath();
        oscDcCtx.lineWidth = 2.5;
        oscDcCtx.strokeStyle = '#f59e0b';

        const dcVal = activeTransmitter ? activeTransmitter.dcVoltage : ambientNoiseFloor;
        // Map 0V - 5V to canvas Y (h - 10 to 10)
        const targetY = h - 20 - ((dcVal / 5.0) * (h - 40));

        for (let x = 0; x < w; x++) {
          const ripple = activeTransmitter ? (Math.random() - 0.5) * 3 : (Math.random() - 0.5) * 1.5;
          const y = targetY + ripple;
          if (x === 0) oscDcCtx.moveTo(x, y);
          else oscDcCtx.lineTo(x, y);
        }
        oscDcCtx.stroke();

        // Draw 2.5V Threshold reference line
        oscDcCtx.beginPath();
        oscDcCtx.lineWidth = 1;
        oscDcCtx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        oscDcCtx.setLineDash([4, 4]);
        const threshY = h - 20 - ((2.5 / 5.0) * (h - 40));
        oscDcCtx.moveTo(0, threshY);
        oscDcCtx.lineTo(w, threshY);
        oscDcCtx.stroke();
        oscDcCtx.setLineDash([]);
      }

      requestAnimationFrame(animateOsc);
    }
    animateOsc();
  }

  function drawHubWiringCanvas() {
    if (!hubWireCtx) return;
    const canvas = hubWireCtx.canvas;
    const w = canvas.width;
    const h = canvas.height;

    hubWireCtx.clearRect(0, 0, w, h);

    // Draw Central CD4051 Mux Chip Box
    const chipX = w / 2 - 80;
    const chipY = 20;
    const chipW = 160;
    const chipH = 80;

    hubWireCtx.fillStyle = '#0f172a';
    hubWireCtx.strokeStyle = '#38bdf8';
    hubWireCtx.lineWidth = 2;
    hubWireCtx.fillRect(chipX, chipY, chipW, chipH);
    hubWireCtx.strokeRect(chipX, chipY, chipW, chipH);

    hubWireCtx.fillStyle = '#f3f4f6';
    hubWireCtx.font = 'bold 12px "Outfit", sans-serif';
    hubWireCtx.textAlign = 'center';
    hubWireCtx.fillText('CD4051BE ANALOG MUX', w / 2, chipY + 35);
    hubWireCtx.font = '10px "JetBrains Mono", monospace';
    hubWireCtx.fillStyle = activeTransmitter ? '#10b981' : '#6b7280';
    hubWireCtx.fillText(activeTransmitter ? `ACTIVE: ${activeTransmitter.name}` : 'CHANNEL MUTE (INH:1)', w / 2, chipY + 55);

    // Draw Animated Bus Line
    if (activeTransmitter) {
      hubWireCtx.beginPath();
      hubWireCtx.strokeStyle = '#10b981';
      hubWireCtx.lineWidth = 3;
      hubWireCtx.moveTo(40, chipY + 40);
      hubWireCtx.lineTo(chipX, chipY + 40);
      hubWireCtx.moveTo(chipX + chipW, chipY + 40);
      hubWireCtx.lineTo(w - 40, chipY + 40);
      hubWireCtx.stroke();
    }
  }

  // --- WEB AUDIO API SYNTHESIZER ---
  function initWebAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playSpeechSynthAudio() {
    if (!realAudioEnabled || !audioCtx) return;
    stopSpeechSynthAudio();

    try {
      synthOscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      synthOscillator.type = 'sawtooth';
      synthOscillator.frequency.setValueAtTime(activeTransmitter?.priority === 1 ? 440 : 320, audioCtx.currentTime);

      gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);

      synthOscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      synthOscillator.start();
    } catch (e) {
      console.warn('Audio synth error:', e);
    }
  }

  function stopSpeechSynthAudio() {
    if (synthOscillator) {
      try { synthOscillator.stop(); } catch (e) {}
      synthOscillator = null;
    }
  }

  function playChimeSound(freq = 660) {
    if (!realAudioEnabled || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {}
  }

});

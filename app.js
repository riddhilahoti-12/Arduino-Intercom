/* ==========================================================================
   SMART MULTI-ROOM INTERCOM - 3D REAL-LIFE CINEMATIC EXPERIENCE ENGINE
   PBL Review 1 - Riddhi Lahoti (2510040078) | KLH University
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // --- GLOBAL VARIABLES & STATE ---
  let wavePhase = 0;
  let particlePhase = 0;
  let cameraMode = 'iso'; // 'iso', 'top', 'zoom'
  let nightMode = true;
  let showConduits = true;
  let activeTransmitter = null;
  let targetReceivers = [];
  let speechHangoverMs = 2000;
  let ambientNoiseFloor = 0.4;
  let realAudioEnabled = true;
  let autoVideoMode = false;
  let videoStep = 0;

  // Web Audio Synthesis Context
  let audioCtx = null;
  let synthOscillator = null;

  // 3D Canvas Reference
  const mainCanvas = document.getElementById('house-3d-canvas');
  const ctx3d = mainCanvas?.getContext('2d');

  const pipSpectrumCanvas = document.getElementById('pip-spectrum-canvas');
  const pipSpectrumCtx = pipSpectrumCanvas?.getContext('2d');

  const oscAcCtx = document.getElementById('osc-ac-canvas')?.getContext('2d');
  const oscDcCtx = document.getElementById('osc-dc-canvas')?.getContext('2d');

  // --- ROOM DEFINITIONS WITH 3D COORDINATES & INTERIOR ASSETS ---
  const rooms = {
    master: {
      id: 'master', name: 'Master Bedroom', priority: 1, muxCode: 'S0:0 S1:0 S2:0 (Y0)', state: 'idle', dcVoltage: 0.12, talkingTimer: null,
      x: 100, y: 80, w: 320, h: 220, color: '#a855f7',
      furniture: 'king-bed', micPos: { x: 390, y: 120 }, spkPos: { x: 390, y: 240 }
    },
    hall: {
      id: 'hall', name: 'Living Hall', priority: 2, muxCode: 'S0:1 S1:0 S2:0 (Y1)', state: 'idle', dcVoltage: 0.10, talkingTimer: null,
      x: 450, y: 80, w: 340, h: 220, color: '#38bdf8',
      furniture: 'living-sofa', micPos: { x: 470, y: 120 }, spkPos: { x: 760, y: 240 }
    },
    kitchen: {
      id: 'kitchen', name: 'Kitchen', priority: 3, muxCode: 'S0:0 S1:1 S2:0 (Y2)', state: 'idle', dcVoltage: 0.14, talkingTimer: null,
      x: 820, y: 80, w: 230, h: 220, color: '#f59e0b',
      furniture: 'kitchen-counter', micPos: { x: 840, y: 120 }, spkPos: { x: 1020, y: 240 }
    },
    bed2: {
      id: 'bed2', name: 'Bedroom 2', priority: 4, muxCode: 'S0:1 S1:1 S2:0 (Y3)', state: 'idle', dcVoltage: 0.11, talkingTimer: null,
      x: 100, y: 340, w: 300, h: 240, color: '#10b981',
      furniture: 'twin-bed', micPos: { x: 370, y: 380 }, spkPos: { x: 370, y: 540 }
    },
    bed3: {
      id: 'bed3', name: 'Bedroom 3', priority: 4, muxCode: 'S0:0 S1:0 S2:1 (Y4)', state: 'idle', dcVoltage: 0.09, talkingTimer: null,
      x: 430, y: 340, w: 320, h: 240, color: '#10b981',
      furniture: 'cozy-bed', micPos: { x: 450, y: 380 }, spkPos: { x: 720, y: 540 }
    },
    bed4: {
      id: 'bed4', name: 'Bedroom 4', priority: 4, muxCode: 'S0:1 S1:0 S2:1 (Y5)', state: 'idle', dcVoltage: 0.10, talkingTimer: null,
      x: 780, y: 340, w: 270, h: 240, color: '#10b981',
      furniture: 'modern-bed', micPos: { x: 800, y: 380 }, spkPos: { x: 1020, y: 540 }
    }
  };

  // Central Arduino Matrix Hub position
  const hubPos = { x: 575, y: 310 };

  // Particles array for signal flows
  let signalParticles = [];

  // --- INITIALIZATION ---
  initTabNavigation();
  initControlListeners();
  startMaster3DRenderLoop();
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
    // Camera Modes
    document.getElementById('cam-iso')?.addEventListener('click', (e) => setCamMode('iso', e.currentTarget));
    document.getElementById('cam-top')?.addEventListener('click', (e) => setCamMode('top', e.currentTarget));
    document.getElementById('cam-zoom')?.addEventListener('click', (e) => setCamMode('zoom', e.currentTarget));

    // Night Mode
    document.getElementById('toggle-night-mode')?.addEventListener('change', (e) => {
      nightMode = e.target.checked;
    });

    // Conduits Toggle
    document.getElementById('toggle-conduits')?.addEventListener('change', (e) => {
      showConduits = e.target.checked;
    });

    // Audio Toggle
    document.getElementById('toggle-real-audio')?.addEventListener('change', (e) => {
      realAudioEnabled = e.target.checked;
    });

    // Hangover Slider
    document.getElementById('slider-hangover')?.addEventListener('input', (e) => {
      speechHangoverMs = parseInt(e.target.value);
      document.getElementById('val-hangover').textContent = `${(speechHangoverMs / 1000).toFixed(1)} sec`;
    });

    // Room Triggers
    Object.keys(rooms).forEach(rId => {
      document.getElementById(`trig-${rId}`)?.addEventListener('click', () => {
        triggerRoomTalk(rId, 3500);
      });
    });

    // Scenario Buttons
    document.getElementById('scen-kitchen-bed2')?.addEventListener('click', runScenarioKitchenToBed2);
    document.getElementById('scen-master-override')?.addEventListener('click', runScenarioMasterOverride);
    document.getElementById('scen-emergency-all')?.addEventListener('click', runScenarioEmergencyBroadcast);
    document.getElementById('scen-reset')?.addEventListener('click', resetAllRooms);

    // Video Mode Button
    document.getElementById('btn-video-mode')?.addEventListener('click', startCinematicVideoWalkthrough);

    // PIP Close
    document.getElementById('pip-close')?.addEventListener('click', () => {
      document.getElementById('pip-camera')?.classList.remove('active');
    });

    // Osc Controls
    document.getElementById('osc-btn-voice')?.addEventListener('click', () => {
      if (!activeTransmitter) triggerRoomTalk('kitchen', 3500);
    });
    document.getElementById('osc-btn-clear')?.addEventListener('click', resetAllRooms);
  }

  function setCamMode(mode, targetBtn) {
    cameraMode = mode;
    document.querySelectorAll('.btn-cam').forEach(b => b.classList.remove('active'));
    targetBtn?.classList.add('active');
  }

  // --- CORE PRIORITY MATRIX RESOLVER ---
  function triggerRoomTalk(roomId, durationMs = 3500) {
    initWebAudio();
    const candidate = rooms[roomId];
    if (!candidate) return;

    // Check Priority against active transmitter
    if (activeTransmitter && activeTransmitter.id !== roomId) {
      if (candidate.priority < activeTransmitter.priority) {
        // Candidate HAS HIGHER PRIORITY (Lower number = Higher Priority) -> OVERRIDE!
        console.log(`[PRIORITY OVERRIDE] ${candidate.name} (Prio ${candidate.priority}) overrides ${activeTransmitter.name}`);
        rooms[activeTransmitter.id].state = 'overridden';
        playChimeSound(880);
      } else {
        // Candidate HAS LOWER OR EQUAL PRIORITY -> REJECTED / MUTED!
        console.log(`[PRIORITY REJECTED] ${candidate.name} blocked by ${activeTransmitter.name}`);
        rooms[roomId].state = 'muted';
        return;
      }
    }

    // Set new active transmitter
    activeTransmitter = candidate;
    candidate.state = 'talking';
    candidate.dcVoltage = 3.85 + (Math.random() * 0.5); // Speech DC voltage 3.85V-4.35V DC

    if (candidate.talkingTimer) clearTimeout(candidate.talkingTimer);

    // Target receivers
    if (roomId === 'master') {
      targetReceivers = Object.keys(rooms).filter(id => id !== 'master');
    } else {
      targetReceivers = Object.keys(rooms).filter(id => id !== roomId);
    }

    targetReceivers.forEach(rId => {
      if (rooms[rId].state !== 'overridden') {
        rooms[rId].state = 'listening';
      }
    });

    // Spawn Particles from Transmitter -> Hub -> Receivers
    spawnSignalParticles(candidate, targetReceivers);

    updateTelemetryHeader();
    updatePIPCameraHUD(candidate);
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

    if (activeTransmitter && activeTransmitter.id === roomId) {
      activeTransmitter = null;
      targetReceivers.forEach(rId => {
        rooms[rId].state = 'idle';
      });
      targetReceivers = [];
      updateTelemetryHeader();
      stopSpeechSynthAudio();
      document.getElementById('pip-camera')?.classList.remove('active');
    }
  }

  function resetAllRooms() {
    Object.keys(rooms).forEach(rId => {
      if (rooms[rId].talkingTimer) clearTimeout(rooms[rId].talkingTimer);
      rooms[rId].state = 'idle';
      rooms[rId].dcVoltage = ambientNoiseFloor;
    });
    activeTransmitter = null;
    targetReceivers = [];
    signalParticles = [];
    updateTelemetryHeader();
    stopSpeechSynthAudio();
    document.getElementById('pip-camera')?.classList.remove('active');
    document.getElementById('video-banner')?.classList.remove('active');
  }

  function updateTelemetryHeader() {
    const elActive = document.getElementById('tele-active-channel');
    const elMaxDc = document.getElementById('tele-max-dc');
    const elMux = document.getElementById('tele-mux-pins');
    const elPriority = document.getElementById('tele-priority-status');

    if (!activeTransmitter) {
      if (elActive) { elActive.textContent = 'IDLE / STANDBY'; elActive.className = 't-value'; }
      if (elMaxDc) elMaxDc.textContent = `${ambientNoiseFloor.toFixed(2)} V DC`;
      if (elMux) elMux.textContent = 'S0:0 S1:0 S2:0 (INH:1)';
      if (elPriority) { elPriority.textContent = 'NO CONFLICT'; elPriority.className = 't-value'; }
    } else {
      if (elActive) {
        elActive.textContent = `${activeTransmitter.name.toUpperCase()}`;
        elActive.className = 't-value highlight-green';
      }
      if (elMaxDc) elMaxDc.textContent = `${activeTransmitter.dcVoltage.toFixed(2)} V DC`;
      if (elMux) elMux.textContent = `${activeTransmitter.muxCode}`;
      if (elPriority) {
        if (activeTransmitter.priority === 1) {
          elPriority.textContent = 'PRIORITY 1 OVERRIDE';
          elPriority.className = 't-value style-danger';
        } else {
          elPriority.textContent = `PRIORITY ${activeTransmitter.priority} ACTIVE`;
          elPriority.className = 't-value highlight-amber';
        }
      }
    }
  }

  function updatePIPCameraHUD(room) {
    const pip = document.getElementById('pip-camera');
    const title = document.getElementById('pip-title');
    const status = document.getElementById('pip-status');
    const acRead = document.getElementById('pip-ac');
    const dcRead = document.getElementById('pip-dc');

    if (!pip || !room) return;

    pip.classList.add('active');
    if (title) title.innerHTML = `<i class="fa-solid fa-camera"></i> LIVE ROOM FEED: ${room.name.toUpperCase()}`;
    if (status) {
      status.textContent = '🎙️ TRANSMITTING VOICE';
      status.className = 'pip-status-badge';
    }
    if (acRead) acRead.textContent = '2.45 V AC';
    if (dcRead) dcRead.textContent = `${room.dcVoltage.toFixed(2)} V DC`;
  }

  // --- SIGNAL PARTICLES ---
  function spawnSignalParticles(transmitter, receivers) {
    signalParticles = [];
    const tPos = transmitter.micPos;

    // Particles from Mic to Hub
    for (let i = 0; i < 15; i++) {
      signalParticles.push({
        sx: tPos.x, sy: tPos.y,
        tx: hubPos.x, ty: hubPos.y,
        progress: Math.random(),
        speed: 0.015 + Math.random() * 0.01,
        color: transmitter.color,
        size: 3 + Math.random() * 3
      });
    }

    // Particles from Hub to Receiver Speakers
    receivers.forEach(rId => {
      const rec = rooms[rId];
      if (!rec) return;
      for (let i = 0; i < 12; i++) {
        signalParticles.push({
          sx: hubPos.x, sy: hubPos.y,
          tx: rec.spkPos.x, ty: rec.spkPos.y,
          progress: Math.random(),
          speed: 0.015 + Math.random() * 0.01,
          color: rec.color,
          size: 2.5 + Math.random() * 2.5
        });
      }
    });
  }

  // --- SCENARIOS ---
  function runScenarioKitchenToBed2() {
    resetAllRooms();
    setTimeout(() => { triggerRoomTalk('kitchen', 4500); }, 200);
  }

  function runScenarioMasterOverride() {
    resetAllRooms();
    triggerRoomTalk('kitchen', 7000);
    setTimeout(() => { triggerRoomTalk('master', 4500); }, 1500);
  }

  function runScenarioEmergencyBroadcast() {
    resetAllRooms();
    triggerRoomTalk('master', 5000);
  }

  // --- CINEMATIC VIDEO WALKTHROUGH MODE ---
  function startCinematicVideoWalkthrough() {
    if (autoVideoMode) return;
    autoVideoMode = true;
    videoStep = 0;

    document.querySelector('.nav-btn[data-tab="simulator"]')?.click();
    const banner = document.getElementById('video-banner');
    const vbTitle = document.getElementById('vb-title');
    const vbDesc = document.getElementById('vb-desc');
    const vbFill = document.getElementById('vb-fill');

    if (banner) banner.classList.add('active');

    // Step 1: Camera Focus on Kitchen Call
    vbTitle.textContent = "CINEMATIC WALKTHROUGH: SCENE 1 / 3";
    vbDesc.textContent = "Kitchen initiates voice intercom call to Bedroom 2 (Priority 3). Voice converts to 3.92V DC signal...";
    if (vbFill) vbFill.style.width = "30%";

    setCamMode('zoom', document.getElementById('cam-zoom'));
    runScenarioKitchenToBed2();

    // Step 2: Emergency Override
    setTimeout(() => {
      vbTitle.textContent = "CINEMATIC WALKTHROUGH: SCENE 2 / 3";
      vbDesc.textContent = "Master Bedroom interrupts with Priority 1 Emergency Override! Kitchen is muted instantly.";
      if (vbFill) vbFill.style.width = "70%";

      triggerRoomTalk('master', 4500);
    }, 4500);

    // Step 3: Wrap up
    setTimeout(() => {
      vbTitle.textContent = "CINEMATIC WALKTHROUGH: COMPLETE";
      vbDesc.textContent = "Audio hold-timer expires. Channel returns to idle standby mode.";
      if (vbFill) vbFill.style.width = "100%";
      setCamMode('iso', document.getElementById('cam-iso'));
    }, 9000);

    setTimeout(() => {
      resetAllRooms();
      autoVideoMode = false;
      if (banner) banner.classList.remove('active');
    }, 12000);
  }

  // --- MASTER 3D RENDERING LOOP ---
  function startMaster3DRenderLoop() {
    function render() {
      wavePhase += 0.12;
      particlePhase += 0.05;

      if (ctx3d && mainCanvas) {
        draw3DScene(ctx3d, mainCanvas.width, mainCanvas.height);
      }

      if (pipSpectrumCtx && pipSpectrumCanvas) {
        drawPIPSpectrum(pipSpectrumCtx, pipSpectrumCanvas.width, pipSpectrumCanvas.height);
      }

      requestAnimationFrame(render);
    }
    render();
  }

  function draw3DScene(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);

    // Apply Camera Perspective Offset
    ctx.save();
    if (cameraMode === 'iso') {
      ctx.translate(width / 2, height / 2 - 20);
      ctx.scale(0.95, 0.75);
      ctx.rotate(-0.06);
      ctx.translate(-width / 2, -height / 2);
    } else if (cameraMode === 'zoom' && activeTransmitter) {
      const t = activeTransmitter;
      ctx.translate(width / 2 - (t.x + t.w / 2), height / 2 - (t.y + t.h / 2));
      ctx.scale(1.2, 1.2);
    }

    // 1. Draw 3D House Base Floor Grid
    ctx.fillStyle = nightMode ? '#070c1a' : '#0f172a';
    ctx.fillRect(50, 40, 1050, 580);

    // Floor Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 50; x <= 1100; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, 620); ctx.stroke();
    }
    for (let y = 40; y <= 620; y += 40) {
      ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(1100, y); ctx.stroke();
    }

    // 2. Draw Animated Conduit Wall Cables
    if (showConduits) {
      Object.keys(rooms).forEach(rId => {
        const room = rooms[rId];
        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = room.state === 'talking' ? room.color : (room.state === 'listening' ? '#38bdf8' : 'rgba(255,255,255,0.08)');
        ctx.moveTo(room.micPos.x, room.micPos.y);
        ctx.lineTo(hubPos.x, hubPos.y);
        ctx.stroke();
      });
    }

    // 3. Draw Individual 3D Rooms
    Object.keys(rooms).forEach(rId => {
      drawRoom3D(ctx, rooms[rId]);
    });

    // 4. Draw Central Arduino Matrix Hub
    drawCentralHub3D(ctx, hubPos.x, hubPos.y);

    // 5. Draw Animated Signal Particles
    signalParticles.forEach(p => {
      p.progress += p.speed;
      if (p.progress > 1) p.progress = 0;

      const px = p.sx + (p.tx - p.sx) * p.progress;
      const py = p.sy + (p.ty - p.sy) * p.progress;

      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    ctx.restore();
  }

  function drawRoom3D(ctx, room) {
    const { x, y, w, h, name, priority, color, state, dcVoltage, furniture } = room;

    // Room Floor Texture
    ctx.fillStyle = state === 'talking' ? 'rgba(16, 185, 129, 0.12)' : (state === 'listening' ? 'rgba(56, 189, 248, 0.12)' : (state === 'overridden' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(15, 23, 42, 0.8)'));
    ctx.fillRect(x, y, w, h);

    // Room 3D Wall Boundaries
    ctx.lineWidth = state === 'talking' ? 3 : 2;
    ctx.strokeStyle = state === 'talking' ? '#10b981' : (state === 'listening' ? '#38bdf8' : (state === 'overridden' ? '#ef4444' : 'rgba(255, 255, 255, 0.12)'));
    ctx.strokeRect(x, y, w, h);

    // Room Header & Badge
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(x + 8, y + 8, w - 16, 26);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px "Outfit", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(name, x + 16, y + 25);

    ctx.fillStyle = color;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`PRIO ${priority}`, x + w - 16, y + 25);

    // Furniture Graphic Representations
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    if (furniture === 'king-bed' || furniture === 'twin-bed' || furniture === 'cozy-bed' || furniture === 'modern-bed') {
      ctx.strokeRect(x + 30, y + 50, 100, 130);
      ctx.fillRect(x + 35, y + 55, 40, 25);
      ctx.fillRect(x + 85, y + 55, 40, 25);
    } else if (furniture === 'living-sofa') {
      ctx.strokeRect(x + 30, y + 60, 160, 50);
      ctx.strokeRect(x + 80, y + 130, 80, 40);
    } else if (furniture === 'kitchen-counter') {
      ctx.fillRect(x + 20, y + 50, 160, 30);
      ctx.strokeRect(x + 40, y + 110, 100, 40);
    }

    // Hardware Wall Box (Mic + VAD Meter + LM386 + Speaker)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.strokeStyle = state === 'talking' ? '#10b981' : 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(room.micPos.x - 15, room.micPos.y - 15, 30, 30);
    ctx.strokeRect(room.micPos.x - 15, room.micPos.y - 15, 30, 30);

    // Mic Icon
    ctx.fillStyle = state === 'talking' ? '#10b981' : '#38bdf8';
    ctx.font = '12px "Font Awesome 6 Free"';
    ctx.textAlign = 'center';
    ctx.fillText('\uf130', room.micPos.x, room.micPos.y + 4);

    // DC Voltage Meter Tag
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText(`${dcVoltage.toFixed(2)}V DC`, x + w / 2, y + h - 14);

    // Animated Sound Ripples if Active
    if (state === 'talking' || state === 'listening') {
      ctx.beginPath();
      ctx.arc(room.spkPos.x, room.spkPos.y, 15 + Math.sin(wavePhase * 2) * 8, 0, Math.PI * 2);
      ctx.strokeStyle = state === 'talking' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawCentralHub3D(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = activeTransmitter ? '#10b981' : '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = activeTransmitter ? '#10b981' : '#38bdf8';
    ctx.shadowBlur = 15;

    ctx.fillRect(x - 60, y - 35, 120, 70);
    ctx.strokeRect(x - 60, y - 35, 120, 70);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ARDUINO MATRIX', x, y - 10);

    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillStyle = activeTransmitter ? '#10b981' : '#94a3b8';
    ctx.fillText(activeTransmitter ? `ACTIVE: ${activeTransmitter.name.substring(0, 10)}` : 'CD4051 MUX IDLE', x, y + 10);
    ctx.restore();
  }

  function drawPIPSpectrum(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);
    const bars = 24;
    const barWidth = width / bars;

    for (let i = 0; i < bars; i++) {
      const isTalking = activeTransmitter !== null;
      const h = isTalking ? (Math.sin(i * 0.4 + wavePhase) * 0.5 + 0.5) * height * 0.8 : (Math.random() * 6);
      ctx.fillStyle = isTalking ? (i % 2 === 0 ? '#38bdf8' : '#10b981') : '#334155';
      ctx.fillRect(i * barWidth, height - h, barWidth - 2, h);
    }
  }

  // --- OSCILLOSCOPE LOOP ---
  function startOscilloscopeLoop() {
    let oscPhase = 0;
    function animateOsc() {
      oscPhase += 0.2;

      if (oscAcCtx) {
        const w = oscAcCtx.canvas.width;
        const h = oscAcCtx.canvas.height;
        oscAcCtx.clearRect(0, 0, w, h);
        oscAcCtx.beginPath();
        oscAcCtx.lineWidth = 2;
        oscAcCtx.strokeStyle = '#38bdf8';

        const isTalking = activeTransmitter !== null;
        const amp = isTalking ? 55 : 5;

        for (let x = 0; x < w; x++) {
          const y = (h / 2) + Math.sin(x * 0.03 + oscPhase) * Math.cos(x * 0.07) * amp;
          if (x === 0) oscAcCtx.moveTo(x, y); else oscAcCtx.lineTo(x, y);
        }
        oscAcCtx.stroke();
      }

      if (oscDcCtx) {
        const w = oscDcCtx.canvas.width;
        const h = oscDcCtx.canvas.height;
        oscDcCtx.clearRect(0, 0, w, h);
        oscDcCtx.beginPath();
        oscDcCtx.lineWidth = 2.5;
        oscDcCtx.strokeStyle = '#f59e0b';

        const dcVal = activeTransmitter ? activeTransmitter.dcVoltage : ambientNoiseFloor;
        const targetY = h - 15 - ((dcVal / 5.0) * (h - 30));

        for (let x = 0; x < w; x++) {
          const ripple = activeTransmitter ? (Math.random() - 0.5) * 3 : (Math.random() - 0.5) * 1.5;
          const y = targetY + ripple;
          if (x === 0) oscDcCtx.moveTo(x, y); else oscDcCtx.lineTo(x, y);
        }
        oscDcCtx.stroke();
      }

      requestAnimationFrame(animateOsc);
    }
    animateOsc();
  }

  // --- WEB AUDIO SYNTHESIS ---
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
    } catch (e) {}
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

/* ==========================================================================
   SMART MULTI-ROOM INTERCOM - LUXURY 3D ARCHITECTURAL RESIDENCE ENGINE
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

  // Web Audio Context
  let audioCtx = null;
  let synthOscillator = null;

  // Canvas References
  const mainCanvas = document.getElementById('house-3d-canvas');
  const ctx3d = mainCanvas?.getContext('2d');

  const pipSpectrumCanvas = document.getElementById('pip-spectrum-canvas');
  const pipSpectrumCtx = pipSpectrumCanvas?.getContext('2d');

  const oscAcCtx = document.getElementById('osc-ac-canvas')?.getContext('2d');
  const oscDcCtx = document.getElementById('osc-dc-canvas')?.getContext('2d');

  // --- ROOM DEFINITIONS WITH ARCHITECTURAL POSITIONS & INTERIOR ASSETS ---
  const rooms = {
    master: {
      id: 'master', name: 'Master Bedroom', priority: 1, muxCode: 'S0:0 S1:0 S2:0 (Y0)', state: 'idle', dcVoltage: 0.12, talkingTimer: null,
      x: 80, y: 70, w: 340, h: 240, color: '#a855f7', floorType: 'wood-dark',
      furniture: 'king-bed-suite', micPos: { x: 380, y: 110 }, spkPos: { x: 380, y: 250 }
    },
    hall: {
      id: 'hall', name: 'Living Hall', priority: 2, muxCode: 'S0:1 S1:0 S2:0 (Y1)', state: 'idle', dcVoltage: 0.10, talkingTimer: null,
      x: 440, y: 70, w: 360, h: 240, color: '#38bdf8', floorType: 'wood-light',
      furniture: 'living-lounge', micPos: { x: 460, y: 110 }, spkPos: { x: 770, y: 250 }
    },
    kitchen: {
      id: 'kitchen', name: 'Kitchen', priority: 3, muxCode: 'S0:0 S1:1 S2:0 (Y2)', state: 'idle', dcVoltage: 0.14, talkingTimer: null,
      x: 820, y: 70, w: 280, h: 240, color: '#f59e0b', floorType: 'marble-tile',
      furniture: 'kitchen-island', micPos: { x: 840, y: 110 }, spkPos: { x: 1070, y: 250 }
    },
    bed2: {
      id: 'bed2', name: 'Bedroom 2', priority: 4, muxCode: 'S0:1 S1:1 S2:0 (Y3)', state: 'idle', dcVoltage: 0.11, talkingTimer: null,
      x: 80, y: 330, w: 320, h: 250, color: '#10b981', floorType: 'wood-light',
      furniture: 'study-bed', micPos: { x: 370, y: 370 }, spkPos: { x: 370, y: 550 }
    },
    bed3: {
      id: 'bed3', name: 'Bedroom 3', priority: 4, muxCode: 'S0:0 S1:0 S2:1 (Y4)', state: 'idle', dcVoltage: 0.09, talkingTimer: null,
      x: 420, y: 330, w: 360, h: 250, color: '#10b981', floorType: 'wood-dark',
      furniture: 'queen-suite', micPos: { x: 440, y: 370 }, spkPos: { x: 750, y: 550 }
    },
    bed4: {
      id: 'bed4', name: 'Bedroom 4', priority: 4, muxCode: 'S0:1 S1:0 S2:1 (Y5)', state: 'idle', dcVoltage: 0.10, talkingTimer: null,
      x: 800, y: 330, w: 300, h: 250, color: '#10b981', floorType: 'wood-light',
      furniture: 'modern-bed', micPos: { x: 820, y: 370 }, spkPos: { x: 1070, y: 550 }
    }
  };

  // Central Arduino Matrix Hub position in hallway
  const hubPos = { x: 590, y: 300 };

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
        triggerRoomTalk(rId, 3800);
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
      if (!activeTransmitter) triggerRoomTalk('kitchen', 3800);
    });
    document.getElementById('osc-btn-clear')?.addEventListener('click', resetAllRooms);
  }

  function setCamMode(mode, targetBtn) {
    cameraMode = mode;
    document.querySelectorAll('.btn-cam').forEach(b => b.classList.remove('active'));
    targetBtn?.classList.add('active');
  }

  // --- CORE PRIORITY MATRIX RESOLVER ---
  function triggerRoomTalk(roomId, durationMs = 3800) {
    initWebAudio();
    const candidate = rooms[roomId];
    if (!candidate) return;

    // Priority Check
    if (activeTransmitter && activeTransmitter.id !== roomId) {
      if (candidate.priority < activeTransmitter.priority) {
        // Candidate HAS HIGHER PRIORITY -> OVERRIDE!
        console.log(`[PRIORITY OVERRIDE] ${candidate.name} (Prio ${candidate.priority}) overrides ${activeTransmitter.name}`);
        rooms[activeTransmitter.id].state = 'overridden';
        playChimeSound(880);
      } else {
        // Candidate HAS LOWER PRIORITY -> MUTED!
        console.log(`[PRIORITY REJECTED] ${candidate.name} blocked by ${activeTransmitter.name}`);
        rooms[roomId].state = 'muted';
        return;
      }
    }

    activeTransmitter = candidate;
    candidate.state = 'talking';
    candidate.dcVoltage = 3.90 + (Math.random() * 0.45); // Speech DC voltage 3.9V-4.35V DC

    if (candidate.talkingTimer) clearTimeout(candidate.talkingTimer);

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

    spawnSignalParticles(candidate, targetReceivers);
    updateTelemetryHeader();
    updatePIPCameraHUD(candidate);
    playSpeechSynthAudio();

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
      if (elMux) elMux.textContent = 'S0:0 S1:0 S2:0 (INH:1 - Muted)';
      if (elPriority) { elPriority.textContent = 'STANDBY MODE'; elPriority.className = 't-value'; }
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
    if (title) title.innerHTML = `<i class="fa-solid fa-video"></i> LIVE ROOM FEED: ${room.name.toUpperCase()}`;
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

    // Mic to Hub
    for (let i = 0; i < 18; i++) {
      signalParticles.push({
        sx: tPos.x, sy: tPos.y,
        tx: hubPos.x, ty: hubPos.y,
        progress: Math.random(),
        speed: 0.018 + Math.random() * 0.01,
        color: transmitter.color,
        size: 3.5 + Math.random() * 2.5
      });
    }

    // Hub to Receiver Speakers
    receivers.forEach(rId => {
      const rec = rooms[rId];
      if (!rec) return;
      for (let i = 0; i < 14; i++) {
        signalParticles.push({
          sx: hubPos.x, sy: hubPos.y,
          tx: rec.spkPos.x, ty: rec.spkPos.y,
          progress: Math.random(),
          speed: 0.018 + Math.random() * 0.01,
          color: rec.color,
          size: 3 + Math.random() * 2
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

    document.querySelector('.nav-btn[data-tab="simulator"]')?.click();
    const banner = document.getElementById('video-banner');
    const vbTitle = document.getElementById('vb-title');
    const vbDesc = document.getElementById('vb-desc');
    const vbFill = document.getElementById('vb-fill');

    if (banner) banner.classList.add('active');

    // Scene 1
    vbTitle.textContent = "CINEMATIC WALKTHROUGH: SCENE 1 / 3";
    vbDesc.textContent = "Kitchen initiates voice intercom call to Bedroom 2 (Priority 3). Voice converts to 3.92V DC signal...";
    if (vbFill) vbFill.style.width = "30%";

    setCamMode('zoom', document.getElementById('cam-zoom'));
    runScenarioKitchenToBed2();

    // Scene 2
    setTimeout(() => {
      vbTitle.textContent = "CINEMATIC WALKTHROUGH: SCENE 2 / 3";
      vbDesc.textContent = "Master Bedroom interrupts with Priority 1 Emergency Override! Kitchen is muted instantly.";
      if (vbFill) vbFill.style.width = "70%";

      triggerRoomTalk('master', 4500);
    }, 4500);

    // Scene 3
    setTimeout(() => {
      vbTitle.textContent = "CINEMATIC WALKTHROUGH: COMPLETE";
      vbDesc.textContent = "Audio hold-timer expires. Channel returns to standby mode.";
      if (vbFill) vbFill.style.width = "100%";
      setCamMode('iso', document.getElementById('cam-iso'));
    }, 9000);

    setTimeout(() => {
      resetAllRooms();
      autoVideoMode = false;
      if (banner) banner.classList.remove('active');
    }, 12000);
  }

  // --- MASTER ARCHITECTURAL 3D RENDERING ENGINE ---
  function startMaster3DRenderLoop() {
    function render() {
      wavePhase += 0.12;
      particlePhase += 0.05;

      if (ctx3d && mainCanvas) {
        drawArchitectural3DHouse(ctx3d, mainCanvas.width, mainCanvas.height);
      }

      if (pipSpectrumCtx && pipSpectrumCanvas) {
        drawPIPSpectrum(pipSpectrumCtx, pipSpectrumCanvas.width, pipSpectrumCanvas.height);
      }

      requestAnimationFrame(render);
    }
    render();
  }

  function drawArchitectural3DHouse(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    if (cameraMode === 'iso') {
      ctx.translate(width / 2, height / 2 - 15);
      ctx.scale(0.95, 0.76);
      ctx.rotate(-0.05);
      ctx.translate(-width / 2, -height / 2);
    } else if (cameraMode === 'zoom' && activeTransmitter) {
      const t = activeTransmitter;
      ctx.translate(width / 2 - (t.x + t.w / 2), height / 2 - (t.y + t.h / 2));
      ctx.scale(1.25, 1.25);
    }

    // 1. Draw Exterior Foundation Slab
    ctx.fillStyle = nightMode ? '#070c18' : '#0e172a';
    ctx.fillRect(40, 30, 1100, 620);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#1e293b';
    ctx.strokeRect(40, 30, 1100, 620);

    // 2. Draw Wire Conduit Laser Wires
    if (showConduits) {
      Object.keys(rooms).forEach(rId => {
        const room = rooms[rId];
        ctx.beginPath();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = room.state === 'talking' ? room.color : (room.state === 'listening' ? '#38bdf8' : 'rgba(255,255,255,0.06)');
        ctx.shadowColor = room.state === 'talking' ? room.color : 'transparent';
        ctx.shadowBlur = 10;
        ctx.moveTo(room.micPos.x, room.micPos.y);
        ctx.lineTo(hubPos.x, hubPos.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
      });
    }

    // 3. Draw Rooms with Architectural Flooring & Furniture
    Object.keys(rooms).forEach(rId => {
      drawRoomArchitecturalInterior(ctx, rooms[rId]);
    });

    // 4. Draw Thick 3D Structural Walls & Door Openings
    drawArchitecturalWalls(ctx);

    // 5. Draw Central Arduino Matrix Hub
    drawCentralHub3D(ctx, hubPos.x, hubPos.y);

    // 6. Draw Animated Signal Particles
    signalParticles.forEach(p => {
      p.progress += p.speed;
      if (p.progress > 1) p.progress = 0;

      const px = p.sx + (p.tx - p.sx) * p.progress;
      const py = p.sy + (p.ty - p.sy) * p.progress;

      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    ctx.restore();
  }

  function drawRoomArchitecturalInterior(ctx, room) {
    const { x, y, w, h, name, priority, color, state, dcVoltage, floorType, furniture } = room;

    // Floor Base Texture
    if (floorType === 'marble-tile') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      for (let tx = x; tx < x + w; tx += 40) {
        ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx, y + h); ctx.stroke();
      }
      for (let ty = y; ty < y + h; ty += 40) {
        ctx.beginPath(); ctx.moveTo(x, ty); ctx.lineTo(x + w, ty); ctx.stroke();
      }
    } else if (floorType === 'wood-dark') {
      ctx.fillStyle = '#0e1726';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(120, 80, 40, 0.15)';
      ctx.lineWidth = 1;
      for (let ty = y; ty < y + h; ty += 25) {
        ctx.beginPath(); ctx.moveTo(x, ty); ctx.lineTo(x + w, ty); ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#111c30';
      ctx.fillRect(x, y, w, h);
    }

    // Active Room Glow Overlay
    if (state === 'talking') {
      const grad = ctx.createRadialGradient(x + w / 2, y + h / 2, 20, x + w / 2, y + h / 2, w / 1.4);
      grad.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
      grad.addColorStop(1, 'rgba(16, 185, 129, 0.02)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
    } else if (state === 'listening') {
      const grad = ctx.createRadialGradient(x + w / 2, y + h / 2, 20, x + w / 2, y + h / 2, w / 1.4);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0.02)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
    } else if (state === 'overridden') {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
      ctx.fillRect(x, y, w, h);
    }

    // Room Label Header
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(x + 10, y + 10, w - 20, 26);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px "Outfit", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(name, x + 18, y + 27);

    ctx.fillStyle = color;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`PRIO ${priority}`, x + w - 18, y + 27);

    // Realistic Furniture Drawing
    ctx.save();
    if (furniture === 'king-bed-suite') {
      // Area Rug
      ctx.fillStyle = 'rgba(168, 85, 247, 0.1)';
      ctx.fillRect(x + 30, y + 60, 140, 150);
      // King Bed
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x + 40, y + 70, 110, 130);
      // Headboard
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + 40, y + 70, 110, 20);
      // Pillows
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(x + 48, y + 75, 40, 12);
      ctx.fillRect(x + 102, y + 75, 40, 12);
      // Nightstands
      ctx.fillStyle = '#475569';
      ctx.fillRect(x + 10, y + 70, 25, 25);
      ctx.fillRect(x + 155, y + 70, 25, 25);
      // Lamps
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath(); ctx.arc(x + 22, y + 82, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 167, y + 82, 5, 0, Math.PI * 2); ctx.fill();
    } else if (furniture === 'living-lounge') {
      // Rug
      ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
      ctx.fillRect(x + 40, y + 60, 220, 140);
      // L-Shaped Sectional Sofa
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x + 50, y + 70, 180, 45);
      ctx.fillRect(x + 185, y + 115, 45, 75);
      // Coffee Table
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + 80, y + 130, 80, 40);
      // TV Unit
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x + 50, y + 215, 140, 15);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(x + 70, y + 220, 100, 4);
    } else if (furniture === 'kitchen-island') {
      // Kitchen Counter Island
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(x + 30, y + 60, 180, 45);
      // Sink
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(x + 50, y + 70, 35, 25);
      // Cooktop
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x + 140, y + 70, 40, 25);
      // Stools
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath(); ctx.arc(x + 60, y + 125, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 110, y + 125, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 160, y + 125, 8, 0, Math.PI * 2); ctx.fill();
    } else {
      // Generic Bed & Study Setup
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x + 40, y + 70, 90, 120);
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + 40, y + 70, 90, 18);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(x + 48, y + 74, 32, 10);
      ctx.fillRect(x + 90, y + 74, 32, 10);
      // Study Desk
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + 160, y + 140, 90, 40);
    }
    ctx.restore();

    // Hardware Wall Box (Mic + VAD Meter + LM386 + Speaker)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.strokeStyle = state === 'talking' ? '#10b981' : 'rgba(56, 189, 248, 0.4)';
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
    ctx.fillText(`${dcVoltage.toFixed(2)}V DC`, x + w / 2, y + h - 12);

    // Animated Sound Ripples
    if (state === 'talking' || state === 'listening') {
      ctx.beginPath();
      ctx.arc(room.spkPos.x, room.spkPos.y, 16 + Math.sin(wavePhase * 2) * 8, 0, Math.PI * 2);
      ctx.strokeStyle = state === 'talking' ? 'rgba(16, 185, 129, 0.6)' : 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawArchitecturalWalls(ctx) {
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 8;

    // Main Corridor Dividing Lines & Wall Openings
    ctx.beginPath();
    ctx.moveTo(80, 310); ctx.lineTo(1100, 310); // Horizontal Main Corridor Wall
    ctx.moveTo(420, 70); ctx.lineTo(420, 580);   // Vertical Wall 1
    ctx.moveTo(800, 70); ctx.lineTo(800, 580);   // Vertical Wall 2
    ctx.stroke();

    // Doorway Cutouts
    ctx.strokeStyle = '#070c18';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(350, 310); ctx.lineTo(390, 310); // Master Doorway
    ctx.moveTo(480, 310); ctx.lineTo(520, 310); // Hall Doorway
    ctx.moveTo(850, 310); ctx.lineTo(890, 310); // Kitchen Doorway
    ctx.stroke();
  }

  function drawCentralHub3D(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = activeTransmitter ? '#10b981' : '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = activeTransmitter ? '#10b981' : '#38bdf8';
    ctx.shadowBlur = 16;

    ctx.fillRect(x - 65, y - 35, 130, 70);
    ctx.strokeRect(x - 65, y - 35, 130, 70);
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
      const h = isTalking ? (Math.sin(i * 0.4 + wavePhase) * 0.5 + 0.5) * height * 0.85 : (Math.random() * 5);
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

# Smart Multi-Room Analog Intercom

> A low-cost, smart intercom system for multi-room voice communication powered by Arduino and Voice Activity Detection (VAD).

---

## 💡 What is this project?

Imagine an intercom system for your home, office, or hospital that:
- 🔊 **Transmits clear voice instantly** with zero delay (no lag).
- 🎙️ **Detects when someone is speaking** automatically (Voice Activity Detection - VAD).
- ⚡ **Smart Priority Override:** If the Master Room or Emergency station speaks, it automatically pauses lower-priority room channels and broadcasts the important message.

Traditional digital intercoms can be expensive and complex. Simple analog intercoms get noisy when multiple people talk together. This project combines **clear analog audio** with **smart digital switching** via Arduino!

---

## ⚙️ How It Works (In 3 Simple Steps)

```
[ Room Microphone ] ---> [ Voice Detection (VAD) ] ---> [ Arduino Priority Controller ]
                                                                 |
                                                                 v
[ Room Speaker ] <--- [ Audio Amplifier ] <--- [ Analog Switch (CD4051) ]
```

1. **Voice Detection (VAD):** Microphone circuits detect when voice activity begins.
2. **Priority Decision:** Arduino checks who is speaking. If the Master Room speaks, it takes top priority over other rooms.
3. **Audio Switching:** Arduino controls a solid-state analog switch (CD4051) to connect the speaker lines without any mechanical noise or clicking.

---

## ✨ Key Features

- **Zero-Latency Audio:** Crystal clear, real-time voice transmission without digital lag.
- **Auto-Voice Detection (VAD):** Hands-free operation—no need to hold buttons constantly to talk.
- **Priority Override:** Important announcement channels (Master Room / Emergency) can override room-to-room conversations automatically.
- **Smart Speech Hold:** Keeps the line open during short pauses in natural conversation so words aren't cut off.
- **Status LEDs:** Visual indicators for Active Channel, Priority Override, and Mute state.

---

## 🛠️ Main Hardware Used

| Component | Purpose |
| :--- | :--- |
| **Arduino Uno / Nano** | Smart central controller managing priorities and switches |
| **Electret Mic Preamp (MAX9814 / LM358)** | Captures voice from rooms clearly |
| **VAD Peak Detector (LM393)** | Detects speech envelope for fast switching |
| **Analog Multiplexer (CD4051B)** | Solid-state audio switch connecting mic signals to speakers |
| **Audio Amplifier (LM386 / PAM8403)** | Drives speakers with clean sound in each room |

---

## 🚀 Quick Setup Guide

1. **Clone the repository:**
   ```bash
   git clone https://github.com/riddhilahoti-12/Arduino-Intercom.git
   ```
2. **Open Firmware:** Open `firmware/src/main.cpp` using Arduino IDE or VS Code with PlatformIO.
3. **Upload to Arduino:** Connect your Arduino board via USB and click **Upload**.
4. **Connect Hardware:** Wire the microphones, CD4051 switch, and amplifiers according to the pinout in `firmware/include/config.h`.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.

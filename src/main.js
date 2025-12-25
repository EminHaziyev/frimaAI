import './style.css'
import { createIcons, Signal, Battery, Video, Mic, RefreshCw, PhoneOff, Scan, Sprout, AlertTriangle, TrendingUp, FileVideo, ArrowLeft, X } from 'lucide'
import Chart from 'chart.js/auto'

// Initialize Icons
createIcons({
  icons: { Signal, Battery, Video, Mic, RefreshCw, PhoneOff, Scan, Sprout, AlertTriangle, TrendingUp, FileVideo, ArrowLeft, X }
})

// DOM Elements
const webcam = document.getElementById('webcam')
const statusMessage = document.getElementById('status-message')
const liveIndicator = document.querySelector('.live-indicator')
const videoFeed = document.querySelector('.video-feed')
const toggleVideoBtn = document.getElementById('toggle-video')
const holdCallBtn = document.getElementById('hold-call')
const resetBtn = document.getElementById('reset-app')
const switchCameraBtn = document.getElementById('switch-camera')

// Dashboard Elements
const dashboardView = document.getElementById('dashboard-view')
const visionView = document.getElementById('vision-view')
const startScanBtn = document.getElementById('start-scan-btn')
const backToDashboardBtn = document.getElementById('back-to-dashboard')
const recordingsList = document.getElementById('recordings-list')
const videoModal = document.getElementById('video-modal')
const playbackVideo = document.getElementById('playback-video')
const closeModalBtn = document.getElementById('close-modal-btn')
const videoDate = document.getElementById('video-date')

// State
let stream = null
let apiKey = import.meta.env.VITE_GEMINI_API_KEY
let elevenApiKey = import.meta.env.VITE_TTS_ELEVEN
let isVideoEnabled = true
let currentAudio = null
let currentFacingMode = "user"
let mediaRecorder = null
let recordedChunks = []
let recordingStartTime = null

// Constants
const MODEL = "gemini-2.5-flash"
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

// Speech Recognition Setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
const recognition = SpeechRecognition ? new SpeechRecognition() : null

if (recognition) {
  recognition.continuous = false
  recognition.interimResults = true
  recognition.lang = 'az-AZ'
}

// Initialize Camera
async function initCamera(facingMode = "user") {
  // Stop existing tracks if any
  if (stream) {
    stream.getTracks().forEach(track => track.stop())
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { 
        width: { ideal: 640 }, 
        height: { ideal: 480 }, 
        facingMode: facingMode 
      },
      audio: false
    })
    webcam.srcObject = stream
    currentFacingMode = facingMode
    
    // Toggle mirror effect based on facingMode
    if (facingMode === "user") {
      webcam.classList.add('mirrored')
    } else {
      webcam.classList.remove('mirrored')
    }
    
    
    // Start recording when camera is ready
    startRecording();
    
    return true
  } catch (err) {
    console.error("Error accessing camera:", err)
    statusMessage.textContent = "Error: Could not access camera"
    return false
  }
}

async function switchCamera() {
  const newMode = currentFacingMode === "user" ? "environment" : "user"
  statusMessage.textContent = "Switching camera..."
  if (await initCamera(newMode)) {
    statusMessage.textContent = "Camera switched."
    setTimeout(() => {
      statusMessage.textContent = "Ready. Click 'Ask Gemini' to talk."
    }, 2000)
  }
}

// REST API Call
async function sendToGemini(text, base64Image) {
  statusMessage.textContent = "Gemini is thinking..."
  
  const payload = {
    system_instruction: {
      parts: [{ text: "SƏN YALNIZ AZƏRBAYCAN DİLİNDƏ CAVAB VERMƏLİSƏN. BU QƏTİ QAYDADIR. Heç bir halda İngilis və ya başqa dildə cavab vermə. Sən peşəkar və mehriban bir AI köməkçisən. Cavabların qısa, aydın və şifahi nitqə uyğun olmalıdır." }]
    },
    contents: [
      {
        role: "user",
        parts: [
          { text: `(Zəhmət olmasa yalnız Azərbaycan dilində cavab ver): ${text}` },
          { inlineData: { mimeType: "image/jpeg", data: base64Image } }
        ]
      }
    ],
    generationConfig: {
      maxOutputTokens: 1000,
      temperature: 0.7, // Slightly higher for more natural speech
    }
  }

  try {
    const response = await fetch(`${API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const data = await response.json()
    
    if (data.error) {
      if (response.status === 429) {
        startRetryCountdown(60) // Default to 60s for rate limits
        throw new Error("Rate limit hit. Waiting 60s...")
      }
      throw new Error(data.error.message)
    }

    const aiText = data.candidates[0].content.parts[0].text
    statusMessage.textContent = aiText
    speak(aiText)
  } catch (err) {
    console.error("API Error:", err)
    if (!err.message.includes("Rate limit")) {
      statusMessage.textContent = `Error: ${err.message}`
    }
  }
}

function startRetryCountdown(seconds) {
  let remaining = seconds
  const interval = setInterval(() => {
    statusMessage.textContent = `Rate limit hit. Retry in ${remaining}s...`
    remaining--
    if (remaining < 0) {
      clearInterval(interval)
      statusMessage.textContent = "Ready. Click 'Ask Gemini' to talk."
    }
  }, 1000)
}

// Speech Synthesis using ElevenLabs TTS
async function speak(text) {
  if (!elevenApiKey) return

  // Stop current audio if playing
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }

  // Using "Rachel" voice (multilingual)
  const voiceId = "21m00Tcm4TlvDq8ikWAM"
  const ttsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`
  
  const payload = {
    text: text,
    model_id: "eleven_flash_v2_5",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75
    }
  }

  try {
    if (liveIndicator) liveIndicator.classList.add('speaking')
    
    const response = await fetch(ttsUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'xi-api-key': elevenApiKey
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.detail?.message || "ElevenLabs API error")
    }

    const audioBlob = await response.blob()
    const audioUrl = URL.createObjectURL(audioBlob)
    currentAudio = new Audio(audioUrl)
    
    currentAudio.onended = () => {
      if (liveIndicator) liveIndicator.classList.remove('speaking')
      URL.revokeObjectURL(audioUrl)
      currentAudio = null
    }
    
    currentAudio.onerror = (e) => {
      console.error("Audio playback error:", e)
      if (liveIndicator) liveIndicator.classList.remove('speaking')
    }

    await currentAudio.play()
  } catch (err) {
    console.error("ElevenLabs TTS Error:", err)
    if (liveIndicator) liveIndicator.classList.remove('speaking')
    // Fallback to basic status message if TTS fails
    statusMessage.textContent = `(TTS Error) ${text}`
  }
}

// Helper to convert base64 to Blob
function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  return new Blob([byteArray], { type: mimeType })
}

// Capture Logic
async function captureAndAsk() {
  if (!recognition) return alert("Speech recognition not supported.")
  if (!apiKey) return alert("API Key missing.")

  let silenceTimer = null
  const resetSilenceTimer = () => {
    if (silenceTimer) clearTimeout(silenceTimer)
    silenceTimer = setTimeout(() => {
      console.log("Silence detected, stopping recognition.")
      recognition.stop()
    }, 2000) // 2 seconds timeout
  }

  statusMessage.textContent = "Listening..."
  videoFeed.classList.add('listening')
  
  recognition.start()

  recognition.onstart = () => {
    resetSilenceTimer()
  }

  recognition.onresult = async (event) => {
    resetSilenceTimer()
    let interimTranscript = ''
    let finalTranscript = ''

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript
      } else {
        interimTranscript += event.results[i][0].transcript
      }
    }

    if (interimTranscript) {
      statusMessage.textContent = interimTranscript
    }

    if (finalTranscript) {
      console.log("User said (final):", finalTranscript)
      if (silenceTimer) clearTimeout(silenceTimer)
      
      // Capture Image
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 480
      const ctx = canvas.getContext('2d')
      ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height)
      const base64Image = canvas.toDataURL('image/jpeg', 0.6).split(',')[1]
      
      await sendToGemini(finalTranscript, base64Image)
    }
  }

  recognition.onend = () => {
    if (silenceTimer) clearTimeout(silenceTimer)
    videoFeed.classList.remove('listening')
  }

  recognition.onerror = (event) => {
    if (silenceTimer) clearTimeout(silenceTimer)
    console.error("Speech recognition error:", event.error)
    statusMessage.textContent = "Error listening. Try again."
    videoFeed.classList.remove('listening')
  }
}

// Event Listeners
window.addEventListener('load', async () => {
  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
    statusMessage.textContent = "Error: Please set VITE_GEMINI_API_KEY in .env"
    return
  }
  
  if (await initCamera()) {
    statusMessage.textContent = "Ready. Click 'Ask Gemini' to talk."
  }
})

videoFeed.addEventListener('click', captureAndAsk)

function exitToDashboard() {
  visionView.classList.add('hidden')
  dashboardView.classList.remove('hidden')
  
  // Stop camera to save battery
  stopRecording(); // Stop recording when exiting
  if (stream) {
    stream.getTracks().forEach(track => track.stop())
    stream = null
  }
  if (recognition) recognition.stop()
  if (currentAudio) currentAudio.pause()
}

holdCallBtn.addEventListener('click', exitToDashboard)

toggleVideoBtn.addEventListener('click', () => {
  isVideoEnabled = !isVideoEnabled
  stream.getVideoTracks()[0].enabled = isVideoEnabled
  toggleVideoBtn.classList.toggle('active', !isVideoEnabled)
})

// View Switching Logic
startScanBtn.addEventListener('click', async () => {
  dashboardView.classList.add('hidden')
  visionView.classList.remove('hidden')
  
  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
    statusMessage.textContent = "Error: Please set VITE_GEMINI_API_KEY in .env"
    return
  }
  
  if (await initCamera(currentFacingMode)) {
    statusMessage.textContent = "Ready. Click video to talk."
  }
})

backToDashboardBtn.addEventListener('click', exitToDashboard)

resetBtn.addEventListener('click', () => {
  location.reload()
})

switchCameraBtn.addEventListener('click', switchCamera)

// --- Dashboard Logic (Chart.js) ---

const mockNDVIData = {
  "Sahə 1 - Üzüm": {
      dates: ['05.12', '08.12', '11.12', '14.12', '17.12', '20.12', '23.12'],
      values: [0.72, 0.68, 0.65, 0.58, 0.55, 0.51, 0.48]
  },
  "Sahə 2 - Buğda": {
      dates: ['05.12', '08.12', '11.12', '14.12', '17.12', '20.12', '23.12'],
      values: [0.81, 0.79, 0.78, 0.77, 0.75, 0.74, 0.72]
  },
  "Sahə 3 - Pambıq": {
      dates: ['05.12', '08.12', '11.12', '14.12', '17.12', '20.12', '23.12'],
      values: [0.64, 0.63, 0.62, 0.60, 0.59, 0.58, 0.57]
  }
};

let ndviChart = null;
let selectedField = "Sahə 1 - Üzüm";

function createNDVIChart() {
  const ctx = document.getElementById('ndvi-chart').getContext('2d');
  const data = mockNDVIData[selectedField];

  if (ndviChart) {
      ndviChart.destroy();
  }

  ndviChart = new Chart(ctx, {
      type: 'line',
      data: {
          labels: data.dates,
          datasets: [{
              label: 'NDVI Göstəricisi',
              data: data.values,
              borderColor: '#4A7C2C',
              backgroundColor: 'rgba(74, 124, 44, 0.1)',
              borderWidth: 3,
              fill: true,
              tension: 0.4,
              pointRadius: 6,
              pointBackgroundColor: '#D4AF37',
              pointBorderColor: '#2D5016',
              pointBorderWidth: 2,
              pointHoverRadius: 8
          }]
      },
      options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
              legend: {
                  display: true,
                  labels: {
                      color: '#A5D6A7',
                      font: { size: 13, family: 'IBM Plex Sans' }
                  }
              },
              tooltip: {
                  backgroundColor: 'rgba(20, 24, 20, 0.95)',
                  titleColor: '#E8F5E9',
                  bodyColor: '#A5D6A7',
                  borderColor: '#2D4A2D',
                  borderWidth: 1,
                  padding: 12,
                  displayColors: false,
                  callbacks: {
                      label: function (context) {
                          return `NDVI: ${context.parsed.y.toFixed(3)}`;
                      }
                  }
              }
          },
          scales: {
              y: {
                  beginAtZero: false,
                  min: 0.4,
                  max: 0.9,
                  grid: {
                      color: 'rgba(45, 74, 45, 0.3)'
                  },
                  ticks: {
                      color: '#A5D6A7',
                      font: { family: 'JetBrains Mono', size: 11 }
                  }
              },
              x: {
                  grid: {
                      color: 'rgba(45, 74, 45, 0.3)'
                  },
                  ticks: {
                      color: '#A5D6A7',
                      font: { size: 11 }
                  }
              }
          }
      }
  });
}

function updateFieldSelection(fieldName) {
  selectedField = fieldName;
  createNDVIChart();
  
  // Update UI state
  document.querySelectorAll('.field-btn').forEach(btn => {
    if (btn.textContent.includes(fieldName)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('ndvi-chart')) {
    createNDVIChart();
    
    document.getElementById('field-1').addEventListener('click', () => updateFieldSelection("Sahə 1 - Üzüm"));
    document.getElementById('field-2').addEventListener('click', () => updateFieldSelection("Sahə 2 - Buğda"));
    document.getElementById('field-3').addEventListener('click', () => updateFieldSelection("Sahə 3 - Pambıq"));
  }
});

// --- IndexedDB Logic ---

const DB_NAME = 'GreenKarabakhDB';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
    
    request.onerror = (event) => {
      reject('IndexedDB error: ' + event.target.error);
    };
  });
}

async function saveRecording(blob) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  const recording = {
    blob: blob,
    timestamp: new Date().toISOString(),
    duration: Date.now() - recordingStartTime
  };
  
  store.add(recording);
  return tx.complete;
}

async function getAllRecordings() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => {
      resolve(request.result);
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function renderRecordings() {
  const recordings = await getAllRecordings();
  recordingsList.innerHTML = '';
  
  if (recordings.length === 0) {
    recordingsList.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; text-align: center; padding: 20px;">Hələ heç bir çəkiliş yoxdur.</p>';
    return;
  }
  
  // Sort by newest first
  recordings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  recordings.forEach(rec => {
    const date = new Date(rec.timestamp);
    const dateStr = date.toLocaleDateString('az-AZ');
    const timeStr = date.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' });
    
    const div = document.createElement('div');
    div.className = 'recording-item';
    div.style.cssText = `
      background: var(--bg-med);
      padding: 12px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      border: 1px solid var(--border);
      transition: all 0.2s;
    `;
    div.onmouseover = () => div.style.borderColor = 'var(--primary-light)';
    div.onmouseout = () => div.style.borderColor = 'var(--border)';
    
    div.innerHTML = `
      <div style="width: 40px; height: 40px; background: rgba(74, 124, 44, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--success);">
        <i data-lucide="video"></i>
      </div>
      <div>
        <div style="font-weight: 500; color: var(--text-primary);">Canlı Çəkiliş</div>
        <div style="font-size: 12px; color: var(--text-muted);">${dateStr} • ${timeStr}</div>
      </div>
      <div style="margin-left: auto; color: var(--secondary); font-size: 12px; font-family: 'JetBrains Mono';">
        ${Math.round(rec.duration / 1000)}s
      </div>
    `;
    
    div.addEventListener('click', () => {
      const url = URL.createObjectURL(rec.blob);
      playbackVideo.src = url;
      videoDate.textContent = `${dateStr} • ${timeStr}`;
      videoModal.classList.remove('hidden');
      playbackVideo.play();
    });
    
    recordingsList.appendChild(div);
  });
  createIcons({ icons: { Video }, nameAttr: 'data-lucide', attrs: {class: "lucide lucide-video"} });
}

// Modal Logic
closeModalBtn.addEventListener('click', () => {
  videoModal.classList.add('hidden');
  playbackVideo.pause();
  playbackVideo.src = '';
});

// Initialize Recordings on Load
document.addEventListener('DOMContentLoaded', () => {
  renderRecordings();
});

// --- Recording Logic Integration ---

function startRecording() {
  if (!stream) return;
  
  recordedChunks = [];
  try {
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
  } catch (e) {
    try {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp8' });
    } catch (e) {
        console.error("MediaRecorder not supported");
        return;
    }
  }

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    await saveRecording(blob);
    renderRecordings();
  };

  mediaRecorder.start();
  recordingStartTime = Date.now();
  console.log("Recording started");
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    console.log("Recording stopped");
  }
}


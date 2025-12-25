import './style.css'
import { createIcons, Signal, Battery, Video, Mic, RefreshCw } from 'lucide'

// Initialize Icons
createIcons({
  icons: { Signal, Battery, Video, Mic, RefreshCw }
})

// DOM Elements
const webcam = document.getElementById('webcam')
const statusMessage = document.getElementById('status-message')
const liveIndicator = document.querySelector('.live-indicator')
const askBtn = document.getElementById('ask-gemini')
const toggleVideoBtn = document.getElementById('toggle-video')
const resetBtn = document.getElementById('reset-app')

// State
let stream = null
let apiKey = import.meta.env.VITE_GEMINI_API_KEY
let elevenApiKey = import.meta.env.VITE_TTS_ELEVEN
let isVideoEnabled = true
let currentAudio = null

// Constants
const MODEL = "gemini-2.5-flash"
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

// Speech Recognition Setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
const recognition = SpeechRecognition ? new SpeechRecognition() : null

if (recognition) {
  recognition.continuous = false
  recognition.interimResults = false
  recognition.lang = 'az-AZ'
}

// Initialize Camera
async function initCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false
    })
    webcam.srcObject = stream
    return true
  } catch (err) {
    console.error("Error accessing camera:", err)
    statusMessage.textContent = "Error: Could not access camera"
    return false
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

  statusMessage.textContent = "Listening..."
  askBtn.classList.add('listening')
  
  recognition.start()

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript
    console.log("User said:", transcript)
    
    // Capture Image
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const ctx = canvas.getContext('2d')
    ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height)
    const base64Image = canvas.toDataURL('image/jpeg', 0.6).split(',')[1]
    
    await sendToGemini(transcript, base64Image)
  }

  recognition.onend = () => {
    askBtn.classList.remove('listening')
  }

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error)
    statusMessage.textContent = "Error listening. Try again."
    askBtn.classList.remove('listening')
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

askBtn.addEventListener('click', captureAndAsk)

toggleVideoBtn.addEventListener('click', () => {
  isVideoEnabled = !isVideoEnabled
  stream.getVideoTracks()[0].enabled = isVideoEnabled
  toggleVideoBtn.classList.toggle('active', !isVideoEnabled)
})

resetBtn.addEventListener('click', () => {
  location.reload()
})

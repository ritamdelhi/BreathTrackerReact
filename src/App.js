import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [breathCount, setBreathCount] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [noiseDetected, setNoiseDetected] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const streamRef = useRef(null);

  const serverIp = 'kb.optalpha.com';
  // Use ws:// for local development or non-HTTPS deployment
  // For HTTPS deployment, a secure WebSocket server with SSL is required
  const wsUrl = `ws://${serverIp}:8765`;

  const params = {
    uid: 'guest_user_' + Date.now(),
    user_name: 'Guest',
    rate: 16000,
    chunk_size: 4096,
    no_of_chunks: 3,
    frame_length: 512,
    hop_length: 64,
    n_mels: 128,
    n2: 30,
    n1: 10,
    bump_threshold: 0.15,
    WINDOW_DURATION: 4.0,
    MIN_FREQ: 0.4,
    MAX_FREQ: 2.5,
    CONFIRMATION_THRESHOLD: 4,
    wave_amplitude_thresold: 3.0,
  };

  const connectWebSocket = () => {
    if (wsRef.current) return;

    setStatus('Connecting...');
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log('WebSocket connected');
      setStatus('Connected');
      wsRef.current.send(JSON.stringify(params));
      console.log('Sent params:', params);
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const newCount = data.breath_count || 0;
        const noise = data.Noise && data.Noise.length > 0 ? data.Noise[0] : false;
        setBreathCount(newCount);
        setNoiseDetected(noise);
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    };

    wsRef.current.onclose = (event) => {
      console.log('WebSocket closed', event.code, event.reason);
      setStatus('Disconnected');
      wsRef.current = null;
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error', error);
      setError('WebSocket error');
      setStatus('Error');
    };
  };

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });
      streamRef.current = stream;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0); // Float32Array
        const int16Array = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          int16Array[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32767));
        }
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(int16Array.buffer);
          console.log('Sent audio data, length:', int16Array.length);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      connectWebSocket();

      setIsRecording(true);
      setStatus('Recording...');
    } catch (err) {
      setError('Microphone access denied or not supported');
      setStatus('Error');
    }
  };

  const stopRecording = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsRecording(false);
    setStatus('Stopped');
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Kapalbhati Tracker</h1>
        <div className="counter">
          <h2>Breath Count</h2>
          <div className="count-display">{breathCount}</div>
          {noiseDetected && <p className="noise">Noise Detected</p>}
        </div>
        <button
          className={`record-btn ${isRecording ? 'recording' : ''}`}
          onClick={toggleRecording}
        >
          {isRecording ? 'Stop Session' : 'Start Session'}
        </button>
        <p>Status: {status}</p>
        {error && <p className="error">Error: {error}</p>}
      </header>
    </div>
  );
}

export default App;

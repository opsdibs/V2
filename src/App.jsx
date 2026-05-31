import React, { useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { LoginPage } from './components/LoginPage';
import { LiveRoom } from './components/LiveRoom';

const WELCOME_MUSIC_SRC = '/sounds/welcomenote.wav';
const WELCOME_MUSIC_VOLUME = 0.35;

// Background music: plays on welcome/login/OTP, stops when entering a live room.
// Starts on the user's first tap (mobile browsers block autoplay until then).
const BackgroundMusic = () => {
  const location = useLocation();
  const audioRef = useRef(null);
  const isPrimedRef = useRef(false);

  // Initialise the audio element once (lives across page changes)
  useEffect(() => {
    const audio = new Audio(WELCOME_MUSIC_SRC);
    audio.loop = true;
    audio.volume = WELCOME_MUSIC_VOLUME;
    audio.preload = 'auto';
    audioRef.current = audio;

    // Start playing on the user's first interaction (autoplay-policy compliant)
    const startOnInteraction = () => {
      if (isPrimedRef.current) return;
      // Don't start if user landed directly on a room route
      if (window.location.pathname.startsWith('/room')) {
        isPrimedRef.current = true;
        return;
      }
      audio
        .play()
        .then(() => {
          isPrimedRef.current = true;
        })
        .catch(() => {
          // Browser still blocked it — will retry on next interaction
        });
    };

    window.addEventListener('click', startOnInteraction);
    window.addEventListener('touchstart', startOnInteraction);
    window.addEventListener('keydown', startOnInteraction);

    return () => {
      window.removeEventListener('click', startOnInteraction);
      window.removeEventListener('touchstart', startOnInteraction);
      window.removeEventListener('keydown', startOnInteraction);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Pause music when entering a room, resume when leaving
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (location.pathname.startsWith('/room')) {
      audio.pause();
    } else if (isPrimedRef.current) {
      audio.play().catch(() => {});
    }
  }, [location.pathname]);

  return null;
};

function App() {
  return (
    <Router basename="/">
      <BackgroundMusic />
      <Routes>
        {/* MODULE 1 CHANGE: Root now points to Unified Login Page */}
        <Route path="/" element={<LoginPage />} />

        {/* Legacy/Direct link support */}
        <Route path="/login" element={<LoginPage />} />

        {/* The Live Room (Protected by Login Logic) */}
        <Route path="/room/:roomId" element={<RoomWrapper />} />
      </Routes>
    </Router>
  );
}

// Wrapper to parse params if needed
const RoomWrapper = () => {
    const params = window.location.pathname.split('/');
    const roomId = params[params.length - 1];
    return <LiveRoom roomId={roomId} />;
};

export default App;

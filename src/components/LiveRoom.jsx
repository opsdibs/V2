import React, { useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X, Mic, MicOff, Video as VideoIcon, VideoOff, Radio, RefreshCw, Shield } from 'lucide-react';
import { AGORA_APP_ID, AGORA_TOKEN } from '../lib/settings';
import { InteractionLayer } from './InteractionLayer';
import { ModeratorPanel } from './ModeratorPanel';
import { ref, get } from 'firebase/database';
import { db } from '../lib/firebase';

export const LiveRoom = ({ roomId }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // --- SECURITY: VERIFY ROLE FROM DB ---
  const dbKey = searchParams.get('dbKey');
  const [verifiedRole, setVerifiedRole] = useState(null);
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    const verifyUserSession = async () => {
        if (!dbKey) {
            navigate('/'); // No session key = Unauthorized
            return;
        }
        try {
            // Fetch the authoritative role from Firebase
            const snapshot = await get(ref(db, `audience_data/${roomId}/${dbKey}`));
            if (snapshot.exists()) {
                const data = snapshot.val();
                setVerifiedRole(data.role); // 'host', 'moderator', or 'audience'
            } else {
                console.warn("Invalid Session Key");
                navigate('/'); // Fake/Old key
            }
        } catch (error) {
            console.error("Verification failed:", error);
            navigate('/');
        } finally {
            setIsVerifying(false);
        }
    };
    verifyUserSession();
  }, [roomId, dbKey, navigate]);

  // Derived Permissions (Source of Truth)
  const isHost = verifiedRole === 'host';
  const isModerator = verifiedRole === 'moderator';
  
  // Connection States
  const [joined, setJoined] = useState(false);     
  const [isStreaming, setIsStreaming] = useState(false); 
  const [videoReady, setVideoReady] = useState(false);   
  const [status, setStatus] = useState("INITIALIZING...");

  // UI States
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [cameras, setCameras] = useState([]);
  const [showModPanel, setShowModPanel] = useState(false);

  // Refs
  const clientRef = useRef(null);
  const localTracksRef = useRef({ audio: null, video: null });
  const isRunning = useRef(false);

  useEffect(() => {
    if (isRunning.current) return;
    isRunning.current = true;

    let myClient = null;
    let isActive = true;

    const initAgora = async () => {
      try {
        setStatus("CONNECTING...");
        
        // 1. Create Client
        myClient = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
        clientRef.current = myClient; 

        if (isHost) {
          await myClient.setClientRole("host");
          try { setCameras(await AgoraRTC.getCameras()); } catch (e) {}
        } else {
          await myClient.setClientRole("audience", { level: 2 });
        }

        // 2. Listeners
        myClient.on("user-published", async (user, mediaType) => {
          if (!isActive) return;
          await myClient.subscribe(user, mediaType);
          if (mediaType === "video") {
            const remoteContainer = document.getElementById("remote-video-container");
            if (remoteContainer) {
                remoteContainer.innerHTML = ''; 
                user.videoTrack.play(remoteContainer);
                setVideoReady(true);
                setIsStreaming(true);
            }
          }
          if (mediaType === "audio") user.audioTrack.play();
        });

        myClient.on("user-unpublished", (user, mediaType) => {
             if (mediaType === 'video') setIsStreaming(false);
        });

        // 3. Join
        await myClient.join(AGORA_APP_ID, roomId, AGORA_TOKEN, null);
        if (isActive) setJoined(true);

        // 4. Host Setup
        if (isHost) {
          setStatus("STARTING CAMERA...");
          
          // FIX: Declare variables in outer scope to avoid ReferenceError
          let micTrack, camTrack;
          
          try {
             // Try HD
             const tracks = await AgoraRTC.createMicrophoneAndCameraTracks(
                 { echoCancellation: true, noiseSuppression: true },
                 { encoderConfig: "720p_1" } 
             );
             micTrack = tracks[0];
             camTrack = tracks[1];
          } catch (e) {
             console.warn("HD failed, retrying SD...");
             // Fallback SD
             const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
             micTrack = tracks[0];
             camTrack = tracks[1];
          }

          if (!isActive) { 
              micTrack?.close(); 
              camTrack?.close(); 
              return; 
          }

          localTracksRef.current = { audio: micTrack, video: camTrack }; // SYNC REF
          
          const localContainer = document.getElementById("local-video-container");
          if (localContainer) {
              camTrack.play(localContainer);
              setVideoReady(true);
              setStatus("READY TO AIR");
          }
        } else {
            setStatus("WAITING FOR HOST...");
        }

      } catch (error) {
        console.error("INIT ERROR:", error);
        if (isActive) setStatus(`ERROR: ${error.message}`);
      }
    };

    initAgora();

    // CLEANUP
    return () => {
      isActive = false;
      isRunning.current = false;
      
      const cleanup = async () => {
          if (localTracksRef.current.audio) localTracksRef.current.audio.close();
          if (localTracksRef.current.video) localTracksRef.current.video.close();
          localTracksRef.current = { audio: null, video: null };

          if (myClient) {
              await myClient.leave().catch(() => {});
              myClient.removeAllListeners();
          }
          
          if (clientRef.current === myClient) {
              clientRef.current = null;
          }
      };
      cleanup();
    };
  }, [roomId, isHost]);

  // --- TOGGLE STREAMING ---
  const handleToggleStream = async () => {
      if (!clientRef.current) {
          console.error("Client Ref is null");
          return;
      }

      const tracks = [localTracksRef.current.audio, localTracksRef.current.video].filter(Boolean);

      try {
          if (isStreaming) {
              setStatus("STOPPING...");
              await clientRef.current.unpublish(tracks);
              setIsStreaming(false);
              setStatus("READY TO AIR");
          } else {
              setStatus("PUBLISHING...");
              if (localTracksRef.current.audio) {
                  await localTracksRef.current.audio.setEnabled(true);
              }
              await clientRef.current.publish(tracks);
              setIsStreaming(true);
              setStatus("LIVE");
          }
      } catch (err) {
          console.error("Toggle Error:", err);
          setStatus("ERROR: " + err.message);
      }
  };

  // --- CAMERA SWITCH ---
  const switchCamera = async () => {
      if (!localTracksRef.current.video || cameras.length <= 1) return;
      try {
          const currentTrack = localTracksRef.current.video;
          const currentLabel = currentTrack.getTrackLabel();
          const currentIndex = cameras.findIndex(c => c.label === currentLabel);
          const nextIndex = (currentIndex + 1) % cameras.length;
          const nextDevice = cameras[nextIndex];
          await currentTrack.setDevice(nextDevice.deviceId);
      } catch (err) {
          console.error("Camera switch failed", err);
      }
  };

  const toggleMic = async () => {
      if (localTracksRef.current.audio) {
          const newState = !isMicOn;
          await localTracksRef.current.audio.setEnabled(newState);
          setIsMicOn(newState);
      }
  };
  const toggleCam = async () => {
      if (localTracksRef.current.video) {
          const newState = !isCamOn;
          await localTracksRef.current.video.setEnabled(newState);
          setIsCamOn(newState);
      }
  };

  const isLoading = isHost ? !videoReady : (!joined);

  if (isVerifying) {
      return (
          <div className="w-full h-screen bg-black flex items-center justify-center text-white">
              <div className="flex flex-col items-center gap-4">
                  <div className="w-8 h-8 border-4 border-t-transparent border-[#FF6600] rounded-full animate-spin"></div>
                  <span className="font-mono text-xs uppercase tracking-widest">Verifying Access...</span>
              </div>
          </div>
      );
  }

  return (
    <div className="relative w-full h-screen bg-black text-white overflow-hidden">
      
      {/* LAYER 1: VIDEO */}
      <div className="absolute inset-0 z-0">
        <div id="local-video-container" className={`w-full h-full ${!isHost ? 'hidden' : ''}`}></div>
        <div id="remote-video-container" className={`w-full h-full ${isHost ? 'hidden' : ''}`}></div>
        
        {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black z-20 flex-col gap-4">
                <span className="font-mono text-xs animate-pulse">CONNECTING...</span>
                <span className="font-mono text-[10px] text-yellow-500 uppercase">{status}</span>
            </div>
        )}

        {!isHost && joined && !isStreaming && (
             <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10 flex-col gap-4">
                <span className="font-display font-black text-2xl uppercase text-zinc-700">Stream Offline</span>
                <span className="font-mono text-xs text-zinc-500">Waiting for Host to go live...</span>
             </div>
        )}
      </div>

      {/* LAYER 2: INTERACTION */}
      <InteractionLayer roomId={roomId} isHost={isHost} />

      {/* LAYER 3: SYSTEM CONTROLS */}
      <div className="absolute inset-0 z-50 pointer-events-none p-4 flex flex-col justify-between">
        
        {/* Header */}
        <div className="flex justify-between items-start pointer-events-auto">
            <div className="flex flex-col items-start gap-2">
                <img src="/Dibs. (1).svg" alt="Dibs" className="w-16" />
                <div className={`px-2 py-0.5 rounded-sm flex items-center gap-2 ${isStreaming ? 'bg-red-600' : 'bg-neutral-800'}`}>
                    <span className="font-display font-black text-xs uppercase tracking-widest text-white">
                        {isStreaming ? 'LIVE' : 'OFFLINE'}
                    </span>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                 {/* MODERATOR TOGGLE BUTTON */}
                 {isModerator === 'moderator' && (
                     <button 
                        onClick={() => setShowModPanel(!showModPanel)} 
                        className={`p-2 rounded-full transition-colors ${showModPanel ? 'bg-white text-black' : 'bg-black/50 text-white hover:bg-white hover:text-black'}`}
                        title="Toggle Mod Panel"
                     >
                        <Shield className="w-4 h-4" />
                     </button>
                 )}
                 {isHost && (
                     <>
                        {cameras.length > 1 && (
                            <button onClick={switchCamera} className="bg-black/50 p-2 rounded-full hover:bg-white hover:text-black transition-colors">
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        )}
                        <button onClick={toggleMic} className="bg-black/50 p-2 rounded-full hover:bg-white hover:text-black transition-colors">
                            {isMicOn ? <Mic className="w-4 h-4"/> : <MicOff className="w-4 h-4 text-red-500"/>}
                        </button>
                        <button onClick={toggleCam} className="bg-black/50 p-2 rounded-full hover:bg-white hover:text-black transition-colors">
                            {isCamOn ? <VideoIcon className="w-4 h-4"/> : <VideoOff className="w-4 h-4 text-red-500"/>}
                        </button>
                     </>
                 )}
                 <button onClick={() => navigate('/')} className="bg-black/50 p-2 rounded-full hover:bg-white hover:text-black transition-colors">
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>

        {/* HOST STREAM CONTROLS (Bottom Right) */}
        {isHost && videoReady && (
            <>
                {!isStreaming ? (
                    <button 
                        onClick={handleToggleStream}
                        className="absolute bottom-4 right-4 pointer-events-auto bg-white text-black px-6 py-3 rounded-full font-black text-xs tracking-widest uppercase transition-transform hover:scale-105 shadow-2xl flex items-center gap-2 z-[60]"
                    >
                        <Radio className="w-4 h-4 text-red-600 animate-pulse" />
                        GO LIVE
                    </button>
                ) : (
                    <button 
                        onClick={handleToggleStream}
                        className="absolute bottom-4 right-4 pointer-events-auto bg-neutral-900/90 border border-red-500/50 text-red-500 px-6 py-3 rounded-full font-bold text-xs tracking-widest uppercase hover:bg-red-950 transition-colors z-[60]"
                    >
                        END STREAM
                    </button>
                )}
            </>
        )}
        {/* MODERATOR OVERLAY */}
        {isModerator === 'moderator' && (
          <ModeratorPanel roomId={roomId} onClose={() => setShowModPanel(false)} />
        )}
      </div>
    </div>
  );
};
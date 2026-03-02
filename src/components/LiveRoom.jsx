import React, { useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X, Mic, MicOff, Video as VideoIcon, VideoOff, Radio, RefreshCw, Shield, Square } from 'lucide-react';
import { AGORA_APP_ID, AGORA_TOKEN } from '../lib/settings';
import { InteractionLayer } from './InteractionLayer';
import { ModeratorPanel } from './ModeratorPanel';
import { ref, get, onValue, update } from 'firebase/database';
import { db } from '../lib/firebase';
import { startSession, endSession } from '../lib/analytics';

export const LiveRoom = ({ roomId }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dbKey = searchParams.get('dbKey');
  const [verifiedRole, setVerifiedRole] = useState(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [currentUsername, setCurrentUsername] = useState(null);

  const [isChannelLive, setIsChannelLive] = useState(false); 
  const [streamId, setStreamId] = useState(0);

  // CHANGE B-1: Track the CDN HLS URL from Firebase.
  // When this is null, viewers fall back to RTC (current behavior).
  // Once you add Cloudflare Stream, write the HLS URL to Firebase
  // at rooms/${roomId}/hlsUrl and viewers will switch automatically.
  const [hlsUrl, setHlsUrl] = useState(null);

  useEffect(() => {
    const verifyUserSession = async () => {
        if (!dbKey) { navigate('/'); return; }
        try {
            const snapshot = await get(ref(db, `audience_data/${roomId}/${dbKey}`));
            if (snapshot.exists()) {
                const data = snapshot.val();
                setVerifiedRole(data.role);
                setCurrentUsername(data.username);
            } else {
                navigate('/'); 
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

  const isHost = verifiedRole === 'host';
  const isModerator = verifiedRole === 'moderator';
  const isSpectator = verifiedRole === 'spectator'; 
  
  const [joined, setJoined] = useState(false);     
  const [isStreaming, setIsStreaming] = useState(false); 
  const [videoReady, setVideoReady] = useState(false);   
  const [status, setStatus] = useState("INITIALIZING...");

  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [cameras, setCameras] = useState([]);
  const [cameraFacingMode, setCameraFacingMode] = useState("environment");
  const [showModPanel, setShowModPanel] = useState(false);

  const clientRef = useRef(null);
  const localTracksRef = useRef({ audio: null, video: null });
  const analyticsSessionKey = useRef(null);
  const lastKickNowRef = useRef(null);

  useEffect(() => {
    document.body.style.backgroundColor = "black";
    return () => { document.body.style.backgroundColor = ""; };
  }, []);

  // --- 1. LISTENER: TRACK HOST STATUS ---
  useEffect(() => {
    const liveStatusRef = ref(db, `rooms/${roomId}/isLive`);
    const unsub = onValue(liveStatusRef, (snapshot) => {
        const liveStatus = snapshot.val();
        setIsChannelLive(!!liveStatus);
        if (liveStatus) {
            setStreamId(prev => prev + 1);
        }
    });
    return () => unsub();
  }, [roomId]);

  // CHANGE B-2: Listen for hlsUrl in Firebase.
  // Right now this will always be null (no CDN set up).
  // When you add Cloudflare Stream later:
  //   1. Write the HLS pull URL to rooms/${roomId}/hlsUrl when host goes live
  //   2. Delete it when host ends stream
  //   3. Viewers will automatically switch from RTC to HLS — no more code changes needed
  useEffect(() => {
    if (isHost) return; // Host never needs the HLS URL
    const hlsRef = ref(db, `rooms/${roomId}/hlsUrl`);
    const unsub = onValue(hlsRef, (snapshot) => {
        setHlsUrl(snapshot.val() || null);
    });
    return () => unsub();
  }, [roomId, isHost]);

  useEffect(() => {
    if (!isHost) return;
    const kickRef = ref(db, `rooms/${roomId}/hostModeration/kickNow`);
    return onValue(kickRef, async (snap) => {
      const kickedAt = snap.val();
      if (lastKickNowRef.current === null) {
        lastKickNowRef.current = kickedAt;
        return;
      }
      if (!kickedAt || kickedAt === lastKickNowRef.current) return;
      lastKickNowRef.current = kickedAt;
      try {
        const client = clientRef.current;
        const tracks = [localTracksRef.current.audio, localTracksRef.current.video].filter(Boolean);
        if (client) {
          try { await client.unpublish(tracks); } catch {}
          try { await client.leave(); } catch {}
        }
        try { await update(ref(db, `rooms/${roomId}`), { isLive: false }); } catch {}
        navigate('/');
      } catch {
        navigate('/');
      }
    });
  }, [isHost, roomId, navigate]);

  // --- 2. ANALYTICS SESSION ---
  useEffect(() => {
      if (joined && !analyticsSessionKey.current) {
          analyticsSessionKey.current = startSession(roomId, verifiedRole || 'unknown', verifiedRole);
      }
      return () => {
          if (analyticsSessionKey.current) {
              endSession(roomId, analyticsSessionKey.current);
              analyticsSessionKey.current = null;
          }
      };
  }, [joined, roomId, verifiedRole]);

  // --- AUTO-ARCHIVE EVENT CONFIG ---
  useEffect(() => {
      if (!isHost || !roomId) return;
      const archiveConfig = async () => {
          try {
              const metaRef = ref(db, `rooms/${roomId}/metadata`);
              const metaSnap = await get(metaRef);
              if (!metaSnap.exists()) {
                  const configRef = ref(db, `event_config`);
                  const configSnap = await get(configRef);
                  if (configSnap.exists()) {
                      const { startTime, endTime } = configSnap.val();
                      await update(ref(db, `rooms/${roomId}/metadata`), {
                          startTime: new Date(startTime).getTime(),
                          endTime: new Date(endTime).getTime(),
                          archivedAt: Date.now()
                      });
                  }
              }
          } catch (err) {
              console.error("Failed to archive config", err);
          }
      };
      archiveConfig();
  }, [isHost, roomId]);

  // --- 3. MAIN CONNECTION LOGIC ---
  useEffect(() => {
    // CHANGE B-3: If viewer has an HLS URL, skip RTC entirely.
    // They'll watch via the <video> tag below — zero Agora viewer minutes billed.
    if (!isHost && hlsUrl && isChannelLive) {
        setJoined(true);
        setIsStreaming(true);
        setVideoReady(true);
        setStatus("LIVE");
        return;
    }

    if (!isHost && !isChannelLive) {
        setStatus("WAITING FOR HOST...");
        setJoined(false);
        setIsStreaming(false);
        setVideoReady(false);
        return; 
    }

    let myClient = null;
    let isActive = true;

    const initAgora = async () => {
      try {
        setStatus("CONNECTING...");
        
        let token = null;
        try {
            const response = await fetch(`/api/token?channelName=${roomId}`);
            if (response.ok) {
                const data = await response.json();
                if (data.token) token = data.token;
            } 
        } catch (err) {
            console.warn("API Token Failed, using fallback");
        }

        if (!token) token = AGORA_TOKEN; 
        if (!token) throw new Error("No Agora Token found");

        myClient = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
        clientRef.current = myClient;

        if (isHost) {
          await myClient.setClientRole("host");
          try { setCameras(await AgoraRTC.getCameras()); } catch (e) {}
        } else {
          await myClient.setClientRole("audience", { level: 1 });
        }

        myClient.on("user-published", async (user, mediaType) => {
          if (!isActive) return;
          await myClient.subscribe(user, mediaType);
          if (mediaType === "video") {
              const remoteContainer = document.getElementById("remote-video-container");
              if (remoteContainer) {
                remoteContainer.innerHTML = ''; 
                user.videoTrack.play(remoteContainer, { mirror: true });
                setVideoReady(true);
                setIsStreaming(true);
              }
          }
          if (mediaType === "audio") user.audioTrack.play();
        });

        myClient.on("user-unpublished", (user, mediaType) => {
             if (mediaType === 'video') setIsStreaming(false);
        });

        await myClient.join(AGORA_APP_ID, roomId, token, null);
        
        if (isActive) {
            setJoined(true);
            setStatus(isHost ? "READY TO AIR" : "LIVE");
        }

        // --- HOST CAMERA SETUP ---
        if (isHost) {
          setStatus("STARTING CAMERA...");
          let micTrack, camTrack;
          
          try {
            // CHANGE A: Custom encoder config replacing "720p_1" preset.
            // "720p_1" was requesting 30fps at ~1130 kbps.
            // This config requests 15fps at max 800 kbps — roughly half the bandwidth cost.
            // frameRate: 15 is fine for live commerce (selling products, not sports).
            const tracks = await AgoraRTC.createMicrophoneAndCameraTracks(
                { echoCancellation: true, noiseSuppression: true },
                { encoderConfig: "720p_1", facingMode: cameraFacingMode } // rear/front only
            );
            micTrack = tracks[0];
            camTrack = tracks[1];
          } catch (e) {
            console.warn("HD failed, retrying SD...", e);
            const tracks = await AgoraRTC.createMicrophoneAndCameraTracks(
               undefined,
               { facingMode: cameraFacingMode }
            );
            micTrack = tracks[0];
            camTrack = tracks[1];
          }

          if (!isActive) { 
              micTrack?.close(); camTrack?.close(); return; 
          }

          localTracksRef.current = { audio: micTrack, video: camTrack };
          
          const localContainer = document.getElementById("local-video-container");
          if (localContainer) {
              camTrack.play(localContainer, { mirror: true });
              setVideoReady(true);
              setStatus("READY TO AIR");
          }
        }

      } catch (error) {
        console.error("INIT ERROR:", error);
        if (isActive) setStatus(`ERROR: ${error.message}`);
      }
    };

    initAgora();

    return () => {
      isActive = false;
      const cleanup = async () => {
          if (localTracksRef.current.audio) localTracksRef.current.audio.close();
          if (localTracksRef.current.video) localTracksRef.current.video.close();
          localTracksRef.current = { audio: null, video: null };
          if (myClient) {
              await myClient.unpublish().catch(() => {});
              await myClient.leave().catch(() => {});
              myClient.removeAllListeners();
          }
          clientRef.current = null;
      };
      cleanup();
    };

  }, [roomId, isHost, isHost ? -1 : isChannelLive, hlsUrl]); // CHANGE B-4: added hlsUrl to deps

  const handleToggleStream = async () => {
      if (!clientRef.current) return;
      const tracks = [localTracksRef.current.audio, localTracksRef.current.video].filter(Boolean);
      try {
          if (isStreaming) {
              setStatus("STOPPING...");
              await clientRef.current.unpublish(tracks);
              setIsStreaming(false);
              setStatus("READY TO AIR");
              // CHANGE B-5: Clear hlsUrl from Firebase when stream ends.
              // Right now hlsUrl is always null so this is a no-op.
              // When you set up Cloudflare Stream, this will also clear the viewer HLS path.
              await update(ref(db, `rooms/${roomId}`), { isLive: false, hlsUrl: null });
          } else {
              setStatus("PUBLISHING...");
              if (localTracksRef.current.audio) await localTracksRef.current.audio.setEnabled(true);
              await clientRef.current.publish(tracks);
              setIsStreaming(true);
              setStatus("LIVE");
              // CHANGE B-6: When you set up Cloudflare Stream, add your HLS pull URL here:
              // await update(ref(db, `rooms/${roomId}`), { 
              //   isLive: true, 
              //   hlsUrl: `https://customer-xxx.cloudflarestream.com/${roomId}/manifest/video.m3u8`
              // });
              // For now, just sets isLive (existing behavior).
              await update(ref(db, `rooms/${roomId}`), { isLive: true });
          }
      } catch (err) {
          console.error("Toggle Error:", err);
          setStatus("ERROR: " + err.message);
      }
  };

  const switchCamera = async () => {
    if (!localTracksRef.current.video) return;
    try {
      const currentTrack = localTracksRef.current.video;
      const nextFacingMode = cameraFacingMode === "environment" ? "user" : "environment";
      await currentTrack.setDevice({ facingMode: nextFacingMode });
      setCameraFacingMode(nextFacingMode);
      const localContainer = document.getElementById("local-video-container");
      if (localContainer) {
        localContainer.innerHTML = "";
        currentTrack.play(localContainer, { mirror: true });
      }
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

  const isLoading = isHost ? !videoReady : (!joined && isChannelLive);

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
    <div className="fixed inset-0 w-full h-[100dvh] bg-black text-white overflow-hidden supports-[height:100dvh]:h-[100dvh]">
      
      {/* LAYER 1: VIDEO */}
      <div className="absolute inset-0 z-0 max-w-md mx-auto w-full bg-black">
        <div id="local-video-container" className={`w-full h-full ${!isHost ? 'hidden' : ''}`}></div>
        
        {/* CHANGE B-7: Viewer video layer.
            - If hlsUrl exists: renders a plain <video> tag. Zero Agora billing for this viewer.
            - If hlsUrl is null (current state): renders the RTC container as before.
            No visual difference to the viewer either way. */}
        {!isHost && hlsUrl ? (
          // CDN path — viewer watches HLS, not billed as Agora RTC user
          <video
            key={streamId}
            src={hlsUrl}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
            onCanPlay={() => { setVideoReady(true); setIsStreaming(true); }}
          />
        ) : (
          // RTC path — current behavior, falls back to this until CDN is set up
          <div 
            key={streamId} 
            id="remote-video-container" 
            className={`w-full h-full ${isHost ? 'hidden' : ''}`}
          ></div>
        )}
        
        {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black z-20 flex-col gap-4">
                <span className="font-mono text-xs animate-pulse">CONNECTING...</span>
                <span className="font-mono text-[10px] text-yellow-500 uppercase">{status}</span>
            </div>
        )}

        {!isHost && !isChannelLive && (
             <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10 flex-col gap-4">
                <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse shadow-[0_0_10px_red]"></div>
                <span className="font-display font-black text-2xl uppercase text-zinc-500">OFF AIR</span>
                <span className="font-mono text-xs text-zinc-600 tracking-widest">WAITING FOR SIGNAL...</span>
             </div>
        )}
      </div>

      {/* LAYER 2: INTERACTION */}
      <InteractionLayer 
          roomId={roomId} 
          isHost={isHost} 
          isModerator={isModerator}
          isSpectator={isSpectator} 
          assignedUsername={currentUsername}
      />

      {/* LAYER 3: SYSTEM CONTROLS */}
      <div className="absolute inset-0 z-50 pointer-events-none p-4 pt-[calc(1rem+env(safe-area-inset-top))] flex flex-col justify-between max-w-md mx-auto w-full">
        
        <div className="flex justify-between items-start pointer-events-auto">
            <div className="flex flex-col items-start gap-0.5">
                <img src="/Dibs. (1).svg" alt="Dibs" className="w-28 -ml-4 -mt-7 block"/>
                <div className={`-mt-5 px-2 py-0.5 rounded-sm flex items-center gap-2 ${isStreaming ? 'bg-red-600' : 'bg-neutral-800'}`}>
                    <span className="font-display font-black text-xs camelcase tracking-widest text-white">
                        {isStreaming ? 'LIVE' : 'OFFLINE'}
                    </span>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                 {isModerator && (
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

        {isHost && videoReady && (
            <button
              onClick={handleToggleStream}
              className={`absolute right-4 pointer-events-auto h-14 w-14 rounded-full transition-transform hover:scale-105 shadow-2xl flex items-center justify-center z-[60] ${
                isStreaming
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-white text-black hover:bg-zinc-100'
              }`}
              style={{ bottom: 'calc(6.25rem + env(safe-area-inset-bottom))' }}
              title={isStreaming ? 'End Stream' : 'Go Live'}
              aria-label={isStreaming ? 'End Stream' : 'Go Live'}
            >
              {isStreaming ? (
                <Square className="w-5 h-5 fill-current" />
              ) : (
                <Radio className="w-5 h-5 text-red-600 animate-pulse" />
              )}
            </button>
        )}
        
        {isModerator && showModPanel && (
          <ModeratorPanel roomId={roomId} onClose={() => setShowModPanel(false)} />
        )}
      </div>
    </div>
  );
};
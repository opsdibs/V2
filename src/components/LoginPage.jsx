import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, AlertCircle, Key, Mail, Clock, Lock } from 'lucide-react'; // Added Clock/Lock
import { ref, push, set, get } from 'firebase/database';
import { db } from '../lib/firebase';

// --- 1. COIN STACK ANIMATION (Unchanged) ---
const CoinStackLoader = ({ onComplete }) => {
  const [coinCount, setCoinCount] = useState(0);
  const [phase, setPhase] = useState('stacking');
  const totalCoins = 5;

  useEffect(() => {
    if (phase === 'stacking') {
        const interval = setInterval(() => {
            setCoinCount(prev => {
                if (prev >= totalCoins) {
                    clearInterval(interval);
                    setPhase('hammer');
                    return prev;
                }
                return prev + 1;
            });
        }, 200);
        return () => clearInterval(interval);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === 'hammer') {
        const timer = setTimeout(() => { setPhase('impact'); }, 400); 
        return () => clearTimeout(timer);
    }
    if (phase === 'impact') {
        const timer = setTimeout(() => { onComplete(); }, 1500);
        return () => clearTimeout(timer);
    }
  }, [phase, onComplete]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-[#FF6600] text-white overflow-hidden">
       <motion.div
         className="font-mono text-[10px] uppercase tracking-[0.3em] text-white mb-4 absolute top-24"
         animate={{ opacity: phase === 'impact' ? 0 : [0.4, 1, 0.4] }}
       >
         LOADING
       </motion.div>

       <div className="relative h-64 w-full flex items-end justify-center mt-10">
         <AnimatePresence>
           {phase !== 'impact' && Array.from({ length: coinCount }).map((_, i) => (
             <motion.div
                key={i}
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ scale: 0, opacity: 0, transition: { duration: 0.1 } }}
                className="absolute w-48 h-12 bg-white"
                style={{ 
                    bottom: i * 14, 
                    zIndex: i,
                    clipPath: 'polygon(10% 0, 90% 0, 100% 20%, 100% 80%, 90% 100%, 10% 100%, 0 80%, 0 20%)',
                    boxShadow: '0 0 0 2px #FF6600 inset, 0 0 0 4px white inset'
                }} 
            />
           ))}
         </AnimatePresence>

         <AnimatePresence>
           {phase === 'hammer' && (
               <motion.div
                    className="absolute -right-4 bottom-0 origin-bottom z-50"
                    initial={{ rotate: 25, opacity: 0, scale: 0.9 }}
                    animate={{ rotate: -64, opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    transition={{ duration: 0.4, ease: "backIn" }}
                >
                    <div className="relative w-64 h-60">
                        <div className="absolute left-1/2 bottom-0 w-4 h-60 bg-white -translate-x-1/2 border-4 border-black"></div>
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-20 bg-white origin-bottom border-4 border-black"></div>
                    </div>
                </motion.div>
           )}
         </AnimatePresence>

         {phase === 'impact' && (
           <motion.div
               initial={{ scale: 0, rotate: -10 }}
               animate={{ scale: 1, rotate: 0 }}
               transition={{ type: "spring", stiffness: 400, damping: 15 }}
               className="absolute inset-0 flex items-center justify-center z-50"
           >
               <h1 
                className="text-7xl font-display font-black leading-[0.85] tracking-tight text-white select-none mix-blend-normal"
                style={{ textShadow: '8px 8px 0px #000000' }}
               >
                DIBS!
               </h1>
           </motion.div>
         )}
       </div>
    </div>
  );
};

// --- 2. WAITING ROOM SCREEN (The "Blocked" State) ---
const WaitingScreen = ({ message, nextEvent }) => {
    // Simple creative message for now
    return (
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="flex flex-col items-center justify-center w-full h-full px-6 z-20 relative text-center space-y-8"
        >
            <Lock className="w-16 h-16 text-white animate-pulse" />
            
            <div className="space-y-4">
                <h1 className="text-5xl font-display font-black text-white uppercase tracking-tight leading-none">
                    DOORS ARE<br/>CLOSED
                </h1>
                <p className="font-mono text-sm uppercase tracking-widest text-white/80 max-w-xs mx-auto leading-relaxed border-t border-b border-white/20 py-4">
                    {message || "THE AUCTION HAS NOT STARTED YET."}
                </p>
            </div>

            {nextEvent && (
                <div className="bg-white/10 p-4 rounded-xl border border-white/20">
                     <p className="font-mono text-[10px] uppercase text-white/60 mb-1">Next Drop</p>
                     <p className="font-mono text-lg font-bold text-white">
                        {new Date(nextEvent).toLocaleString('en-US', { 
                            month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true 
                        })}
                     </p>
                </div>
            )}
        </motion.div>
    );
};

// --- 3. MAIN LOGIN PAGE ---
export const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room') || "CHIC";

  const [currentScreen, setCurrentScreen] = useState('splash'); // splash | login | waiting
  const [waitingMessage, setWaitingMessage] = useState("");
  const [nextEventTime, setNextEventTime] = useState(null);

  // Form State
  const [email, setEmail] = useState("");
  const [authKey, setAuthKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleSmartLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const inputEmail = email.trim().toLowerCase();
    const inputKey = authKey.trim();

    if (!validateEmail(inputEmail)) { 
        setError("Invalid Email Format"); 
        setLoading(false); return; 
    }
    if (!inputKey) {
        setError("Please enter Phone Number or Password");
        setLoading(false); return;
    }

    // Credentials
    const HOST_EMAIL = (import.meta.env.VITE_HOST_EMAIL || "").toLowerCase();
    const HOST_PWD = import.meta.env.VITE_HOST_PWD;
    const MOD_EMAIL = (import.meta.env.VITE_MODERATOR_EMAIL || "").toLowerCase();
    const MOD_PWD = import.meta.env.VITE_MODERATOR_PWD;

    let finalRole = 'audience';
    let userId = '';
    let userPhone = '';

    // --- 1. HOST/MOD CHECK (ALWAYS ALLOWED) ---
    if (inputEmail === HOST_EMAIL && inputKey === HOST_PWD) {
         finalRole = 'host'; userId = 'HOST'; userPhone = 'N/A';
         await joinRoom(finalRole, userId, userPhone, inputEmail);
         return;
    }
    if (inputEmail === MOD_EMAIL && inputKey === MOD_PWD) {
         finalRole = 'moderator'; userId = 'MODERATOR'; userPhone = 'N/A';
         await joinRoom(finalRole, userId, userPhone, inputEmail);
         return;
    }

    // --- 2. AUDIENCE GATEKEEPER ---
    const cleanPhone = inputKey.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length < 10) {
        setError("Invalid Phone Number"); setLoading(false); return;
    }

    try {
        // A. Check TEST LIST (Always Allowed)
        const testGuestRef = ref(db, `test_allowed_guests/${cleanPhone}`);
        const testSnapshot = await get(testGuestRef);

        if (testSnapshot.exists()) {
             if (testSnapshot.val().email.toLowerCase() === inputEmail) {
                 console.log("Test User Detected - Bypassing Time Check");
                 finalRole = 'audience';
                 userId = `TEST-${cleanPhone}`;
                 userPhone = cleanPhone;
                 await joinRoom(finalRole, userId, userPhone, inputEmail);
                 return;
             } else {
                 setError("Test Email mismatch."); setLoading(false); return;
             }
        }

        // B. Check REGULAR LIST (Time Restricted)
        const guestRef = ref(db, `allowed_guests/${cleanPhone}`);
        const snapshot = await get(guestRef);

        if (!snapshot.exists()) {
            setError("Phone number not registered."); setLoading(false); return;
        }
        if (snapshot.val().email.toLowerCase() !== inputEmail) {
            setError("Email does not match records."); setLoading(false); return;
        }

        // C. TIME CHECK
        const configRef = ref(db, `event_config`);
        const configSnap = await get(configRef);
        
        if (configSnap.exists()) {
            const config = configSnap.val();
            const now = new Date();
            const start = new Date(config.startTime);
            const end = new Date(config.endTime);

            // Maintenance Mode?
            if (config.isMaintenanceMode) {
                setWaitingMessage("SYSTEM UNDER MAINTENANCE.");
                setCurrentScreen('waiting');
                setLoading(false);
                return;
            }

            // Too Early?
            if (now < start) {
                setWaitingMessage("WAIT FOR THE NEXT DROP.");
                setNextEventTime(config.startTime);
                setCurrentScreen('waiting');
                setLoading(false);
                return;
            }

            // Too Late?
            if (now > end) {
                setWaitingMessage("THIS EVENT HAS ENDED.");
                setCurrentScreen('waiting');
                setLoading(false);
                return;
            }
        }
        // If config doesn't exist, we assume OPEN (or you can fail safe to closed)
        
        // D. PASS -> Join
        finalRole = 'audience';
        userId = `USER-${cleanPhone}`;
        userPhone = cleanPhone;
        await joinRoom(finalRole, userId, userPhone, inputEmail);

    } catch (err) {
        console.error(err); 
        setError("System Error. Try again."); 
        setLoading(false); 
    }
  };

  const joinRoom = async (role, uId, phone, mail) => {
    try {
        const userRef = push(ref(db, `audience_data/${roomId}`));
        await set(userRef, {
            email: mail, phone: phone, role: role, userId: uId, joinedAt: Date.now(),
            restrictions: { isMuted: false, isBidBanned: false, isKicked: false }
        });
        navigate(`/room/${roomId}?dbKey=${userRef.key}`);
    } catch (err) {
        setError("Failed to join."); setLoading(false);
    }
  };

  return (
    <div className="w-full h-screen bg-[#FF6600] text-white relative overflow-hidden font-sans">
      <AnimatePresence mode="wait">
        
        {/* SCREEN 1: SPLASH */}
        {currentScreen === 'splash' && (
           <CoinStackLoader key="splash" onComplete={() => setCurrentScreen('login')} />
        )}
        
        {/* SCREEN 2: WAITING ROOM (BLOCKED) */}
        {currentScreen === 'waiting' && (
            <WaitingScreen key="waiting" message={waitingMessage} nextEvent={nextEventTime} />
        )}

        {/* SCREEN 3: LOGIN FORM */}
        {currentScreen === 'login' && (
            <motion.div 
                key="form"
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                className="flex flex-col items-center justify-center w-full h-full px-6 z-20 relative"
            >
                <div className="flex-1 flex flex-col items-center justify-center w-full relative px-6 space-y-2">
                    
                    {/* EXACT HEADER */}
                    <h1 
                        className="text-8xl font-display font-black leading-[0.85] tracking-tight text-white select-none mix-blend-normal"
                        style={{ textShadow: '8px 8px 0px #000000' }}
                    >
                    DIBS!
                    </h1>
                    <p className="text-sm font-bold tracking-[0.3em] text-white uppercase font-sans opacity-90">
                    ONE PIECE ONE CHANGE
                    </p>

                    {/* INPUTS */}
                    <div className="w-full max-w-xs mt-12 space-y-4">
                        <input
                            type="email"
                            placeholder="EMAIL ADDRESS"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-white/20 border-b-2 border-white text-white font-mono text-center py-4 focus:outline-none focus:bg-white/30 transition-colors placeholder:text-white/60"
                        />
                        
                        <input
                            type="text"
                            placeholder="PHONE / PASSWORD"
                            value={authKey}
                            onChange={(e) => setAuthKey(e.target.value)}
                            className="w-full bg-white/20 border-b-2 border-white text-white font-mono text-center py-4 focus:outline-none focus:bg-white/30 transition-colors uppercase placeholder:text-white/60"
                        />

                        {/* ERROR MSG */}
                        <AnimatePresence>
                            {error && (
                                <motion.div 
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="flex items-center justify-center gap-2 text-white bg-black/20 p-2 border border-white/20"
                                >
                                    <AlertCircle className="w-3 h-3" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">{error}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* BUTTON */}
                        <button 
                            onClick={handleSmartLogin}
                            disabled={loading}
                            className="w-full py-4 border-2 border-white hover:bg-white hover:text-[#FF6600] transition-colors flex flex-col items-center gap-2 group mt-4"
                        >
                            {loading ? (
                                <span className="font-mono text-[10px] tracking-widest uppercase font-bold animate-pulse">CHECKING STATUS...</span>
                            ) : (
                                <>
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                    <span className="font-mono text-[10px] tracking-widest uppercase font-bold">ENTER ROOM</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
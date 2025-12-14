import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Mail, AlertCircle, Key } from 'lucide-react';
import { ref, push, set, get } from 'firebase/database';
import { db } from '../lib/firebase';

// --- 1. COIN STACK ANIMATION (Source: WelcomePage.jsx) ---
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
       {/* LOADING TEXT */}
       <motion.div
         className="font-mono text-[10px] uppercase tracking-[0.3em] text-white mb-4 absolute top-24"
         animate={{ opacity: phase === 'impact' ? 0 : [0.4, 1, 0.4] }}
       >
         LOADING
       </motion.div>

       <div className="relative h-64 w-full flex items-end justify-center mt-10">
         {/* Coins */}
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

         {/* Hammer */}
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

         {/* Impact - THE LOGO REVEAL */}
         {phase === 'impact' && (
           <motion.div
               initial={{ scale: 0, rotate: -10 }}
               animate={{ scale: 1, rotate: 0 }}
               transition={{ type: "spring", stiffness: 400, damping: 15 }}
               className="absolute inset-0 flex items-center justify-center z-50"
           >
               {/* CORRECT LOGO STYLE FROM WELCOME PAGE */}
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

// --- 2. MAIN LOGIN PAGE ---
export const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room') || "CHIC";

  const [showSplash, setShowSplash] = useState(true); 

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
        setError("Please enter the registered Phone Number");
        setLoading(false); return;
    }

    // Credentials
    const HOST_EMAIL = (import.meta.env.VITE_HOST_EMAIL).toLowerCase();
    const HOST_PWD = import.meta.env.VITE_HOST_PWD;
    const MOD_EMAIL = (import.meta.env.VITE_MODERATOR_EMAIL).toLowerCase();
    const MOD_PWD = import.meta.env.VITE_MODERATOR_PWD;

    let finalRole = 'audience';
    let userId = '';
    let userPhone = '';

    // LOGIC
    if (inputEmail === HOST_EMAIL) {
        if (inputKey === HOST_PWD) {
            finalRole = 'host'; userId = 'HOST'; userPhone = 'N/A';
        } else {
            setError("Invalid Host Password"); setLoading(false); return;
        }
    }
    else if (inputEmail === MOD_EMAIL) {
        if (inputKey === MOD_PWD) {
            finalRole = 'moderator'; userId = 'MODERATOR'; userPhone = 'N/A';
        } else {
            setError("Invalid Moderator Password"); setLoading(false); return;
        }
    }
    else {
        // Audience Check
        const cleanPhone = inputKey.replace(/\D/g, '').slice(-10);
        if (cleanPhone.length < 10) {
            setError("Invalid Phone Number"); setLoading(false); return;
        }

        try {
            const guestRef = ref(db, `allowed_guests/${cleanPhone}`);
            const snapshot = await get(guestRef);

            if (!snapshot.exists()) {
                setError("Phone number not registered."); setLoading(false); return;
            }
            if (snapshot.val().email.toLowerCase() !== inputEmail) {
                setError("Email not registered."); setLoading(false); return;
            }

            finalRole = 'audience';
            userId = `USER-${cleanPhone}`;
            userPhone = cleanPhone;
        } catch (err) {
            console.error(err); setError("Database Error"); setLoading(false); return;
        }
    }

    // JOIN ROOM
    try {
        const userRef = push(ref(db, `audience_data/${roomId}`));
        await set(userRef, {
            email: inputEmail, phone: userPhone, role: finalRole, userId, joinedAt: Date.now(),
            restrictions: { isMuted: false, isBidBanned: false, isKicked: false }
        });
        navigate(`/room/${roomId}?dbKey=${userRef.key}`);
    } catch (err) {
        setError("Failed to join."); setLoading(false);
    }
  };

  return (
    <div className="w-full h-screen bg-[#FF6600] text-white relative overflow-hidden">
      <AnimatePresence mode="wait">
        
        {/* STEP 1: ANIMATION */}
        {showSplash ? (
            <motion.div 
                key="splash"
                className="absolute inset-0 z-50"
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
            >
                <CoinStackLoader onComplete={() => setShowSplash(false)} />
            </motion.div>
        ) : (
            
        /* STEP 2: LOGIN FORM */
            <motion.div 
                key="form"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center w-full h-full px-6 z-20 relative"
            >
                <div className="w-full max-w-sm space-y-8">
                    {/* LOGO HEADER (Matching the animation end state) */}
                    <div className="text-center space-y-2">
                        <h1 
                            className="text-8xl font-display font-black leading-[0.85] tracking-tight text-white select-none mix-blend-normal"
                            style={{ textShadow: '8px 8px 0px #000000' }}
                        >
                        DIBS!
                        </h1>
                        <p className="text-sm font-bold tracking-[0.3em] text-white uppercase font-sans opacity-90">
                        ONE PIECE ONE CHANGE
                        </p>
                    </div>

                    {/* FORM */}
                    <form onSubmit={handleSmartLogin} className="space-y-6 mt-12">
                        
                        <div className="space-y-1">
                            <label className="text-[10px] font-mono text-white/90 uppercase ml-2 tracking-wider">Email</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-3.5 w-4 h-4 text-white" />
                                <input 
                                    type="email" 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@example.com"
                                    className="w-full bg-white/20 border-b-2 border-white/50 rounded-t-lg py-3 pl-10 pr-4 text-sm font-mono text-white focus:outline-none focus:bg-white/30 focus:border-white transition-all placeholder:text-white/60"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-mono text-white/90 uppercase ml-2 tracking-wider">
                                Phone Number
                            </label>
                            <div className="relative group">
                                <Key className="absolute left-4 top-3.5 w-4 h-4 text-white" />
                                <input 
                                    type="text" 
                                    value={authKey} 
                                    onChange={(e) => setAuthKey(e.target.value)} 
                                    placeholder="9876543210" 
                                    className="w-full bg-white/20 border-b-2 border-white/50 rounded-t-lg py-3 pl-10 pr-4 text-sm font-mono text-white focus:outline-none focus:bg-white/30 focus:border-white transition-all placeholder:text-white/60"
                                />
                            </div>
                        </div>

                        <AnimatePresence>
                            {error && (
                                <motion.div 
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="flex items-center gap-2 text-white bg-black/20 p-3 rounded-lg border border-white/20"
                                >
                                    <AlertCircle className="w-4 h-4" />
                                    <span className="text-xs font-bold uppercase">{error}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full bg-white text-[#FF6600] font-black uppercase tracking-widest py-4 rounded-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 mt-8 shadow-xl"
                        >
                            {loading ? (
                                <span className="animate-pulse">Verifying...</span>
                            ) : (
                                <>
                                    <span>ENTER ROOM</span>
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
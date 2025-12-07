import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Lock, Phone, Mail, AlertCircle, Key } from 'lucide-react';
import { ref, push, set, get } from 'firebase/database';
import { db } from '../lib/firebase';

export const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const roomId = searchParams.get('room');
  const role = searchParams.get('role');

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePhone = (phone) => /^\d{10,}$/.test(phone); 

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // 1. Common Validation
    if (!validateEmail(email)) { 
        setError("Invalid Email Format"); 
        setLoading(false); 
        return; 
    }

    // Define Credentials
    const HOST_EMAIL = import.meta.env.VITE_HOST_EMAIL;
    const HOST_PWD = import.meta.env.VITE_HOST_PWD;
    
    const MOD_EMAIL = import.meta.env.VITE_MODERATOR_EMAIL;
    const MOD_PWD = import.meta.env.VITE_MODERATOR_PWD;    
    let finalRole = role; 
    let userId;
    let userPhone = phone; // Store phone for audience, empty for host

    // ---------------------------------------------
    // OPTION A: HOST / MODERATOR LOGIN (Email + Pwd)
    // ---------------------------------------------
    if (role === 'host') {
        if (!password) {
            setError("Password is required.");
            setLoading(false); return;
        }

        const inputEmail = email.toLowerCase();
        
        // Check Host Credentials
        if (inputEmail === HOST_EMAIL.toLowerCase() && password === HOST_PWD) {
            finalRole = 'host';
            userId = 'HOST';
            userPhone = "N/A"; // No phone needed
        } 
        // Check Moderator Credentials
        else if (inputEmail === MOD_EMAIL.toLowerCase() && password === MOD_PWD) {
            finalRole = 'moderator';
            userId = 'MODERATOR';
            userPhone = "N/A"; // No phone needed
        } 
        else {
            setError("Invalid Email or Password.");
            setLoading(false); return;
        }
    } 
    // ---------------------------------------------
    // OPTION B: AUDIENCE LOGIN (Phone Verification)
    // ---------------------------------------------
    else {
        if (!validatePhone(phone)) { 
            setError("Invalid Phone Number"); 
            setLoading(false); return; 
        }

        const cleanInputPhone = phone.replace(/\D/g, '').slice(-10);
        const guestRef = ref(db, `allowed_guests/${cleanInputPhone}`);
        const snapshot = await get(guestRef);

        if (!snapshot.exists()) {
             setError("Phone number not registered.");
             setLoading(false); return;
        }

        const guestData = snapshot.val();
        if (guestData.email.toLowerCase() !== email.trim().toLowerCase()) {
            setError("Email does not match our records.");
            setLoading(false); return;
        }

        userId = `USER-${cleanInputPhone}`;
    }

    // 3. Success -> Create Session
    try {
        const userRef = push(ref(db, `audience_data/${roomId}`));
        await set(userRef, {
            email, 
            phone: userPhone, 
            role: finalRole, 
            userId, 
            joinedAt: Date.now(),
            restrictions: { isMuted: false, isBidBanned: false, isKicked: false }
        });
        navigate(`/room/${roomId}?role=${finalRole}&uid=${userId}&dbKey=${userRef.key}`);
    } catch (err) {
        console.error(err); setError("Connection Failed"); setLoading(false);
    }
  };

  // ... (Render UI remains unchanged) ...
  return (
    // ... (Use your existing UI code here) ...
    // Just replace the handleLogin function above inside your existing component
    <div className="w-full h-screen bg-[#FF6600] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* ... keep your existing UI ... */}
      {/* I am omitting the full UI code to save space, as only handleLogin changed */}
      {/* Use the full UI from the previous correct merge if you need to copy-paste the whole file */}
       <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-8 z-10"
      >
        {/* Header */}
        <div className="text-center space-y-2">
            <h1 className="font-display font-black text-4xl tracking-tighter uppercase">
                {role === 'host' ? 'Host Access' : 'Viewer Entry'}
            </h1>
            <p className="font-mono text-xs text-white/80 uppercase tracking-widest">
                {role === 'host' ? 'Restricted Area' : 'Enter Details to Join'}
            </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
            
            {/* Email Input */}
            <div className="space-y-1">
                <label className="text-[10px] font-mono text-white uppercase ml-2">Email Address</label>
                <div className="relative group">
                    <Mail className="absolute left-4 top-3.5 w-4 h-4 text-white" />
                    <input 
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full bg-white/20 border border-white rounded-xl py-3 pl-10 pr-4 text-sm font-mono text-white focus:outline-none focus:bg-white/30 transition-colors placeholder:text-white/50"
                    />
                </div>
            </div>

            {/* Conditional Input: Password (Host) vs Phone (Audience) */}
            <div className="space-y-1">
                <label className="text-[10px] font-mono text-white uppercase ml-2">
                    {role === 'host' ? 'Access Password' : 'Phone Number'}
                </label>
                <div className="relative group">
                    {role === 'host' ? (
                        <>
                            <Key className="absolute left-4 top-3.5 w-4 h-4 text-white" />
                            <input 
                                type="password" 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                placeholder="••••••••" 
                                className="w-full bg-white/20 border border-white rounded-xl py-3 pl-10 pr-4 text-sm font-mono text-white focus:outline-none focus:bg-white/30 transition-colors placeholder:text-white/50"
                            />
                        </>
                    ) : (
                        <>
                            <Phone className="absolute left-4 top-3.5 w-4 h-4 text-white" />
                            <input 
                                type="tel" 
                                value={phone} 
                                onChange={(e) => setPhone(e.target.value)} 
                                placeholder="9876543210" 
                                className="w-full bg-white/20 border border-white rounded-xl py-3 pl-10 pr-4 text-sm font-mono text-white focus:outline-none focus:bg-white/30 transition-colors placeholder:text-white/50"
                            />
                        </>
                    )}
                </div>
            </div>

            {/* Error Message */}
            <AnimatePresence>
                {error && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="flex items-center gap-2 text-white bg-white/20 p-3 rounded-lg border border-white"
                    >
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase">{error}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Submit Button */}
            <button 
                type="submit"
                disabled={loading}
                className="w-full bg-white text-[#FF6600] font-black uppercase tracking-widest py-4 rounded-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 mt-4 shadow-lg"
            >
                {loading ? (
                    <span className="animate-pulse">Verifying...</span>
                ) : (
                    <>
                        <span>{role === 'host' ? 'Verify Identity' : 'Enter Room'}</span>
                        {role === 'host' ? <Lock className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                    </>
                )}
            </button>

        </form>
      </motion.div>
    </div>
  );
};
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Lock, Phone, Mail, AlertCircle } from 'lucide-react';
import { ref, push, set, get } from 'firebase/database';
import { db } from '../lib/firebase';

export const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const roomId = searchParams.get('room');
  const role = searchParams.get('role');

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePhone = (phone) => /^\d{10,}$/.test(phone); 

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!validateEmail(email)) {
        setError("Invalid Email Format");
        setLoading(false);
        return;
    }
    if (!validatePhone(phone)) {
        setError("Invalid Phone Number (Min 10 digits)");
        setLoading(false);
        return;
    }
    const allowedHost = import.meta.env.VITE_HOST_EMAIL;
    const allowedModerator = import.meta.env.VITE_MODERATOR_EMAIL;
    let finalRole = role; // Default to current selection (e.g., 'audience')
    let userId;
    // HOST GATEKEEPING
    if (role === 'host') {
        const inputEmail = email.toLowerCase();
        if (inputEmail === allowedHost.toLowerCase()) {
            // It is the Host
            finalRole = 'host';
            userId = 'HOST';
        } 
        else if (inputEmail === allowedModerator.toLowerCase()) {
            // It is the Moderator -> Switch Role
            finalRole = 'moderator';
            userId = 'MODERATOR';
        }

        else {
            alert("ACCESS DENIED: Unauthorized Host Email");
            setLoading(false); 
            return;
        }
    }
    // AUDIENCE CHECK (Secure Direct Database Lookup)
    else {
        // 1. Clean input to match DB format (Last 10 digits)
        const cleanInputPhone = phone.replace(/\D/g, '').slice(-10);
        
        // 2. Direct lookup: Check if this specific phone number exists as a key
        const guestRef = ref(db, `allowed_guests/${cleanInputPhone}`);
        const snapshot = await get(guestRef);

        if (!snapshot.exists()) {
             setError("Phone number not registered.");
             setLoading(false); 
             return;
        }

        // 3. Verify Email Match
        const guestData = snapshot.val();
        if (guestData.email.toLowerCase() !== email.trim().toLowerCase()) {
            setError("Email does not match our records.");
            setLoading(false); 
            return;
        }

        // 4. Success
        userId = `USER-${cleanInputPhone}`;
    }
    try {
        // Save session data to Firebase (So Moderator can see this user in the list)
        // We capture the database key (userRef.key) to allow banning/kicking later
        const userRef = push(ref(db, `audience_data/${roomId}`));
        await set(userRef, {
            email,
            phone,
            role: finalRole,
            userId,
            joinedAt: Date.now(),
            restrictions: { isMuted: false, isBidBanned: false, isKicked: false }
        });

        // Navigate with the determined role and IDs
        navigate(`/room/${roomId}?role=${finalRole}&uid=${userId}&dbKey=${userRef.key}`);

    } catch (err) {
        console.error("Login Error:", err);
        setError("Connection Failed. Try again.");
        setLoading(false);
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

            {/* Phone Input */}
            <div className="space-y-1">
                <label className="text-[10px] font-mono text-white uppercase ml-2">Phone Number</label>
                <div className="relative group">
                    <Phone className="absolute left-4 top-3.5 w-4 h-4 text-white" />
                    <input 
                        type="tel" 
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="9876543210"
                        className="w-full bg-white/20 border border-white rounded-xl py-3 pl-10 pr-4 text-sm font-mono text-white focus:outline-none focus:bg-white/30 transition-colors placeholder:text-white/50"
                    />
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
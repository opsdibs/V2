import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ChevronUp, ChevronDown, Clock, Play, Square, Eye } from 'lucide-react'; 
import { ref, push, onValue, runTransaction, update, set, onDisconnect, remove, get } from 'firebase/database'; 
import { db } from '../lib/firebase';

// --- DATABASE OF NAMES ---
const quirky_usernames = [
    "Thrift_Shift", "Holy_Shift_Dress", "Thrifty_Cent", "Fit_Check_Mate", "Pop_The_Tags",
    "Deja_Shoe", "Second_Hand_Stan", "Re_Wear_It", "Shifty_Thrifty", "Oh_Crop_Top",
    "Jean_Pool", "Clothes_Call", "Shearling_Darling", "Sole_Survivor", "Sweater_Weather_4Eva",
    "Knot_New", "Vest_Dressed", "Good_Jeans", "Totes_Ma_Goats", "Dye_Hard_Vintage",
    "Bidder_Sweet", "Going_Twice_Nice", "The_Snipe_Life", "Hammer_Time_Fits", "Sold_To_The_Babe",
    "Bid_Bandit", "Gavel_Gravel", "Last_Call_Haul", "The_Highest_Bid", "Auction_Addiction",
    "Snipe_City", "Bid_War_Winner", "One_Dollar_Holler", "The_Outbidder", "Fast_Finger_Finds",
    "Going_Going_Gone_Girl", "Sold_Soul", "Auction_Action_Hero", "Bid_Zilla", "Final_Countdown_Fits",
    "Bin_Diver_Diva", "Rack_Rat", "The_Hanger_Hunter", "Gold_Dust_Garms", "Needle_In_A_Haystack",
    "Scavenger_Style", "Forage_And_Fashion", "Hidden_Gem_Hem", "The_Rummage_Room", "Digging_For_Drip",
    "Treasure_Troll", "The_Finder_Keeper", "Rag_Trade_Raider", "Curated_Chaos", "Stash_Gordon",
    "The_Hoard_Lord", "Pile_Driver", "Heap_Of_Chic", "Salvage_Savage", "Dust_Bunny_Finds",
    "Retro_Grade", "Grandma_Core", "Mothball_Mafia", "Y2K_Chaos", "90s_Nightmare",
    "Vintage_Vulture", "Old_Soul_New_Drip", "Past_Perfect_Fits", "Retro_Rocket", "Nostalgia_Nook",
    "Time_Travel_Tees", "Blast_From_The_Past", "Analog_Apparel", "VHS_Vest", "Cassette_Closet",
    "Disco_Nap_Duds", "Flower_Power_Hour", "Shoulder_Pad_Squad", "Acid_Wash_Ash", "Corduroy_Royalty",
    "Wrinkled_Shirt", "Someone_Elses_Pants", "The_Dead_Stock", "Ghost_In_The_Garment", "Velvet_Vortex",
    "Polyester_Princess", "Lint_Roller_Lover", "Preloved_Plot", "Second_Story_Style", "The_Re_Run",
    "Epilogue_Outfits", "Sequel_Style", "Zero_New", "Slow_Mo_Fashion", "Earthy_Threads",
    "Conscious_Closet", "Upcycle_Psycho", "Button_Masher", "Zipper_Ripper", "Fabric_Phantom"
];

export const InteractionLayer = ({ roomId, isHost }) => {
  // UI State
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [currentBid, setCurrentBid] = useState(0);
  const [customBid, setCustomBid] = useState(10);
  const [viewerCount, setViewerCount] = useState(0);
  
  // Identity State
  const [username, setUsername] = useState("");
  
  // Auction State
  const [isAuctionActive, setIsAuctionActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30); 
  const [endTime, setEndTime] = useState(0);

  // REFS
  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  
  // Logic Refs (Fixes Stale State)
  const isAuctionActiveRef = useRef(false);
  const currentBidRef = useRef(0); 

  // --- 0. ASSIGN USERNAME ON MOUNT ---
  useEffect(() => {
      if (isHost) {
          setUsername("HOST");
      } else {
          // Pick random name
          const randomName = quirky_usernames[Math.floor(Math.random() * quirky_usernames.length)];
          setUsername(randomName);
      }
  }, [isHost]);

  // --- 1. SYNC WITH FIREBASE ---
  useEffect(() => {
    const chatRef = ref(db, `rooms/${roomId}/chat`);
    const bidRef = ref(db, `rooms/${roomId}/bid`);
    const auctionRef = ref(db, `rooms/${roomId}/auction`);
    const viewersRef = ref(db, `rooms/${roomId}/viewers`);

    const unsubChat = onValue(chatRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setMessages(Object.values(data).slice(-50));
    });

    const unsubAuction = onValue(auctionRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            setIsAuctionActive(data.isActive);
            isAuctionActiveRef.current = data.isActive; 
            setEndTime(data.endTime || 0);
        }
    });

    const unsubBid = onValue(bidRef, (snapshot) => {
      const price = snapshot.val() || 0;
      setCurrentBid(price);
      currentBidRef.current = price;
      
      setCustomBid((prev) => {
          const minNextBid = price + 10;
          if (!isAuctionActiveRef.current) return minNextBid;
          return prev < minNextBid ? minNextBid : prev;
      });
    });

    const unsubViewers = onValue(viewersRef, (snapshot) => {
        setViewerCount(snapshot.size);
    });

    return () => { unsubChat(); unsubBid(); unsubAuction(); unsubViewers(); };
  }, [roomId]);

  // --- 2. PRESENCE SYSTEM ---
  useEffect(() => {
      if (!isHost) {
          const userId = Math.random().toString(36).substring(2, 15);
          const myPresenceRef = ref(db, `rooms/${roomId}/viewers/${userId}`);
          
          set(myPresenceRef, true);
          onDisconnect(myPresenceRef).remove();
          
          return () => { remove(myPresenceRef); };
      }
  }, [roomId, isHost]);

  // --- 3. COUNTDOWN TIMER ---
  useEffect(() => {
      if (!isAuctionActive || !endTime) {
          setTimeLeft(30);
          return;
      }
      const interval = setInterval(() => {
          const now = Date.now();
          const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
          setTimeLeft(remaining);

          if (remaining === 0 && isHost) {
              stopAuction();
          }
      }, 100);
      return () => clearInterval(interval);
  }, [isAuctionActive, endTime, isHost]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);


  // --- 4. ACTIONS & CONTROLS ---
  const sendMessage = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    push(ref(db, `rooms/${roomId}/chat`), {
      user: username,
      text: input,
      isHost,
      type: 'msg'
    });
    setInput("");
  };

  const handlePriceChange = (e) => {
      if (isAuctionActive) return; 
      const valStr = e.target.value;
      if (valStr === '') {
          set(ref(db, `rooms/${roomId}/bid`), 0);
      } else {
          const val = parseInt(valStr);
          if (!isNaN(val)) set(ref(db, `rooms/${roomId}/bid`), val);
      }
  };

  const manualStep = (amount) => {
      if (isAuctionActive) return;
      set(ref(db, `rooms/${roomId}/bid`), Math.max(0, currentBid + amount));
  };

  const handleIncrease = () => setCustomBid(prev => prev + 10);
  const handleDecrease = () => {
      if (customBid > currentBid + 10) setCustomBid(prev => prev - 10);
  };

  const placeBid = () => {
    if (!isAuctionActive) return; 
    const bidRef = ref(db, `rooms/${roomId}/bid`);
    const lastBidderRef = ref(db, `rooms/${roomId}/lastBidder`);

    runTransaction(bidRef, (current) => {
      const safeCurrent = current || 0;
      if (customBid > safeCurrent) return customBid;
      return;
    }).then((result) => {
        if (result.committed) {
            set(lastBidderRef, username);
        }
    });

    push(ref(db, `rooms/${roomId}/chat`), {
        text: `${username} bid ₹${customBid}`,
        type: 'bid'
    });
  };

  // --- 5. AUCTION MANAGEMENT ---
  const startAuction = () => {
      const DURATION_SECONDS = 30;
      const newEndTime = Date.now() + (DURATION_SECONDS * 1000);

      update(ref(db, `rooms/${roomId}`), {
          "auction/isActive": true,
          "auction/endTime": newEndTime,
          "lastBidder": null 
      });

      push(ref(db, `rooms/${roomId}/chat`), {
        text: `🚨 AUCTION STARTED AT ₹${currentBid}!`,
        type: 'bid'
      });
  };

  const stopAuction = async () => {
      const finalPrice = currentBidRef.current;

      if (isAuctionActiveRef.current) { 
        // Fetch winner name
        const snapshot = await get(ref(db, `rooms/${roomId}/lastBidder`));
        const winnerName = snapshot.exists() ? snapshot.val() : "Nobody";

        push(ref(db, `rooms/${roomId}/chat`), {
            text: `🛑 ${winnerName} CALLED DIBS FOR ₹${finalPrice}!`,
            type: 'bid'
        });
      }

      update(ref(db, `rooms/${roomId}`), {
          "auction/isActive": false,
          "auction/endTime": 0
      });
  };

  const toggleAuction = () => {
      if (isAuctionActive) stopAuction();
      else startAuction();
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end pb-20 px-4 pointer-events-none overflow-hidden">
      
      {/* --- TOP RIGHT: PRICE & STATS --- */}
      <div className="absolute top-24 right-4 pointer-events-auto flex flex-col items-end gap-2">
          
          {/* Viewer Count Badge */}
          <div className="bg-black/40 backdrop-blur border border-white/10 rounded-full px-3 py-1 flex items-center gap-2 shadow-sm">
              <Eye className="w-3 h-3 text-red-500 animate-pulse" />
              <span className="text-xs font-mono font-bold text-white tabular-nums">{viewerCount}</span>
          </div>

          {/* Price Box */}
          <div className={`
              backdrop-blur-md border rounded-2xl p-2 flex flex-col items-end shadow-xl min-w-fit px-4 transition-colors relative
              ${isAuctionActive ? 'bg-red-900/20 border-red-500/30' : 'bg-black/40 border-white/10'}
          `}>
              <span className="text-[10px] text-zinc-300 font-mono uppercase tracking-wider mb-1 px-1">
                  {isAuctionActive ? "Current Bid" : "Starting Price"}
              </span>

              <div className="flex items-center justify-end gap-1 w-full">
                  {/* Host Manual Arrows */}
                  {isHost && !isAuctionActive && (
                      <div className="flex flex-col gap-0.5 mr-2">
                          <button onClick={() => manualStep(10)} className="text-white hover:text-dibs-neon active:scale-90 bg-white/10 rounded p-0.5">
                              <ChevronUp className="w-3 h-3" />
                          </button>
                          <button onClick={() => manualStep(-10)} className="text-white hover:text-dibs-neon active:scale-90 bg-white/10 rounded p-0.5">
                              <ChevronDown className="w-3 h-3" />
                          </button>
                      </div>
                  )}

                  <div className="flex items-center justify-end gap-1 flex-1">
                      <span className={`text-xl font-bold ${isAuctionActive ? 'text-white' : 'text-dibs-neon'}`}>₹</span>
                      
                      {isHost ? (
                          <input 
                            type="number"
                            value={currentBid === 0 ? '' : currentBid}
                            onChange={handlePriceChange}
                            disabled={isAuctionActive}
                            step="10"
                            placeholder="0"
                            style={{ width: `${Math.max(2, (currentBid?.toString() || "").length + 1)}ch` }}
                            className={`
                                bg-transparent text-right font-display font-black text-4xl outline-none p-0 m-0 placeholder:text-white/20
                                ${isAuctionActive ? 'text-white' : 'text-white border-b border-dashed border-white/20'}
                            `}
                          />
                      ) : (
                          <span className="text-4xl font-display font-black text-white tabular-nums tracking-tighter">
                              {currentBid}
                          </span>
                      )}
                  </div>
              </div>
          </div>

          {/* Timer */}
          {isAuctionActive && (
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-sm font-bold
                    ${timeLeft <= 10 ? 'bg-red-600 text-white animate-pulse' : 'bg-neutral-800 text-zinc-300 border border-white/10'}
                `}
              >
                  <Clock className="w-3 h-3" />
                  <span>00:{timeLeft.toString().padStart(2, '0')}</span>
              </motion.div>
          )}
      </div>

      {/* --- CHAT STREAM --- */}
      <div 
        ref={chatContainerRef}
        className="w-full max-w-[70%] h-56 mb-4 overflow-y-auto mask-chat pointer-events-auto pr-2"
      >
          <div className="min-h-full flex flex-col justify-end gap-2 pb-2">
            <AnimatePresence initial={false}>
                {messages.map((msg, i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`self-start rounded-lg px-3 py-1.5 text-sm backdrop-blur-sm border shadow-sm break-words ${
                        msg.type === 'bid' 
                        ? 'bg-dibs-neon/10 border-dibs-neon/50 text-dibs-neon font-bold'
                        : msg.isHost 
                            ? 'bg-red-600/20 border-red-500/50 text-red-100' 
                            : 'bg-black/30 border-white/10 text-white'
                    }`}
                >
                    <span className="font-bold opacity-70 text-[10px] mr-2 block">
                        {/* Show generic label for system messages (bids), Show Username for Chats */}
                        {msg.type === 'bid' ? '🔔 UPDATE' : msg.user}
                    </span>
                    {msg.text}
                </motion.div>
                ))}
            </AnimatePresence>
            <div ref={chatEndRef} />
          </div>
      </div>

      {/* --- BOTTOM CONTROLS --- */}
      <div className="pointer-events-auto flex items-center gap-2 w-full">
        <form onSubmit={sendMessage} className="flex-1 relative group">
            <input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Chat as ${username}...`}
                className="w-full bg-black/50 backdrop-blur border border-white/20 rounded-full pl-4 pr-10 py-3 text-sm text-white focus:outline-none focus:border-white/60 transition-all font-mono placeholder:text-white/30"
            />
            <button type="submit" className="absolute right-1 top-1 bottom-1 w-8 bg-white/10 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors">
                <Send className="w-3 h-3" />
            </button>
        </form>

        {!isHost && (
            <div className={`flex items-center gap-1 bg-white rounded-full p-1 shadow-lg transition-opacity ${isAuctionActive ? 'opacity-100' : 'opacity-50 pointer-events-none grayscale'}`}>
                <div className="flex flex-col gap-0.5 px-1">
                    <button onClick={handleIncrease} className="text-black hover:text-zinc-500 active:scale-90 transition-transform">
                        <ChevronUp className="w-3 h-3" />
                    </button>
                    <button 
                        onClick={handleDecrease}
                        disabled={customBid <= currentBid + 10}
                        className={`text-black transition-transform ${customBid <= currentBid + 10 ? 'opacity-20' : 'hover:text-zinc-500 active:scale-90'}`}
                    >
                        <ChevronDown className="w-3 h-3" />
                    </button>
                </div>
                <button 
                    onClick={placeBid}
                    className="bg-black text-white h-9 px-4 rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-1 hover:bg-zinc-800 active:scale-95 transition-all"
                >
                    <span>₹{customBid}</span>
                </button>
            </div>
        )}

        {isHost && (
            <button 
                onClick={toggleAuction}
                className={`
                    h-11 px-4 rounded-full font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg
                    ${isAuctionActive 
                        ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse' 
                        : 'bg-dibs-neon text-black hover:bg-white'}
                `}
            >
                {isAuctionActive ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                {isAuctionActive ? "STOP" : "START"}
            </button>
        )}
      </div>

    </div>
  );
};
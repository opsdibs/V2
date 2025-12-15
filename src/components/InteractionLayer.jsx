import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Clock, Play, Square, Eye, ShoppingBag, Plus, Minus } from 'lucide-react';
import { ref, push, onValue, runTransaction, update, set, onDisconnect, remove, get } from 'firebase/database'; 
import { db } from '../lib/firebase';
import Papa from 'papaparse'; // Import Parser
import inventoryRaw from '../inventory.csv?raw';
import { logEvent } from '../lib/analytics';

// --- INVENTORY ---
// --- PARSE INVENTORY FROM CSV ---
const parseInventory = () => {
    const results = Papa.parse(inventoryRaw, { 
        header: true, 
        skipEmptyLines: true 
    });
    
    return results.data.map(item => ({
        id: item['Sl NO'] ? parseInt(item['Sl NO']) : 0, // Map 'Sl NO' to 'id'
        name: item['Name'] || "Unknown Item",             // Map 'Name' to 'name'
        desc: item['Description'] || "",                  // Map 'Description' to 'desc'
        startPrice: item['Price'] ? parseInt(item['Price'].replace(/[^0-9]/g, '')) : 0 // Clean & Map 'Price'
    })).filter(i => i.id !== 0); // Remove invalid rows
};

const INVENTORY = parseInventory();

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

export const InteractionLayer = ({ roomId, isHost, isModerator, isSpectator }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [currentBid, setCurrentBid] = useState(0);
  const [customBid, setCustomBid] = useState(10);
  const [viewerCount, setViewerCount] = useState(0);
  const [username, setUsername] = useState("");
  
  const [isAuctionActive, setIsAuctionActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30); 
  const [endTime, setEndTime] = useState(0);
  
  const [currentItemId, setCurrentItemId] = useState(null);
  const [showInventory, setShowInventory] = useState(false);

  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const isAuctionActiveRef = useRef(false);
  const currentBidRef = useRef(0); 
  const currentItemRef = useRef(null); 
  const stopTriggeredRef = useRef(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);

  // For enforcing bans/kicks
  const [restrictions, setRestrictions] = useState({ isMuted: false, isBidBanned: false });
  const searchParams = new URLSearchParams(window.location.search);
  const persistentDbKey = searchParams.get('dbKey');
  const persistentUserId = searchParams.get('uid');

  useEffect(() => {
    const chatRef = ref(db, `rooms/${roomId}/chat`);
    const bidRef = ref(db, `rooms/${roomId}/bid`);
    const auctionRef = ref(db, `rooms/${roomId}/auction`);
    const viewersRef = ref(db, `rooms/${roomId}/viewers`);
    const itemRef = ref(db, `rooms/${roomId}/currentItem`);

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
            // NEW: Reset the stop trigger when auction starts
            if (data.isActive) {
                stopTriggeredRef.current = false;
            }
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

    const unsubItem = onValue(itemRef, (snapshot) => {
        const id = snapshot.val();
        setCurrentItemId(id);
        currentItemRef.current = id;
    });

    return () => { unsubChat(); unsubBid(); unsubAuction(); unsubViewers(); unsubItem(); };
  }, [roomId]);

  // --- SYNC LOGIC (With Consistent Hashing) ---
  useEffect(() => {
      if (isHost) {
          setUsername("HOST");
      } else if (isModerator) {
          setUsername("MODERATOR"); // <--- NEW CHECK
      } else {
          if (persistentUserId) {
              // Deterministic Name: Generate consistent index from ID string
              let hash = 0;
              for (let i = 0; i < persistentUserId.length; i++) {
                  hash = persistentUserId.charCodeAt(i) + ((hash << 5) - hash);
              }
              const index = Math.abs(hash) % quirky_usernames.length;
              setUsername(quirky_usernames[index]);
          } else {
              // Fallback random
              const randomName = quirky_usernames[Math.floor(Math.random() * quirky_usernames.length)];
              setUsername(randomName);
          }
      }
  }, [isHost, isModerator, persistentUserId]); // Added isModerator to dependencies

  // --- PRESENCE SYSTEM ---
  useEffect(() => {
      if (!isHost && persistentUserId) {
          // Reference to this specific user in the viewers list
          // CRITICAL: Use the EXACT persistentUserId from the URL
          const myPresenceRef = ref(db, `rooms/${roomId}/viewers/${persistentUserId}`);
          
          // 2. Set Status to Online
          set(myPresenceRef, true);
          
          // 3. Setup auto-remove on disconnect
          onDisconnect(myPresenceRef).remove();
          
          // 4. Cleanup on component unmount
          return () => { remove(myPresenceRef); };
      }
      // Debugging: Warn if a viewer has no ID
      else if (!isHost && !persistentUserId) {
          console.error("PRESENCE ERROR: No persistentUserId found for viewer!");
      }
  }, [roomId, isHost, persistentUserId]);

  useEffect(() => {
      if (!isAuctionActive || !endTime) {
          setTimeLeft(30);
          return;
      }
      const interval = setInterval(() => {
          const now = Date.now();
          const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
          setTimeLeft(remaining);
          // NEW: Only stop if we haven't already triggered it
          if (remaining === 0 && isHost) {
              if (!stopTriggeredRef.current) {
                  stopTriggeredRef.current = true; // Lock it immediately
                  stopAuction();
              }
          };
      }, 100);
      return () => clearInterval(interval);
  }, [isAuctionActive, endTime, isHost]);

  useEffect(() => {
    if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const currentItem = INVENTORY.find(i => i.id === currentItemId);

  // Reset expansion when item changes
  useEffect(() => {
      setIsDescExpanded(false);
  }, [currentItemId]);

  // --- LISTEN FOR MODERATOR ACTIONS ---
  useEffect(() => {
      if (!persistentDbKey) return;
      
      const restrictionsRef = ref(db, `audience_data/${roomId}/${persistentDbKey}/restrictions`);
      const unsub = onValue(restrictionsRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
              setRestrictions(data);
              // Immediate Kick Action
              if (data.isKicked) {
                  alert("You have been kicked by the moderator.");
                  window.location.href = '/'; 
              }
          }
      });
      return () => unsub();
  }, [roomId, persistentDbKey]);

  // --- ACTIONS ---
  const sendMessage = (e) => {
    e.preventDefault();
    // 1. Check restriction
    if (restrictions.isMuted) {
        alert("You are muted by the moderator.");
        return;
    }
    if (!input.trim()) return;
    push(ref(db, `rooms/${roomId}/chat`), {
      user: username,
      text: input,
      isHost,
      type: 'msg'
    });
    logEvent(roomId, 'CHAT_SENT', { user: username, type: 'msg' });
    setInput("");
  };

  const selectItem = (item) => {
      if (isAuctionActive) return; 
      set(ref(db, `rooms/${roomId}/currentItem`), item.id);
      set(ref(db, `rooms/${roomId}/bid`), item.startPrice); 
      setShowInventory(false);
  };

  const handlePriceChange = (e) => {
      if (isAuctionActive) return; 
      const valStr = e.target.value;
      if (valStr === '') set(ref(db, `rooms/${roomId}/bid`), 0);
      else {
          const val = parseInt(valStr);
          if (!isNaN(val)) set(ref(db, `rooms/${roomId}/bid`), val);
      }
  };

  const manualStep = (amount) => {
      if (isAuctionActive) return;
      set(ref(db, `rooms/${roomId}/bid`), Math.max(0, currentBid + amount));
  };
  

  // FIXED: Combined Vibration + Sound inside one function
  const triggerHaptic = () => {
    // 1. Stronger Vibration (Android)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(25); 
    }

    // 2. "Tick" Sound (iPhone / Desktop)
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
        try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            // Sound Profile: High pitch (800Hz), very short (0.03s)
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            gain.gain.setValueAtTime(0.025, ctx.currentTime); // Low volume (5%)
            
            osc.start();
            osc.stop(ctx.currentTime + 0.03);
        } catch (e) {
            // Ignore audio errors
        }
    }
  };

  const handleIncrease = () => {
      triggerHaptic(); // <--- Add this
      setCustomBid(prev => prev + 10);
  };

 const handleDecrease = () => {
      if (customBid > currentBid + 10) {
          triggerHaptic(); // <--- Add this
          setCustomBid(prev => prev - 10);
      }
  };

  const placeBid = () => {
    if (!isAuctionActive) return; 
     triggerHaptic();
    // 1. Check restriction
    if (restrictions.isBidBanned) {
        alert("You are banned from bidding.");
        return;
    }
    const bidRef = ref(db, `rooms/${roomId}/bid`);
    const lastBidderRef = ref(db, `rooms/${roomId}/lastBidder`);
    
    runTransaction(bidRef, (current) => {
      const safeCurrent = current || 0;
      if (customBid > safeCurrent) return customBid;
      return;
    }).then((result) => {
        if (result.committed) {
            set(lastBidderRef, username);

            // 2. NEW: Log bid for Moderator History
            push(ref(db, `rooms/${roomId}/currentAuctionBids`), {
                user: username,
                amount: customBid,
                timestamp: Date.now()
            });
        }
    });

    push(ref(db, `rooms/${roomId}/chat`), {
        text: `${username} bid ₹${customBid}`,
        type: 'bid'
    });

    logEvent(roomId, 'BID_PLACED', { 
                user: username, 
                amount: customBid, 
                item: currentItem ? currentItem.name : 'Unknown' 
            });
  };

  const startAuction = () => {
      if (!currentItemId) {
          alert("Please select an item first!");
          return;
      }
      const newEndTime = Date.now() + (30 * 1000);
      update(ref(db, `rooms/${roomId}`), {
          "auction/isActive": true,
          "auction/endTime": newEndTime,
          "lastBidder": null
      });
      const item = INVENTORY.find(i => i.id === currentItemId);
      push(ref(db, `rooms/${roomId}/chat`), {
        text: `🚨 AUCTION STARTED: ${item ? item.name : 'Item'} at ₹${currentBid}!`,
        type: 'auction'
      });
  };

  const stopAuction = async () => {
      const finalPrice = currentBidRef.current;
      const item = INVENTORY.find(i => i.id === currentItemRef.current);
      
      if (isAuctionActiveRef.current) { 
        const snapshot = await get(ref(db, `rooms/${roomId}/lastBidder`));
        const winnerName = snapshot.exists() ? snapshot.val() : "Nobody";
        // 2. NEW: Fetch session bids to calculate Top 3 for Moderator
        const bidsSnap = await get(ref(db, `rooms/${roomId}/currentAuctionBids`));
        let top3 = [];
        if (bidsSnap.exists()) {
            const allBids = Object.values(bidsSnap.val());
            
            // 1. Group by User (Keep only their highest bid)
            const highestBidByUser = {};
            allBids.forEach(bid => {
                if (!highestBidByUser[bid.user] || bid.amount > highestBidByUser[bid.user].amount) {
                    highestBidByUser[bid.user] = bid;
                }
            });

            // 2. Convert back to array, Sort by Amount (Desc), Take Top 3
            top3 = Object.values(highestBidByUser)
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 3);
        }

        // 3. NEW: Push to History
        push(ref(db, `rooms/${roomId}/auctionHistory`), {
            itemName: item ? item.name : 'Unknown Item',
            finalPrice: finalPrice,
            winner: winnerName,
            topBidders: top3,
            timestamp: Date.now()
        });
        
        push(ref(db, `rooms/${roomId}/chat`), {
            text: `🛑 ${winnerName} CALLED DIBS ON ${item ? item.name : 'ITEM'} FOR ₹${finalPrice}!`,
            type: 'auction'
        });
      }
      // 4. Cleanup
      update(ref(db, `rooms/${roomId}`), { "auction/isActive": false, "auction/endTime": 0 });
      remove(ref(db, `rooms/${roomId}/currentAuctionBids`)); // Clear temp bids
  };

  const toggleAuction = () => {
      if (isAuctionActive) stopAuction();
      else startAuction();
  };

  // DYNAMIC STYLES
  // If Spectator: Full Width. If Bidder/Host: 55% Width.
  const leftColumnClass = isSpectator 
      ? "w-full max-w-md mx-auto" 
      : "w-[55%] max-w-[14rem]";

  return (
    <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden max-w-md mx-auto border-x border-white/5 shadow-2xl">
      
      {/* TOP RIGHT: STATS (Unchanged) */}
      <div className="absolute top-24 right-4 pointer-events-auto flex flex-col items-end gap-2 z-[60]">
          {/* ... (Keep existing stats code) ... */}
          <div className="bg-black/40 backdrop-blur border border-white/10 rounded-full px-3 py-1 flex items-center gap-2 shadow-sm">
              <Eye className="w-3 h-3 text-red-500 animate-pulse" />
              <span className="text-xs font-display font-bold text-white tabular-nums">{viewerCount}</span>
          </div>

          <div className={`backdrop-blur-md border rounded-2xl p-2 flex flex-col items-end shadow-xl min-w-fit px-4 transition-colors relative ${isAuctionActive ? 'bg-red-900/20 border-red-500/30' : 'bg-black/40 border-white/10'}`}>
              <span className="text-[10px] text-zinc-300 font-display uppercase tracking-wider mb-1 px-1">
                  {isAuctionActive ? "Current Bid" : "Starting Price"}
              </span>
              <div className="flex items-center justify-end gap-1 w-full">
                  {/* ... (Keep existing price display code) ... */}
                  <div className="flex items-center justify-end gap-1 flex-1">
                      <span className={`text-xl font-bold ${isAuctionActive ? 'text-white' : 'text-dibs-neon'}`}>₹</span>
                      <span className="text-4xl font-display font-black text-white tabular-nums tracking-tighter">{currentBid}</span>
                  </div>
              </div>
          </div>

          {isAuctionActive && (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-display text-sm font-bold ${timeLeft <= 10 ? 'bg-red-600 text-white animate-pulse' : 'bg-neutral-800 text-zinc-300 border border-white/10'}`}>
                  <Clock className="w-3 h-3" />
                  <span>00:{timeLeft.toString().padStart(2, '0')}</span>
              </motion.div>
          )}
      </div>
    
    <div className="absolute inset-x-0 bottom-0 p-4 flex flex-col justify-end z-30 pointer-events-none h-[85%]">
 
      {/* 1. CHAT STREAM (Dynamic Width) */}
      <div 
        ref={chatContainerRef} 
        className={`${leftColumnClass} h-40 overflow-y-auto pointer-events-auto pr-2 mb-2 transition-all duration-300`}
        style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 50%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 100%)' }}
      >
          {/* ... (Keep existing chat message mapping code) ... */}
          <div className="min-h-full flex flex-col justify-end gap-2 pb-2">
            <AnimatePresence initial={false}>
                {messages.map((msg, i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`self-start w-full rounded-[24px] px-4 py-2 shadow-sm break-words font-display ${
                        msg.type === 'bid' 
                        ? 'bg-[#ff6500] border border-white/20 text-white font-bold'
                        : msg.type === 'auction'
                        ? 'bg-[#161616] border border-[#ff6500] text-white font-bold'
                        : 'bg-[#161616] text-white border border-white/10 font-normal' 
                    }`}
                >
                    {msg.type !== 'bid' && msg.type !== 'auction' && (
                        <span className="font-bold text-[8px] mr-2 block text-[#FF6600]">
                            {msg.user}
                        </span>
                    )}
                    <span className={`text-[10px] leading-tight block ${msg.type === 'msg' ? 'font-normal' : 'font-bold'}`}>
                        {msg.text}
                    </span>
                </motion.div>
                ))}
            </AnimatePresence>
            <div ref={chatEndRef} />
          </div>
      </div>

      {/* --- BOTTOM DOCK --- */}
      <div className="flex justify-between items-end w-full pointer-events-none">
        
        {/* LEFT COLUMN: Chat Input + Item Card (Dynamic Width) */}
        <div className={`flex flex-col gap-2 pointer-events-auto transition-all duration-300 ${leftColumnClass}`}>
            
            {/* Chat Input */}
            <form onSubmit={sendMessage} className="relative group w-full mb-2">
                <input 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={`Chat as ${username}...`}
                    className="w-full bg-black/50 backdrop-blur border border-white/20 rounded-full pl-4 pr-10 py-3 text-xs sm:text-sm text-white focus:outline-none focus:border-white/60 transition-all font-display placeholder:text-white/30"
                />
                <button type="submit" className="absolute right-1 top-1 bottom-1 w-8 bg-white/10 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors">
                    <Send className="w-3 h-3" />
                </button>
            </form>

            {/* Item Card (Unchanged content, width handled by parent) */}
            <div className="z-[60] mb-4 relative">
                {/* ... (Keep existing Item Card and Inventory code) ... */}
                {currentItem ? (
                    <div 
                        onClick={() => isHost && !isAuctionActive && setShowInventory(!showInventory)}
                        className={`
                                w-full bg-black rounded-2xl p-3 flex flex-col gap-1 shadow-2xl border border-white/10
                                ${isHost && !isAuctionActive ? 'cursor-pointer hover:bg-zinc-900 active:scale-95 transition-all' : ''}
                            `}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[#FF6600] uppercase tracking-wider">ITEM #{currentItem.id}</span>
                            {isHost && !isAuctionActive && <ChevronUp className={`w-4 h-4 text-zinc-500 transition-transform ${showInventory ? 'rotate-180' : ''}`} />}
                        </div>
                        <h3 className="text-lg font-bold text-white leading-tight truncate mt-0.5">{currentItem.name}</h3>
                        <div 
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsDescExpanded(!isDescExpanded);
                            }}
                            className={`text-xs text-zinc-400 cursor-pointer transition-all duration-300 ${isDescExpanded ? 'whitespace-normal break-words' : 'truncate'}`}
                        >
                            {currentItem.desc}
                            {!isDescExpanded && currentItem.desc.length > 30 && (
                                <span className="text-[10px] text-[#FF6600] ml-1 font-bold opacity-80">more</span>
                            )}
                        </div>
                    </div>
                ) : (
                    isHost && (
                        <button onClick={() => setShowInventory(!showInventory)} className="bg-dibs-neon text-black font-bold text-xs px-4 py-3 rounded-xl shadow-lg hover:bg-white transition-colors flex items-center gap-2">
                            <ShoppingBag className="w-4 h-4" />
                            SELECT ITEM TO AUCTION
                        </button>
                    )
                )}
            </div>
        </div>

        {/* RIGHT COLUMN: HIDDEN FOR SPECTATORS */}
        {!isSpectator && (
            <div className="flex flex-col gap-2 pointer-events-auto items-end w-[40%] max-w-[10rem]"> 
                
                {/* Host Start/Stop Button */}
                {isHost && (
                    <button 
                        onClick={toggleAuction} 
                        className={`absolute right-4 h-11 px-4 rounded-full font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg z-50 pointer-events-auto ${isAuctionActive ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse' : 'bg-dibs-neon text-black hover:bg-white'}`}
                        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
                    >
                        {isAuctionActive ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                        {isAuctionActive ? "STOP" : "START"}
                    </button>
                )}

                {/* Viewer Bidding Buttons */}
                {!isHost && (
                    <div className={`flex flex-col items-center gap-2 transition-all duration-300 ${isAuctionActive ? 'opacity-100' : 'opacity-100'}`}>
                        <div className="bg-black rounded-[2.5rem] p-2 shadow-2xl border border-white/10 w-full mb-4">
                            <div className="flex items-center justify-between px-2 py-2">
                                <button 
                                    onClick={handleDecrease} 
                                    disabled={!isAuctionActive || customBid <= currentBid + 10}
                                    className={`text-white hover:text-zinc-300 active:scale-90 transition-all p-2 ${(!isAuctionActive || customBid <= currentBid + 10) ? 'cursor-not-allowed' : ''}`}
                                >
                                    <Minus className="w-8 h-8" />
                                </button>

                                <button 
                                    onClick={handleIncrease} 
                                    disabled={!isAuctionActive}
                                    className={`text-white hover:text-zinc-300 active:scale-90 transition-all p-2 ${!isAuctionActive ? 'cursor-not-allowed' : ''}`}
                                >
                                    <Plus className="w-8 h-8" />
                                </button>
                            </div>
                            <button 
                                onClick={placeBid} 
                                disabled={!isAuctionActive}
                                className={`
                                    w-full py-4 rounded-[2rem] font-black tracking-tighter transition-all flex items-center justify-center
                                    text-2xl sm:text-3xl
                                    bg-[#FF6600] text-white
                                    ${isAuctionActive 
                                        ? 'active:scale-95 hover:bg-[#ff8533] cursor-pointer' 
                                        : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                                    }
                                `}
                            >
                                <span>₹{customBid}</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>       
    </div>
  );
};
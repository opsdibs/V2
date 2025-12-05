import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Clock, Play, Square, Eye, ShoppingBag, Plus, Minus } from 'lucide-react';
import { ref, push, onValue, runTransaction, update, set, onDisconnect, remove, get } from 'firebase/database'; 
import { db } from '../lib/firebase';

// --- INVENTORY ---
const INVENTORY = [
  { id: 101, name: "Vintage Levi's 501", desc: "Size 32, Light Wash, 90s", startPrice: 150 },
  { id: 102, name: "Nike Windbreaker", desc: "Size L, Teal/Purple, Mint", startPrice: 80 },
  { id: 103, name: "Carhartt Detroit", desc: "Size XL, Distressed, Tan", startPrice: 250 },
  { id: 104, name: "Band Tee (Nirvana)", desc: "Size M, Faded Black", startPrice: 120 },
];

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

  // For enforcing bans/kicks
  const [restrictions, setRestrictions] = useState({ isMuted: false, isBidBanned: false });
  const searchParams = new URLSearchParams(window.location.search);
  const persistentDbKey = searchParams.get('dbKey');
  const persistentUserId = searchParams.get('uid');

  // --- SYNC LOGIC (With Consistent Hashing) ---
  useEffect(() => {
      if (isHost) {
          setUsername("HOST");
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
  }, [isHost, persistentUserId]);

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

  // --- PRESENCE SYSTEM ---
  useEffect(() => {
      if (!isHost) {
          // Use the persistent ID if available, otherwise fallback (prevents ReferenceError)
          const userId = persistentUserId || Math.random().toString(36).substring(2, 15);
          
          const myPresenceRef = ref(db, `rooms/${roomId}/viewers/${userId}`);
          set(myPresenceRef, true);
          onDisconnect(myPresenceRef).remove();
          
          return () => { remove(myPresenceRef); };
      }
  }, [roomId, isHost, persistentUserId]); // <--- Added persistentUserId dependency

  useEffect(() => {
      if (!isAuctionActive || !endTime) {
          setTimeLeft(30);
          return;
      }
      const interval = setInterval(() => {
          const now = Date.now();
          const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
          setTimeLeft(remaining);
          if (remaining === 0 && isHost) stopAuction();
      }, 100);
      return () => clearInterval(interval);
  }, [isAuctionActive, endTime, isHost]);

  useEffect(() => {
    if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const currentItem = INVENTORY.find(i => i.id === currentItemId);

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

  const handleIncrease = () => setCustomBid(prev => prev + 10);
  const handleDecrease = () => {
      if (customBid > currentBid + 10) setCustomBid(prev => prev - 10);
  };

  const placeBid = () => {
    if (!isAuctionActive) return; 
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
      // 1. Fetch Winner
      const snapshot = await get(ref(db, `rooms/${roomId}/lastBidder`));
      const winnerName = snapshot.exists() ? snapshot.val() : "Nobody";
      if (isAuctionActiveRef.current) { 
        // 2. NEW: Fetch session bids to calculate Top 3 for Moderator
        const bidsSnap = await get(ref(db, `rooms/${roomId}/currentAuctionBids`));
        let top3 = [];
        if (bidsSnap.exists()) {
            const bids = Object.values(bidsSnap.val());
            top3 = bids.sort((a, b) => b.amount - a.amount).slice(0, 3);
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

  return (
    <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden max-w-md mx-auto border-x border-white/5 shadow-2xl">
      
      {/* TOP RIGHT: STATS */}
      <div className="absolute top-24 right-4 pointer-events-auto flex flex-col items-end gap-2">
          <div className="bg-black/40 backdrop-blur border border-white/10 rounded-full px-3 py-1 flex items-center gap-2 shadow-sm">
              <Eye className="w-3 h-3 text-red-500 animate-pulse" />
              <span className="text-xs font-display font-bold text-white tabular-nums">{viewerCount}</span>
          </div>

          <div className={`backdrop-blur-md border rounded-2xl p-2 flex flex-col items-end shadow-xl min-w-fit px-4 transition-colors relative ${isAuctionActive ? 'bg-red-900/20 border-red-500/30' : 'bg-black/40 border-white/10'}`}>
              <span className="text-[10px] text-zinc-300 font-display uppercase tracking-wider mb-1 px-1">
                  {isAuctionActive ? "Current Bid" : "Starting Price"}
              </span>
              <div className="flex items-center justify-end gap-1 w-full">
                  {isHost && !isAuctionActive && (
                      <div className="flex flex-col gap-0.5 mr-2">
                          <button onClick={() => manualStep(10)} className="text-white hover:text-dibs-neon active:scale-90 bg-white/10 rounded p-0.5"><ChevronUp className="w-3 h-3" /></button>
                          <button onClick={() => manualStep(-10)} className="text-white hover:text-dibs-neon active:scale-90 bg-white/10 rounded p-0.5"><ChevronDown className="w-3 h-3" /></button>
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
                            className={`bg-transparent text-right font-display font-black text-4xl outline-none p-0 m-0 placeholder:text-white/20 ${isAuctionActive ? 'text-white' : 'text-white border-b border-dashed border-white/20'}`}
                          />
                      ) : (
                          <span className="text-4xl font-display font-black text-white tabular-nums tracking-tighter">{currentBid}</span>
                      )}
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
 
      {/* CHAT STREAM (Lifted higher to clear the bottom dock) */}
      <div 
        ref={chatContainerRef} 
        className="w-[55%] max-w-[14rem] h-40 overflow-y-auto pointer-events-auto pr-2 mb-2"
        style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 50%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 100%)' }}
      >
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
                    {/* CHANGE: Username font size 8px, Orange color */}
                    {msg.type !== 'bid' && msg.type !== 'auction' && (
                        <span className="font-bold text-[8px] mr-2 block text-[#FF6600]">
                            {msg.user}
                        </span>
                    )}

                    {/* CHANGE: Comment text size 10px */}
                    <span className={`text-[10px] leading-tight block ${msg.type === 'msg' ? 'font-normal' : 'font-bold'}`}>
                        {msg.text}
                    </span>
                </motion.div>
                ))}
            </AnimatePresence>
            <div ref={chatEndRef} />
          </div>
      </div>

      {/* --- BOTTOM DOCK LEFT (CHAT + ITEM) --- */}
      <div className="flex justify-between items-end w-full pointer-events-none">
        
        {/* LEFT COLUMN: Chat Input + Item Card */}
        <div className="flex flex-col gap-2 pointer-events-auto w-[55%] max-w-[14rem]">
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

            {/* Item Card */}
            {/* CHANGE: Item Card moved to the BOTTOM (below Chat) */}
                <div className="z-40 mb-4 relative">
                <AnimatePresence>
                    {showInventory && isHost && (
                        <motion.div 
                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.9 }}
                            className="absolute bottom-full mb-2 left-0 w-full bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-64 overflow-y-auto"
                        >
                            <div className="p-3 border-b border-white/10 text-[10px] font-bold uppercase text-zinc-500 tracking-widest sticky top-0 bg-black/90">Select Item</div>
                            {INVENTORY.map(item => (
                                <button 
                                    key={item.id}
                                    onClick={() => selectItem(item)}
                                    className="p-3 text-left hover:bg-white/10 transition-colors border-b border-white/5 last:border-0 flex flex-col gap-1"
                                >
                                    <div className="flex justify-between w-full">
                                        <span className="text-sm font-bold text-white">{item.name}</span>
                                        <span className="text-xs font-di text-dibs-neon">₹{item.startPrice}</span>
                                    </div>
                                    <span className="text-xs text-zinc-400 truncate">{item.desc}</span>
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>

                {currentItem ? (
                    <div 
                        onClick={() => isHost && !isAuctionActive && setShowInventory(!showInventory)}
                        // CHANGE: Updated styling to match the "HNM Hoodie" card image
                        // - bg-black (solid black)
                        // - rounded-2xl
                        // - p-4 (more padding)
                        // - w-64 (fixed width)
                        className={`
                                w-full bg-black rounded-2xl p-3 flex flex-col gap-1 shadow-2xl border border-white/5
                                ${isHost && !isAuctionActive ? 'cursor-pointer hover:bg-zinc-900 active:scale-95 transition-all' : ''}
                            `}
                    >
                        {/* Top Label: ITEM #1 */}
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[#FF6600] uppercase tracking-wider">ITEM #{currentItem.id}</span>
                            {isHost && !isAuctionActive && <ChevronUp className={`w-4 h-4 text-zinc-500 transition-transform ${showInventory ? 'rotate-180' : ''}`} />}
                        </div>
                        
                        {/* Item Name */}
                        <h3 className="text-lg font-bold text-white leading-tight truncate mt-0.5">{currentItem.name}</h3>
                        
                        {/* Item Description / Size */}
                        <p className="text-xs text-zinc-400 truncate">{currentItem.desc}</p>
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

        {/* RIGHT COLUMN: Auction & Bids */}
            <div className="flex flex-col gap-2 pointer-events-auto items-end w-[40%] max-w-[10rem]"> 
            {/* Host Start/Stop - Pushed up by pb-16 to leave room for Go Live */}
            {isHost && (
                <button onClick={toggleAuction} className={`h-11 px-4 rounded-full font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg mb-24 ${isAuctionActive ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse' : 'bg-dibs-neon text-black hover:bg-white'}`}>
                    {isAuctionActive ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                    {isAuctionActive ? "STOP" : "START"}
                </button>
            )}

            {/* Viewer Bidding (Replaces Auction buttons for viewers) */}
            {!isHost && (
                <div className={`flex flex-col items-center gap-2 transition-all duration-300 ${isAuctionActive ? 'opacity-100' : 'opacity-100'}`}>
                    
                    {/* CHANGE: Grouped Controls into one Black Container */}
                    <div className="bg-black rounded-[2.5rem] p-2 shadow-2xl border border-white/10 w-full mb-4">
                        
                        {/* Top Row: Minus and Plus Buttons */}
                        <div className="flex items-center justify-between px-2 py-2">
                            <button 
                                onClick={handleDecrease} 
                                // CHANGE: Disable if auction inactive OR min bid reached
                                disabled={!isAuctionActive || customBid <= currentBid + 10}
                                className={`text-white hover:text-zinc-300 active:scale-90 transition-all p-2 ${(!isAuctionActive || customBid <= currentBid + 10) ? 'cursor-not-allowed' : ''}`}
                            >
                                <Minus className="w-8 h-8" />
                            </button>

                            <button 
                                onClick={handleIncrease} 
                                // CHANGE: Disable if auction inactive
                                disabled={!isAuctionActive}
                                className={`text-white hover:text-zinc-300 active:scale-90 transition-all p-2 ${!isAuctionActive ? 'cursor-not-allowed' : ''}`}
                            >
                                <Plus className="w-8 h-8" />
                            </button>
                        </div>

                        {/* Bottom: Orange Bid Button (Inside the container) */}
                        <button 
                            onClick={placeBid} 
                            disabled={!isAuctionActive}
                            className={`
                                w-full py-4 rounded-[2rem] font-black tracking-tighter transition-all flex items-center justify-center
                                text-2xl sm:text-3xl
                                bg-[#FF6600] text-white
                                ${isAuctionActive 
                                    ? 'active:scale-95 hover:bg-[#ff8533] cursor-pointer' 
                                    : 'bg-zinc-800 text-zinc-600 cursor-not-allowed' // INACTIVE STATE (Greyed out)
                                }
                            `}
                        >
                            <span>₹{customBid}</span>
                        </button>
                    </div>
                </div>
            )}
        </div>

      </div>
    </div>       
    
    </div>
  );
};
import React, { useEffect, useState } from 'react';
import { ref, onValue, update, remove } from 'firebase/database';
import { db } from '../lib/firebase';
import { Shield, MessageSquareOff, Ban, Gavel, XCircle, History, X } from 'lucide-react';

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

export const ModeratorPanel = ({ roomId, onClose }) => {
  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'history'
  const [users, setUsers] = useState([]);
  const [history, setHistory] = useState([]);
  const [onlineIds, setOnlineIds] = useState([]);
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

  // 1. Fetch & Process Audience List
  useEffect(() => {
    const usersRef = ref(db, `audience_data/${roomId}`);
    return onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const now = Date.now();
        const rawList = Object.entries(data).map(([key, val]) => ({
          dbKey: key,
          ...val
        }));

        // Processing Pipeline:
        const processed = rawList
          // 1. Exclude Host & Moderator
          .filter(u => u.role !== 'host' && u.role !== 'moderator') 
          
          // 2. Deduplicate (Keep most recent session per userId)
          .reduce((acc, current) => {
            const existingIndex = acc.findIndex(u => u.userId === current.userId);
            if (existingIndex === -1) {
              acc.push(current);
            } else {
              // If current is newer, replace existing
              if (current.joinedAt > acc[existingIndex].joinedAt) {
                acc[existingIndex] = current;
              }
            }
            return acc;
          }, [])

          // 3. Mark Online Status & Check Time Window
          .map(user => ({
            ...user,
            isOnline: onlineIds.includes(user.userId)
          }))
          .filter(user => {
            // Keep if Online OR (Offline but joined within last 2 hours)
            return user.isOnline || (now - user.joinedAt < TWO_HOURS_MS);
          })

          // 4. Sort: Online first, then by Join Time
          .sort((a, b) => {
            if (a.isOnline === b.isOnline) return b.joinedAt - a.joinedAt;
            return a.isOnline ? -1 : 1;
          });

        setUsers(processed);
      }
    });
  }, [roomId, onlineIds]); // Added onlineIds as dependency to re-sort when presence changes

  // 2. Fetch Auction History
  useEffect(() => {
    const historyRef = ref(db, `rooms/${roomId}/auctionHistory`);
    return onValue(historyRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Sort by timestamp descending
        const histList = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
        setHistory(histList);
      }
    });
  }, [roomId]);

  // 3. Fetch Online Presence (Real-time)
  useEffect(() => {
    const presenceRef = ref(db, `rooms/${roomId}/viewers`);
    return onValue(presenceRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // The keys are the userIds
        setOnlineIds(Object.keys(data));
      } else {
        setOnlineIds([]);
      }
    });
  }, [roomId]);

  // --- ACTIONS ---
  const toggleRestriction = (user, type) => {
    // type = 'isMuted' or 'isBidBanned'
    const updates = {};
    updates[`audience_data/${roomId}/${user.dbKey}/restrictions/${type}`] = !user.restrictions?.[type];
    update(ref(db), updates);
  };

  const kickUser = (user) => {
    if(!window.confirm(`Kick ${user.userId}?`)) return;
    const updates = {};
    updates[`audience_data/${roomId}/${user.dbKey}/restrictions/isKicked`] = true;
    update(ref(db), updates);
  };

  const getQuirkyName = (userId) => {
      if (!userId) return "Unknown";
      if (userId === 'HOST' || userId === 'MODERATOR') return userId; // Special handling for Host/Mod IDs

      // Deterministic generation matching InteractionLayer
      let hash = 0;
      for (let i = 0; i < userId.length; i++) {
          hash = userId.charCodeAt(i) + ((hash << 5) - hash);
      }
      const index = Math.abs(hash) % quirky_usernames.length;
      return quirky_usernames[index];
  };

  return (
    <div className="absolute top-20 left-4 right-4 bottom-32 bg-black/80 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden flex flex-col z-50 pointer-events-auto shadow-2xl">
      
      {/* Header */}
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-zinc-900">
        <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500" />
            <span className="font-bold text-white uppercase tracking-wider">Mod Panel</span>
        </div>
        
        <div className="flex items-center gap-2">
            <div className="flex bg-black rounded-lg p-1 gap-1">
                <button onClick={() => setActiveTab('users')} className={`px-4 py-1 rounded text-xs font-bold uppercase ${activeTab === 'users' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-white'}`}>Viewers</button>
                <button onClick={() => setActiveTab('history')} className={`px-4 py-1 rounded text-xs font-bold uppercase ${activeTab === 'history' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-white'}`}>History</button>
            </div>
            
            {/* Close Button */}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        
        {/* VIEWERS TAB */}
        {activeTab === 'users' && users.map(user => (
            <div 
                key={user.userId}
                // CHANGE: Add opacity-50 if offline 
                className={`border border-white/5 p-3 rounded-xl flex justify-between items-center group transition-all ${user.isOnline ? 'bg-white/10' : 'bg-white/5 opacity-50'}`}>
                <div>
                    <div className="flex items-center gap-2">
                        {/* CHANGE: Add Online/Offline Dot */}
                        <div className={`w-2 h-2 rounded-full ${user.isOnline ? 'bg-green-500 animate-pulse' : 'bg-zinc-500'}`} />

                        <span className="font-bold text-white text-sm">{getQuirkyName(user.userId)}</span>
                        {user.restrictions?.isKicked && <span className="text-[10px] bg-red-500 px-1 rounded text-white">KICKED</span>}
                    </div>
                    {/* 2. Subtext: UserID | Email */}
                    <div className="text-[10px] text-zinc-400 font-mono mt-1 pl-4">
                        {user.userId} | {user.email}
                        {!user.isOnline && <span className="ml-2 italic text-zinc-600">(Offline)</span>}
                    </div>
                </div>
                
                {/* 3. Actions: Hidden by default, Visible on Group Hover */}
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button 
                        onClick={() => toggleRestriction(user, 'isMuted')}
                        className={`p-2 rounded-lg transition-colors ${user.restrictions?.isMuted ? 'bg-red-500/20 text-red-500' : 'bg-white/10 text-zinc-400 hover:bg-white/20'}`}
                        title={user.restrictions?.isMuted ? "Unmute" : "Mute Chat"}
                    >
                        <MessageSquareOff className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => toggleRestriction(user, 'isBidBanned')}
                        className={`p-2 rounded-lg transition-colors ${user.restrictions?.isBidBanned ? 'bg-red-500/20 text-red-500' : 'bg-white/10 text-zinc-400 hover:bg-white/20'}`}
                        title={user.restrictions?.isBidBanned ? "Unban Bid" : "Ban Bidding"}
                    >
                        <Ban className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => kickUser(user)}
                        className="p-2 rounded-lg bg-white/10 text-zinc-400 hover:bg-red-600 hover:text-white transition-colors"
                        title="Kick User"
                    >
                        <XCircle className="w-4 h-4" />
                    </button>
                </div>
            </div>
        ))}

        {/* AUCTION HISTORY TAB */}
        {activeTab === 'history' && history.map((item, i) => (
            <div key={i} className="bg-white/5 border border-white/5 p-3 rounded-xl space-y-2">
                <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="font-bold text-white text-sm">{item.itemName}</span>
                    <span className="font-mono text-dibs-neon">Sold: ₹{item.finalPrice}</span>
                </div>
                
                <div className="space-y-1">
                    <span className="text-[10px] uppercase text-zinc-500 font-bold">Top Bidders</span>
                    {item.topBidders && item.topBidders.map((bidder, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                            <span className="text-zinc-300">{idx + 1}. {bidder.user}</span>
                            <span className="font-mono text-zinc-500">₹{bidder.amount}</span>
                        </div>
                    ))}
                </div>
                <div className="text-[10px] text-right text-zinc-600 font-mono pt-1">
                    Winner: {item.winner}
                </div>
            </div>
        ))}

        {activeTab === 'history' && history.length === 0 && (
            <div className="text-center text-zinc-500 text-xs mt-10">No auctions finished yet.</div>
        )}
      </div>
    </div>
  );
};
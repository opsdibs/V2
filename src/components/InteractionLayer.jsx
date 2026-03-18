import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Clock, Gavel, Eye, ShoppingBag, Plus, Minus, Trash2, Pin, X, Settings } from 'lucide-react'; // CHANGE
import { ref, push, onValue, runTransaction, update, set, onDisconnect, remove, get, query, limitToLast } from "firebase/database"; //EFF CHANGE
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

const AUCTION_DURATION_SECONDS = 20;
const LIVE_SELL_DURATION_SECONDS = 20;
const PRESENCE_HEARTBEAT_MS = 20000;
const PRESENCE_TTL_MS = 45000;

const glassSurface =
  "relative overflow-hidden rounded-2xl " +
  "backdrop-blur-md bg-black/50 " +
  "border border-white/15 " +
  "shadow-[0_10px_30px_rgba(0,0,0,0.35)]";

const glassHighlight =
  "before:content-[''] before:absolute before:inset-0 " +
  "before:bg-gradient-to-b before:from-white/12 before:to-transparent " +
  "before:pointer-events-none";

export const InteractionLayer = ({ roomId, isHost, isModerator, isSpectator, assignedUsername}) => {
  const [messages, setMessages] = useState([]);
  const [pinnedMessage, setPinnedMessage] = useState(null);
  const [input, setInput] = useState("");
  const [currentBid, setCurrentBid] = useState(0);
  const [bidIncrement, setBidIncrement] = useState(10); // BIDINCREMENt CHANGE
  const [customBid, setCustomBid] = useState(10);
  const [viewerCount, setViewerCount] = useState(0);
  const [username, setUsername] = useState("");

  // CHANGE: custom items loaded from DB
  const [customItems, setCustomItems] = useState([]);

  const [isAuctionActive, setIsAuctionActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(AUCTION_DURATION_SECONDS);
  const [endTime, setEndTime] = useState(0);
  const [saleMode, setSaleMode] = useState("auction"); // 'auction' | 'live_sell'
  const [isLiveSellActive, setIsLiveSellActive] = useState(false);
  const [liveSellEndTime, setLiveSellEndTime] = useState(0);
  const [liveSellPrice, setLiveSellPrice] = useState(0);
  const [showModePicker, setShowModePicker] = useState(false);
  const [upiConfig, setUpiConfig] = useState({ upiId: "", payeeName: "", notePrefix: "" });

  // CHANGE: current item becomes a snapshot object (static/custom)
  const [selectedItem, setSelectedItem] = useState(null); // { kind: 'static'|'custom', id, name, desc, startPrice }

  const [showInventory, setShowInventory] = useState(false);


  // CHANGE: modal state for adding custom items
  const [showAddCustomItem, setShowAddCustomItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  
const chatEndRef = useRef(null);
const chatContainerRef = useRef(null);
	const isAuctionActiveRef = useRef(false);
	const currentBidRef = useRef(0);
	const bidIncrementRef = useRef(10); // BIDINCREMENt CHANGE
	const isLiveSellActiveRef = useRef(false);
  const presenceStatusRef = useRef("online");


// CHANGE: ref holds the same snapshot as selectedItem (not just an id)
const currentItemRef = useRef(null);

	const currentAuctionIdRef = useRef(null); // change here
	const currentAuctionItemRef = useRef(null); // change here
	const currentLiveSellIdRef = useRef(null);
	const currentLiveSellItemRef = useRef(null);
	const currentLiveSellPriceRef = useRef(0);

  const stopAuctionTriggeredRef = useRef(false);
  const stopLiveSellTriggeredRef = useRef(false);

  // For enforcing bans/kicks
  const [restrictions, setRestrictions] = useState({ isMuted: false, isBidBanned: false, isKicked: false }); // changes
  const searchParams = new URLSearchParams(window.location.search);
  const persistentDbKey = searchParams.get('dbKey');
  const persistentUserId = searchParams.get('uid');

    useEffect(() => {
  const chatRef = query(ref(db, `rooms/${roomId}/chat`), limitToLast(50)); //EFF CHANGE
  const pinnedRef = ref(db, `rooms/${roomId}/pinnedChat`);
  const bidRef = ref(db, `rooms/${roomId}/bid`);
  const auctionRef = ref(db, `rooms/${roomId}/auction`);
  const liveSellRef = ref(db, `rooms/${roomId}/liveSell`);
  const saleModeRef = ref(db, `rooms/${roomId}/saleMode`);
  const viewersRef = ref(db, `rooms/${roomId}/viewers`);
  const itemRef = ref(db, `rooms/${roomId}/currentItem`);
  const bidIncrementConfigRef = ref(db, `event_config/bid_increment`); // BIDINCREMENt CHANGE
  const upiConfigRef = ref(db, `event_config/upi`);

  // CHANGE: custom items live in DB per-room
  const customItemsRef = ref(db, `rooms/${roomId}/customItems`);
  const unsubChat = onValue(chatRef, (snapshot) => { //EFF CHANGE
    const data = snapshot.val();
    if (data) setMessages(Object.values(data));
  });

  const unsubPinned = onValue(pinnedRef, (snapshot) => {
    const data = snapshot.val();
    setPinnedMessage(data || null);
  });

  const unsubAuction = onValue(auctionRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      setIsAuctionActive(data.isActive);
      isAuctionActiveRef.current = data.isActive;
      setEndTime(data.endTime || 0);
      if (data.isActive) stopAuctionTriggeredRef.current = false;

      currentAuctionIdRef.current = data.id || null;
      currentAuctionItemRef.current = data.itemSnapshot || null;
    } else {
      currentAuctionIdRef.current = null; // change here
      currentAuctionItemRef.current = null; // change here
    }
  });

  const unsubSaleMode = onValue(saleModeRef, (snapshot) => {
    const mode = snapshot.val();
    setSaleMode(mode === 'live_sell' ? 'live_sell' : 'auction');
  });

  const unsubLiveSell = onValue(liveSellRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const active = !!data.isActive;
      setIsLiveSellActive(active);
      isLiveSellActiveRef.current = active;
      setLiveSellEndTime(data.endTime || 0);
      if (active) stopLiveSellTriggeredRef.current = false;

      currentLiveSellIdRef.current = data.id || null;
      currentLiveSellItemRef.current = data.itemSnapshot || null;
      const price = Number(data.price) || 0;
      setLiveSellPrice(price);
      currentLiveSellPriceRef.current = price;
    } else {
      setIsLiveSellActive(false);
      isLiveSellActiveRef.current = false;
      setLiveSellEndTime(0);
      setLiveSellPrice(0);
      currentLiveSellPriceRef.current = 0;
      currentLiveSellIdRef.current = null;
      currentLiveSellItemRef.current = null;
    }
  });

  const unsubBid = onValue(bidRef, (snapshot) => {
    const price = snapshot.val() || 0;
    setCurrentBid(price);
    currentBidRef.current = price;
    setCustomBid((prev) => {
      const minNextBid = price + bidIncrementRef.current; // BIDINCREMENt CHANGE
      if (!isAuctionActiveRef.current) return minNextBid;
      return prev < minNextBid ? minNextBid : prev;
    });
  });

  const unsubBidIncrement = onValue(bidIncrementConfigRef, (snapshot) => { // BIDINCREMENt CHANGE
    const raw = Number(snapshot.val()); // BIDINCREMENt CHANGE
    const nextIncrement = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10; // BIDINCREMENt CHANGE
    bidIncrementRef.current = nextIncrement; // BIDINCREMENt CHANGE
    setBidIncrement(nextIncrement); // BIDINCREMENt CHANGE

    setCustomBid((prev) => { // BIDINCREMENt CHANGE
      const minNextBid = currentBidRef.current + nextIncrement; // BIDINCREMENt CHANGE
      if (!isAuctionActiveRef.current) return minNextBid; // BIDINCREMENt CHANGE
      return prev < minNextBid ? minNextBid : prev; // BIDINCREMENt CHANGE
    });
  });

  const unsubUpiConfig = onValue(upiConfigRef, (snapshot) => {
    const data = snapshot.val() || {};
    setUpiConfig({
      upiId: typeof data?.upiId === "string" ? data.upiId.trim() : "",
      payeeName: typeof data?.payeeName === "string" ? data.payeeName.trim() : "",
      notePrefix: typeof data?.notePrefix === "string" ? data.notePrefix.trim() : "",
    });
  });

  const getPresenceMeta = (presence) => {
    if (!presence || typeof presence !== "object") return null;
    if (typeof presence.lastChanged === "number") {
      return {
        lastChanged: presence.lastChanged,
        state: presence.state || "online"
      };
    }
    // Support legacy per-connection shape: viewers/{uid}/{connId}
    let latest = null;
    Object.values(presence).forEach((entry) => {
      const lastChanged = Number(entry?.lastChanged) || 0;
      if (!lastChanged) return;
      if (!latest || lastChanged > latest.lastChanged) {
        latest = { lastChanged, state: entry?.state || "online" };
      }
    });
    return latest;
  };

  const unsubViewers = onValue(
    viewersRef,
    (snapshot) => {
      const data = snapshot.val() || {};
      const now = Date.now();
      let count = 0;
      Object.entries(data).forEach(([uid, presence]) => {
        if (uid === "HOST" || uid === "MODERATOR") return;
        const meta = getPresenceMeta(presence);
        if (!meta) return;
        if (now - meta.lastChanged <= PRESENCE_TTL_MS) count += 1;
      });
      setViewerCount(count);
    },
    () => setViewerCount(0)
  );

  const unsubItem = onValue(itemRef, (snapshot) => {
    const raw = snapshot.val();

    if (!raw) {
      setSelectedItem(null);
      currentItemRef.current = null;
      return;
    }

    // CHANGE: backwards compatible — old schema stored just a numeric item id
    if (typeof raw === "number") {
      const item = INVENTORY.find((i) => i.id === raw);
      const normalized = item
        ? {
            kind: "static",
            id: item.id,
            name: item.name,
            desc: item.desc || "",
            startPrice: Number(item.startPrice) || 0,
          }
        : { kind: "static", id: raw, name: `Item #${raw}`, desc: "", startPrice: 0 };

      setSelectedItem(normalized);
      currentItemRef.current = normalized;
      return;
    }

    // CHANGE: new schema stores full snapshot object
    const normalized = {
      kind: raw.kind === "custom" ? "custom" : "static",
      id: raw.id,
      name: typeof raw.name === "string" ? raw.name : "Unknown Item",
      desc: typeof raw.desc === "string" ? raw.desc : "",
      startPrice: Number(raw.startPrice) || 0,
    };

    setSelectedItem(normalized);
    currentItemRef.current = normalized;
  });

  // CHANGE: load custom items from DB
  const unsubCustomItems = onValue(customItemsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      setCustomItems([]);
      return;
    }

    const items = Object.entries(data).map(([id, val]) => ({
      kind: "custom",
      id,
      name: typeof val?.name === "string" ? val.name : "Custom Item",
      desc: typeof val?.desc === "string" ? val.desc : "",
      startPrice: Number(val?.startPrice) || 0,
      createdAt: Number(val?.createdAt) || 0,
    }));

    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    setCustomItems(items);
  });

  return () => {
    unsubChat();
    unsubPinned();
    unsubBid();
    unsubBidIncrement(); // BIDINCREMENt CHANGE
    unsubUpiConfig();
    unsubAuction();
    unsubSaleMode();
    unsubLiveSell();
    unsubViewers();
    unsubItem();
    unsubCustomItems();
  };
}, [roomId]);


  // --- SYNC USERNAME ---
  useEffect(() => {
      if (assignedUsername) {
          setUsername(assignedUsername);
      } else if (isHost) {
          setUsername("HOST");
      } else if (isModerator) {
          setUsername("MODERATOR");
      } else {
          // Fallback if DB hasn't loaded yet
          setUsername("Guest");
      }
  }, [assignedUsername, isHost, isModerator]);

  // --- PRESENCE SYSTEM (UPDATED: VISIBILITY TRACKING) ---
  useEffect(() => {
      if (persistentUserId) {
          console.log(`[Presence] Tracking for ${persistentUserId}`);
          const myPresenceRef = ref(db, `rooms/${roomId}/viewers/${persistentUserId}`);
          const connectedRef = ref(db, ".info/connected");
          
          // Helper: Updates status in DB
          // We now store an OBJECT instead of just 'true'
          const updateStatus = (status) => {
          const now = Date.now();
          presenceStatusRef.current = status;

          set(myPresenceRef, {
            state: status,
            lastChanged: now
          }).catch(err => console.error("Presence Write Failed:", err));

          update(ref(db), { //EFF CHANGE
            [`rooms/${roomId}/audience_index/${persistentUserId}/presenceState`]: status,
            [`rooms/${roomId}/audience_index/${persistentUserId}/lastSeen`]: now,
          }).catch(err => console.error("Index Presence Update Failed:", err));
        };

          // 1. Initial Set: Online
          updateStatus('online');

          // Re-arm onDisconnect on every reconnect
          const unsubConnected = onValue(connectedRef, (snap) => {
              if (snap.val() === true) {
                  onDisconnect(myPresenceRef).remove();
              }
          });
          
          // 2. Listener: Detect Tab Switching (True Attention)
          const handleVisibility = () => {
              if (document.hidden) {
                  updateStatus('idle'); // User minimized tab / switched apps
              } else {
                  updateStatus('online'); // User is actively watching
              }
          };

          document.addEventListener("visibilitychange", handleVisibility);

          // 3. Heartbeat to keep presence fresh
          const heartbeat = setInterval(() => {
              updateStatus(presenceStatusRef.current || "online");
          }, PRESENCE_HEARTBEAT_MS);

          // 4. Best-effort immediate cleanup when the tab closes or navigates away
          const handlePageHide = () => {
              remove(myPresenceRef).catch(() => {});
          };
          window.addEventListener("pagehide", handlePageHide);
          window.addEventListener("beforeunload", handlePageHide);
          
          // 5. Auto-remove on disconnect (Network Loss/Close)
          onDisconnect(myPresenceRef).remove();
          
          // 6. Cleanup
          return () => { 
              clearInterval(heartbeat);
              document.removeEventListener("visibilitychange", handleVisibility);
              window.removeEventListener("pagehide", handlePageHide);
              window.removeEventListener("beforeunload", handlePageHide);
              unsubConnected();
    
          };
      } else {
          console.warn("[Presence] No User ID found in URL. Tracking skipped.");
      }
  }, [roomId, persistentUserId]);

  useEffect(() => {
      const activeMode = isAuctionActive ? 'auction' : isLiveSellActive ? 'live_sell' : null;
      const activeEndTime = isAuctionActive ? endTime : liveSellEndTime;

      if (!activeMode || !activeEndTime) {
          setTimeLeft(AUCTION_DURATION_SECONDS);
          return;
      }
      const interval = setInterval(() => {
          const now = Date.now();
          const remaining = Math.max(0, Math.ceil((activeEndTime - now) / 1000));
          setTimeLeft(remaining);
          // Only stop if we haven't already triggered it
          if (remaining === 0 && isHost) {
              if (activeMode === 'auction') {
                  if (!stopAuctionTriggeredRef.current) {
                      stopAuctionTriggeredRef.current = true;
                      stopAuction();
                  }
              } else if (!stopLiveSellTriggeredRef.current) {
                  stopLiveSellTriggeredRef.current = true;
                  stopLiveSell();
              }
          }
      }, 100);
      return () => clearInterval(interval);
  }, [isAuctionActive, endTime, isLiveSellActive, liveSellEndTime, isHost]);

  useEffect(() => {
      if (chatEndRef.current) {
          chatEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
  }, [messages]);

  // CHANGE: merged list = custom items (DB) + static CSV
  const inventoryItems = [
    ...customItems,
    ...INVENTORY.map((i) => ({
      kind: "static",
      id: i.id,
      name: i.name,
      desc: i.desc || "",
      startPrice: Number(i.startPrice) || 0,
    })),
  ];

  // CHANGE: reset by selected item instead of numeric id
 useEffect(() => {
  }, [selectedItem?.kind, selectedItem?.id]);



  // --- LISTEN FOR MODERATOR ACTIONS ---
  useEffect(() => {
      if (!persistentDbKey) return;
      
      const restrictionsRef = ref(db, `audience_data/${roomId}/${persistentDbKey}/restrictions`);
      const unsub = onValue(restrictionsRef, (snapshot) => {
          const data = snapshot.val() || {}; // changes
          const nextRestrictions = { // changes: always keep full shape
              isMuted: !!data.isMuted,
              isBidBanned: !!data.isBidBanned,
              isKicked: !!data.isKicked,
          };
          setRestrictions(nextRestrictions);
          // Immediate Kick Action
          if (nextRestrictions.isKicked) {
              alert("You have been kicked by the moderator.");
              window.location.href = '/'; 
          }
      });
      return () => unsub();
  }, [roomId, persistentDbKey]);

  // --- ACTIONS ---
  const canPinMessage = (msg) => {
  if (!(isHost || isModerator)) return false;
  if (!msg || msg.type !== 'msg') return false;
  if (msg.isHost || msg.isModerator) return true;
  if (msg.role === "host" || msg.role === "moderator") return true;
  if (msg.user === "HOST" || msg.user === "MODERATOR") return true;
  if (msg.user && msg.user === username) return true;
  return false;
};

const pinMessage = (msg) => {
  if (!canPinMessage(msg)) return;
  const payload = {
    user: msg.user || "Unknown",
    text: msg.text || "",
    type: msg.type || "msg",
    sourceCreatedAt: Number(msg.createdAt) || null,
    pinnedAt: Date.now(),
    pinnedBy: isHost ? "host" : "moderator",
  };
  set(ref(db, `rooms/${roomId}/pinnedChat`), payload);
};

const unpinMessage = () => {
  if (!(isHost || isModerator)) return;
  remove(ref(db, `rooms/${roomId}/pinnedChat`));
};

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
      isModerator,
      role: isHost ? "host" : isModerator ? "moderator" : "viewer",
      createdAt: Date.now(),
      type: 'msg'
    });
    logEvent(roomId, 'CHAT_SENT', { user: username, type: 'msg' });
    setInput("");
  };

    // CHANGE: only host can select the auction item
  const selectItem = (item) => {
    if (isAuctionActive || isLiveSellActive) return;
    if (!isHost) return;

    // CHANGE: store the full snapshot in DB (works for static + custom)
    const itemSnapshot = {
      kind: item.kind === "custom" ? "custom" : "static",
      id: item.id,
      name: typeof item.name === "string" ? item.name : "Unknown Item",
      desc: typeof item.desc === "string" ? item.desc : "",
      startPrice: Number(item.startPrice) || 0,
    };

    set(ref(db, `rooms/${roomId}/currentItem`), itemSnapshot);

    // CHANGE: starting bid = custom item price
    set(ref(db, `rooms/${roomId}/bid`), itemSnapshot.startPrice);

    setShowInventory(false);
  };

  // CHANGE: host+moderator can open add-item modal
  const openAddCustomItem = () => {
    if (!(isHost || isModerator)) return;
    setShowAddCustomItem(true);
    setShowInventory(false);
  };

  // CHANGE: helper to clear modal fields
  const resetAddCustomItemForm = () => {
    setNewItemName("");
    setNewItemPrice("");
    setNewItemDesc("");
  };

  // CHANGE: write custom item to DB under rooms/{roomId}/customItems
  const submitAddCustomItem = async (e) => {
    e.preventDefault();
    if (!(isHost || isModerator)) return;

    const name = newItemName.trim();
    const price = parseInt(newItemPrice, 10);
    const desc = newItemDesc.trim();

    if (!name) return alert("Please enter an item name.");
    if (!Number.isFinite(price) || price < 0) return alert("Please enter a valid starting bid.");

    await push(ref(db, `rooms/${roomId}/customItems`), {
      name,
      desc,
      startPrice: price,
      createdAt: Date.now(),
      createdByRole: isHost ? "host" : "moderator",
    });

    setShowAddCustomItem(false);
    resetAddCustomItemForm();
  };
   const deleteCustomItem = async (itemId) => {
    if (!(isHost || isModerator)) return;
    if (!window.confirm("Delete this custom item?")) return;

    // CHANGE: remove from DB
    await remove(ref(db, `rooms/${roomId}/customItems/${itemId}`));

    // CHANGE: if the deleted item is currently selected, clear selection
    if (selectedItem?.kind === 'custom' && selectedItem?.id === itemId) {
      await set(ref(db, `rooms/${roomId}/currentItem`), null);
    }
  };

  const handlePriceChange = (e) => {
      if (isAuctionActive || isLiveSellActive) return; 
      const valStr = e.target.value;
      if (valStr === '') set(ref(db, `rooms/${roomId}/bid`), 0);
      else {
          const val = parseInt(valStr);
          if (!isNaN(val)) set(ref(db, `rooms/${roomId}/bid`), val);
      }
  };

  const manualStep = (amount) => {
      if (isAuctionActive || isLiveSellActive) return;
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
    setCustomBid(prev => prev + bidIncrement); // BIDINCREMENt CHANGE
};

const handleDecrease = () => {
    if (customBid > currentBid + bidIncrement) { // BIDINCREMENt CHANGE
        triggerHaptic(); // <--- Add this
        setCustomBid(prev => prev - bidIncrement); // BIDINCREMENt CHANGE
    }
};

const getPhoneFromUserId = (userId) => {
  if (!userId) return "N/A";
  const match = userId.match(/(\d{7,})$/); // grabs trailing digits
  return match ? match[1] : "N/A";
};

const buildUpiQuery = ({ upiId, payeeName, amount, note }) => {
  const cleanedUpiId = typeof upiId === "string" ? upiId.trim() : "";
  if (!cleanedUpiId) return "";

  const params = new URLSearchParams();
  params.set("pa", cleanedUpiId);
  if (payeeName) params.set("pn", payeeName);
  if (note) params.set("tn", note);
  if (Number.isFinite(amount) && amount > 0) params.set("am", Number(amount).toFixed(2));
  params.set("cu", "INR");

  return params.toString();
};

const buildUpiDeepLink = ({ upiId, payeeName, amount, note, scheme = "upi", path = "pay" }) => {
  const query = buildUpiQuery({ upiId, payeeName, amount, note });
  if (!query) return "";
  return `${scheme}://${path}?${query}`;
};

const buildAndroidGpayIntent = ({ upiId, payeeName, amount, note }) => {
  const query = buildUpiQuery({ upiId, payeeName, amount, note });
  if (!query) return "";
  return `intent://pay?${query}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`;
};

const openUpiPayment = ({ upiId, payeeName, amount, note }) => {
  const upiLink = buildUpiDeepLink({ upiId, payeeName, amount, note, scheme: "upi", path: "pay" });
  if (!upiLink) {
    alert("Payment link not configured. Please contact the host.");
    return;
  }

  const ua = navigator.userAgent || "";
  const isIOS = /iP(hone|ad|od)/.test(ua);
  const isAndroid = /Android/i.test(ua);

  // iOS Safari often shows "address invalid" for custom schemes if the app isn't resolvable.
  // Use the generic UPI link on iOS; Google Pay will still open if installed.
  if (isIOS) {
    window.location.href = upiLink;
    return;
  }

  if (!isAndroid) {
    window.location.href = upiLink;
    return;
  }

  const gpayIntent = buildAndroidGpayIntent({ upiId, payeeName, amount, note });

  // Android: Try Google Pay via Intent, then fall back to generic UPI if it doesn't open
  window.location.href = gpayIntent || upiLink;
  window.setTimeout(() => {
    if (document.visibilityState === "visible") {
      window.location.href = upiLink;
    }
  }, 800);
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
    const minAllowed = safeCurrent + bidIncrementRef.current; // BIDINCREMENt CHANGE
    if (customBid >= minAllowed) return customBid; // BIDINCREMENt CHANGE
    return;
  }).then((result) => {
    if (!result.committed) return;

    set(lastBidderRef, username);

    const phone = getPhoneFromUserId(persistentUserId);
    const auctionId = currentAuctionIdRef.current;
    if (!auctionId) return;

    push(ref(db, `rooms/${roomId}/auctionBids/${auctionId}`), {
      user: username,
      phone,
      amount: customBid,
      timestamp: Date.now()
    });

    // If bid is placed in the last 10 seconds, add random 0-5 seconds
    const now = Date.now();
    const timeRemaining = endTime - now;

    if (timeRemaining <= 10000 && timeRemaining > 0) {
      const randomSeconds = Math.floor(Math.random() * 6);
      if (randomSeconds > 0) {
        const bonusTime = randomSeconds * 1000;
        update(ref(db, `rooms/${roomId}/auction`), {
          endTime: endTime + bonusTime
        });

        push(ref(db, `rooms/${roomId}/chat`), {
          text: `Overtime! +${randomSeconds}s added`,
          type: 'auction'
        });
      }
    }

    push(ref(db, `rooms/${roomId}/chat`), {
      text: `${username} bid INR ${customBid}`,
      type: 'bid'
    });

    logEvent(roomId, 'BID_PLACED', {
      user: username,
      amount: customBid,
      item: currentItemRef.current ? currentItemRef.current.name : 'Unknown'
    });
  });
};

const bookLiveSell = async () => {
  if (!isLiveSellActiveRef.current) return;
  if (isHost || isModerator || isSpectator) return;
  if (restrictions.isBidBanned) {
    alert("You are banned from booking.");
    return;
  }
  if (!persistentUserId) {
    alert("Unable to book: missing user ID.");
    return;
  }

  const sessionId = currentLiveSellIdRef.current;
  const itemSnapshot = currentLiveSellItemRef.current || currentItemRef.current;
  if (!sessionId || !itemSnapshot) return;

  const price = Number.isFinite(currentLiveSellPriceRef.current)
    ? currentLiveSellPriceRef.current
    : (Number(itemSnapshot.startPrice) || 0);

  const profileSnap = await get(ref(db, `rooms/${roomId}/audience_index/${persistentUserId}`));
  const profile = profileSnap.exists() ? profileSnap.val() : {};
  const booking = {
    user: profile?.username || username || "Guest",
    phone: profile?.phone || getPhoneFromUserId(persistentUserId),
    price,
    userId: persistentUserId,
    timestamp: Date.now(),
  };

  const bookingRef = ref(db, `rooms/${roomId}/liveSellBookings/${sessionId}/${persistentUserId}`);
  const result = await runTransaction(bookingRef, (current) => {
    if (current) return; // already booked
    return booking;
  });

  if (!result.committed) {
    alert("You already booked this item.");
    return;
  }

  push(ref(db, `rooms/${roomId}/chat`), {
    text: `${booking.user} booked ${itemSnapshot.name} for ₹${price}`,
    type: 'booking'
  });

  const notePrefix = upiConfig.notePrefix || "DIBS Live Sell";
  const note = `${notePrefix}: ${itemSnapshot?.name || "Item"}`;
  openUpiPayment({
    upiId: upiConfig.upiId,
    payeeName: upiConfig.payeeName,
    amount: price,
    note
  });
};
  const startAuction = () => {
    // CHANGE: require selected snapshot (works for static/custom)
    if (!currentItemRef.current) {
      alert("Please select an item first!");
      return;
    }
    if (isLiveSellActiveRef.current) {
      alert("Please stop Live Sell before starting an auction.");
      return;
    }

   const newEndTime = Date.now() + (AUCTION_DURATION_SECONDS * 1000);
    const item = currentItemRef.current;
    const auctionId = push(ref(db, `rooms/${roomId}/auctionSessions`)).key;

    update(ref(db, `rooms/${roomId}`), {
      "auction/isActive": true,
      "auction/endTime": newEndTime,
      "auction/id": auctionId,
      "auction/itemSnapshot": item,
      "lastBidder": null,
    });

    
 push(ref(db, `rooms/${roomId}/chat`), {
    text: `Auction started: ${item?.name || 'ITEM'}`, // change here
    type: 'auction'
  });
};

      const stopAuction = async () => {
      const finalPrice = currentBidRef.current;

      const auctionId = currentAuctionIdRef.current; // change here
      const itemSnapshot = currentAuctionItemRef.current; // change here
      if (!auctionId) return; // change here

      if (isAuctionActiveRef.current) {
        const snapshot = await get(ref(db, `rooms/${roomId}/lastBidder`));
        const winnerName = snapshot.exists() ? snapshot.val() : "Nobody";
        // 2. NEW: Fetch session bids to calculate Top 3 for Moderator
        const bidsSnap = await get(ref(db, `rooms/${roomId}/auctionBids/${auctionId}`)); // change here
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
          itemName: itemSnapshot ? itemSnapshot.name : "Unknown Item", // change here
          item: itemSnapshot || null, // change here
          finalPrice: finalPrice,
          winner: winnerName,
          topBidders: top3,
          timestamp: Date.now(),
          auctionId, // change here (optional but recommended)

        });
        
        push(ref(db, `rooms/${roomId}/chat`), {
            text: `🛑 ${winnerName} CALLED DIBS ON ${itemSnapshot ? itemSnapshot.name : 'ITEM'} FOR ₹${finalPrice}!`, // change here
            type: 'auction'
        });
      }
      // 4. Cleanup
      update(ref(db, `rooms/${roomId}`), { "auction/isActive": false, "auction/endTime": 0 });
      remove(ref(db, `rooms/${roomId}/auctionBids/${auctionId}`)); // change here
  };

  const toggleAuction = () => {
      if (isAuctionActive) stopAuction();
      else startAuction();
  };

  const startLiveSell = () => {
    if (!currentItemRef.current) {
      alert("Please select an item first!");
      return;
    }
    if (isAuctionActiveRef.current) {
      alert("Please stop the auction before starting Live Sell.");
      return;
    }

    const newEndTime = Date.now() + (LIVE_SELL_DURATION_SECONDS * 1000);
    const item = currentItemRef.current;
    const sessionId = push(ref(db, `rooms/${roomId}/liveSellSessions`)).key;
    const price = Number.isFinite(currentBidRef.current) ? currentBidRef.current : (Number(item?.startPrice) || 0);

    update(ref(db, `rooms/${roomId}`), {
      "liveSell/isActive": true,
      "liveSell/endTime": newEndTime,
      "liveSell/id": sessionId,
      "liveSell/itemSnapshot": item,
      "liveSell/price": price,
      "liveSell/startedAt": Date.now(),
    });

    push(ref(db, `rooms/${roomId}/chat`), {
      text: `Live Sell started: ${item?.name || 'ITEM'} for ₹${price}`,
      type: 'auction'
    });
  };

  const stopLiveSell = async () => {
    const sessionId = currentLiveSellIdRef.current;
    const itemSnapshot = currentLiveSellItemRef.current;
    const price = Number.isFinite(currentLiveSellPriceRef.current) ? currentLiveSellPriceRef.current : (Number(itemSnapshot?.startPrice) || 0);
    if (!sessionId) return;

    if (isLiveSellActiveRef.current) {
      const bookingsSnap = await get(ref(db, `rooms/${roomId}/liveSellBookings/${sessionId}`));
      const bookings = bookingsSnap.exists() ? Object.values(bookingsSnap.val()) : [];
      const normalized = bookings
        .map((b) => ({
          user: b?.user || "Unknown",
          phone: b?.phone || "",
          price: Number(b?.price) || price,
          timestamp: Number(b?.timestamp) || 0,
          userId: b?.userId || "",
        }))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      push(ref(db, `rooms/${roomId}/liveSellHistory`), {
        itemName: itemSnapshot ? itemSnapshot.name : "Unknown Item",
        item: itemSnapshot || null,
        price,
        bookings: normalized,
        sold: normalized.length > 0,
        timestamp: Date.now(),
        sessionId,
      });

      push(ref(db, `rooms/${roomId}/chat`), {
        text: normalized.length
          ? `Live Sell ended: ${normalized.length} booking(s) for ${itemSnapshot ? itemSnapshot.name : 'ITEM'}`
          : `Live Sell ended: No bookings for ${itemSnapshot ? itemSnapshot.name : 'ITEM'}`,
        type: 'auction'
      });
    }

    update(ref(db, `rooms/${roomId}`), { "liveSell/isActive": false, "liveSell/endTime": 0 });
    remove(ref(db, `rooms/${roomId}/liveSellBookings/${sessionId}`));
  };

  const toggleLiveSell = () => {
    if (isLiveSellActive) stopLiveSell();
    else startLiveSell();
  };

  const toggleSale = () => {
    if (saleMode === 'live_sell') toggleLiveSell();
    else toggleAuction();
  };

  const setSaleModeInDb = async (mode) => {
    if (!isHost) return;
    if (isAuctionActive || isLiveSellActive) return;
    const next = mode === 'live_sell' ? 'live_sell' : 'auction';
    await set(ref(db, `rooms/${roomId}/saleMode`), next);
    setShowModePicker(false);
  };

  const isSaleActive = isAuctionActive || isLiveSellActive;
  const isLiveSellMode = saleMode === 'live_sell';
  const priceLabel = isAuctionActive
    ? "Current Bid"
    : isLiveSellMode
      ? "Live Price"
      : "Starting Price";
  const canSwitchMode = isHost && !isSaleActive;
  const isBidder = !isHost && !isModerator && !isSpectator;
  const liveSellDisplayPrice = isLiveSellActive ? liveSellPrice : currentBid;
  const saleModeButtonBottom = "calc(15.25rem + env(safe-area-inset-bottom))";
  const saleStartButtonBottom = "calc(2.25rem + env(safe-area-inset-bottom))";
  const bidderWrapClass = "flex flex-col items-center gap-2 transition-all duration-300";
  const liveSellButtonClass = isLiveSellActive
    ? 'w-full py-4 rounded-[2rem] transition-all flex flex-col items-center justify-center gap-1 bg-[#FF6600] text-white active:scale-95 hover:bg-[#ff8533] cursor-pointer'
    : 'w-full py-4 rounded-[2rem] transition-all flex flex-col items-center justify-center gap-1 bg-zinc-800 text-zinc-600 cursor-not-allowed';
  const auctionButtonClass = isAuctionActive
    ? 'w-full py-4 rounded-[2rem] font-black tracking-tighter transition-all flex items-center justify-center text-2xl sm:text-3xl bg-[#FF6600] text-white active:scale-95 hover:bg-[#ff8533] cursor-pointer'
    : 'w-full py-4 rounded-[2rem] font-black tracking-tighter transition-all flex items-center justify-center text-2xl sm:text-3xl bg-zinc-800 text-zinc-600 cursor-not-allowed';

  useEffect(() => {
      if (isSaleActive) setShowModePicker(false);
  }, [isSaleActive]);

  // DYNAMIC STYLES
  // If Spectator: Full Width. If Bidder/Host: 55% Width.
  const leftColumnClass = isSpectator 
      ? "w-full max-w-md mx-auto" 
      : "w-[55%] max-w-[14rem]";

  const renderBidderControls = () => {
    if (!isBidder) return null;

    if (isLiveSellMode) {
      return (
        <div className={bidderWrapClass}>
        <div className="bg-black rounded-[2.5rem] p-4 shadow-2xl border border-white/10 w-full mb-4 min-h-[6rem] flex flex-col justify-center">
            <button
              onClick={bookLiveSell}
              disabled={!isLiveSellActive}
              className={liveSellButtonClass}
            >
              <span className="text-[12px] uppercase tracking-[0.35em] font-black">
                Buy
              </span>
            </button>
            <div className="text-[10px] text-zinc-500 text-center mt-2">
              {LIVE_SELL_DURATION_SECONDS}s booking window
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={bidderWrapClass}>
        <div className="bg-black rounded-[2.5rem] p-2 shadow-2xl border border-white/10 w-full mb-4">
          <div className="flex items-center justify-between px-2 py-2">
            <button 
              onClick={handleDecrease} 
              disabled={!isAuctionActive || customBid <= currentBid + bidIncrement} // BIDINCREMENt CHANGE
              className={`text-white hover:text-zinc-300 active:scale-90 transition-all p-2 ${(!isAuctionActive || customBid <= currentBid + bidIncrement) ? 'cursor-not-allowed' : ''}`} // BIDINCREMENt CHANGE
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
            className={auctionButtonClass}
          >
            <span>{"\u20B9"}{customBid}</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden max-w-md mx-auto border-x border-white/5 shadow-2xl">
      
      {/* TOP CENTER: VIEWERS */}
      <div className="absolute top-[calc(1.25rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 pointer-events-auto z-[60]">
          <div className={`${glassSurface} ${glassHighlight} rounded-full px-3 py-1 flex items-center gap-2`}>
              <Eye className="w-3 h-3 text-red-500 animate-pulse" />
              <span className="text-xs font-display font-bold text-white tabular-nums">{viewerCount}</span>
          </div>
      </div>

      {/* TOP RIGHT: STATS (Unchanged) */}
      <div className="absolute top-[calc(4rem+env(safe-area-inset-top))] right-4 pointer-events-auto flex flex-col items-end gap-2 z-[60]">
          {/* ... (Keep existing stats code) ... */}
          <div className={`${glassSurface} ${glassHighlight} p-2 min-w-fit px-4 flex flex-col items-end transition-colors ${isSaleActive ? 'bg-red-600/45 border-[#FF6600]' : ''}`}>
	<span className={`text-[11px] font-display uppercase font-black tracking-wider mb-1 px-1 ${isSaleActive ? 'text-white' : 'text-[#FF6600]'}`}>
	  {priceLabel}
	</span>
    {/* --- CHANGE 1: RESTORED HOST PRICE CONTROLS --- */}
    <div className="flex items-center justify-end gap-1 w-full">
        
        {/* A. Manual Step Buttons (Host Only, Inactive Auction) */}
	        {isHost && !isSaleActive && (
	            <div className="flex flex-col gap-0.5 mr-2">
                 <button onClick={() => manualStep(bidIncrement)} className="text-white hover:text-[#FF6600] transition-colors"> {/* BIDINCREMENt CHANGE */}
                     <ChevronUp className="w-3 h-3" />
                 </button>
                 <button onClick={() => manualStep(-bidIncrement)} className="text-white hover:text-[#FF6600] transition-colors"> {/* BIDINCREMENt CHANGE */}
                     <ChevronDown className="w-3 h-3" />
                 </button>
            </div>
        )}

        {/* B. Editable Price Input */}
        <div className="flex items-center justify-end gap-1 flex-1">
            <span className="text-xl font-bold text-[#FF6600]">{"\u20B9"}</span>
            {isHost ? (
              <input 
                  type="number"
                  value={currentBid === 0 ? '' : currentBid}
                  onChange={handlePriceChange}
	                  disabled={isSaleActive}
	                  step={bidIncrement} // BIDINCREMENt CHANGE
	                  placeholder="0"
                  style={{ width: `${Math.max(2, (currentBid?.toString() || "").length + 1)}ch` }}
                  className={`
                      bg-transparent text-right font-display font-black text-4xl outline-none p-0 m-0 placeholder:text-white/20 pointer-events-auto relative z-[70]
	                      ${isSaleActive ? 'text-white' : 'text-white border-b border-dashed border-white/20'}
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

          {isSaleActive && (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-display text-sm font-bold ${timeLeft <= 10 ? 'bg-red-600 text-white animate-pulse' : 'bg-neutral-800 text-zinc-300 border border-white/10'}`}>
                  <Clock className="w-3 h-3" />
                  <span>00:{timeLeft.toString().padStart(2, '0')}</span>
              </motion.div>
          )}
      </div>

      {/* HOST: SALE MODE ABOVE GO LIVE */}
      {isHost && (
        <div
          className="absolute right-4 z-[70] pointer-events-auto"
          style={{ bottom: saleModeButtonBottom }}
        >
          <div className="relative flex flex-col items-center gap-1">
            <button
              onClick={() => setShowModePicker((prev) => !prev)}
              disabled={!canSwitchMode}
              className={`h-9 w-9 rounded-full flex items-center justify-center transition-all shadow-lg pointer-events-auto border ${
                canSwitchMode
                  ? 'bg-black/70 text-white border-white/20 hover:bg-white/10'
                  : 'bg-black/40 text-white/40 border-white/10 cursor-not-allowed'
              }`}
              title="Sale Mode"
              aria-label="Sale Mode"
            >
              <Settings className="w-4 h-4" />
            </button>

            {showModePicker && (
              <div className="absolute bottom-full mb-2 flex flex-col gap-1 p-1 rounded-xl bg-black/80 border border-white/10 shadow-xl">
                <button
                  type="button"
                  onClick={() => setSaleModeInDb('auction')}
                  className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors ${
                    saleMode === 'auction'
                      ? 'bg-[#FF6600] text-white'
                      : 'bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  Live Auction
                </button>
                <button
                  type="button"
                  onClick={() => setSaleModeInDb('live_sell')}
                  className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors ${
                    saleMode === 'live_sell'
                      ? 'bg-[#FF6600] text-white'
                      : 'bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  Live Sell
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* HOST: SALE START BELOW GO LIVE */}
      {isHost && (
        <div
          className="absolute right-4 z-[70] pointer-events-auto"
          style={{ bottom: saleStartButtonBottom }}
        >
          <button
            onClick={toggleSale}
            className={`h-14 w-14 rounded-full flex items-center justify-center transition-all shadow-lg z-50 pointer-events-auto ${
              isSaleActive
                ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse'
                : 'bg-dibs-neon text-black hover:bg-white'
            }`}
            title={
              isSaleActive
                ? (isLiveSellMode ? 'Stop Live Sell' : 'Stop Auction')
                : (isLiveSellMode ? 'Start Live Sell' : 'Start Auction')
            }
            aria-label={
              isSaleActive
                ? (isLiveSellMode ? 'Stop Live Sell' : 'Stop Auction')
                : (isLiveSellMode ? 'Start Live Sell' : 'Start Auction')
            }
          >
            {isSaleActive ? <X className="w-5 h-5" /> : (isLiveSellMode ? <ShoppingBag className="w-5 h-5" /> : <Gavel className="w-5 h-5" />)}
          </button>
        </div>
      )}
    
<div className="absolute inset-x-0 bottom-0 px-4 pt-4 pb-2 flex flex-col justify-end z-30 pointer-events-none h-[85%]">

      
 
{/* 2. CHAT STREAM (Dynamic Width)  */}
<div 
  ref={chatContainerRef} 
  className={`${leftColumnClass} h-40 overflow-y-auto pointer-events-auto pr-2 transition-all duration-300`}
  style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 50%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 100%)' }}
>

          {/* ... (Keep existing chat message mapping code) ... */}
            <div className="min-h-full flex flex-col justify-end gap-2 pb-1">
            <AnimatePresence initial={false}>
                {messages.map((msg, i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`self-start w-full rounded-[24px] px-4 py-2 shadow-sm break-words font-display ${
                        msg.type === 'bid' || msg.type === 'booking'
                        ? 'bg-[#ff6500] border border-white/20 text-white font-bold'
                        : msg.type === 'auction'
                        ? 'bg-[#161616] border border-[#ff6500] text-white font-bold'
                       : 'bg-[#161616] text-white border border-white/10 font-normal relative pr-10' // CHANGE
                       }`}
                >
                    {msg.type !== 'bid' && msg.type !== 'auction' && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[8px] mr-2 block text-[#FF6600]">
                          {msg.user}
                        </span>
                        {canPinMessage(msg) && (
                          <button
                            type="button"
                            onClick={() => pinMessage(msg)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border transition-colors flex items-center justify-center border-white/15 text-white/70 bg-white/5 hover:text-white"
                            title="Pin message"
                          >
                            <Pin className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                    <span className={`text-[10px] leading-tight block ${msg.type === 'msg' ? 'font-normal' : 'font-bold'}`}>
                        {msg.text}
                    </span>
                </motion.div>
                ))}
                {pinnedMessage && (
              <motion.div
                key="pinned-message"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
               className="self-start w-full rounded-[24px] px-4 py-2 pr-10 shadow-sm break-words font-display bg-[#161616] border border-[#FF6600] text-white relative" // CHANGE
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[8px] mr-2 block text-[#FF6600]">
                    PINNED • {pinnedMessage.user}
                  </span>
                  {(isHost || isModerator) && (
                    <button
                      type="button"
                      onClick={unpinMessage}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full border transition-colors flex items-center justify-center border-white/15 text-white/70 bg-white/5 hover:text-white" // CHANGE
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <span className="text-[10px] leading-tight block font-normal">
                  {pinnedMessage.text}
                </span>
              </motion.div>
            )}
            </AnimatePresence>
            <div ref={chatEndRef} />
          </div>
      </div>

      {/* --- BOTTOM DOCK --- */}
      <div className="flex justify-between items-end w-full pointer-events-none">
        
        {/* LEFT COLUMN: Chat Input + Item Card (Dynamic Width) */}
        <div className={`flex flex-col gap-1 pointer-events-auto transition-all duration-300 ${leftColumnClass}`}>
            
            {/* Chat Input */}
            <form onSubmit={sendMessage} className="relative group w-full mb-1">
                <input 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={`Chat as ${username}...`}
                    className="w-full bg-black/50 backdrop-blur border border-white/20 rounded-full pl-4 pr-10 py-3 text-xs sm:text-sm text-white focus text-base :outline-none focus:border-white/60 transition-all font-display placeholder:text-white/30"
                />
                <button type="submit" className="absolute right-1 top-1 bottom-1 w-8 bg-white/10 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors">
                    <Send className="w-3 h-3" />
                </button>
            </form>

            {/* Item Card (Unchanged content, width handled by parent) */}
            <div className="z-[60] mb-4 relative">
                <AnimatePresence>
                {/* CHANGE: host OR moderator can open inventory and add custom items */}
                {showInventory && (
                  <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.9 }}
                    className="absolute bottom-full mb-2 left-0 w-64 bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-64 overflow-y-auto z-[70]"
                  >
                    <div className="p-3 border-b border-white/10 text-[10px] font-bold uppercase tracking-widest text-zinc-500 bg-black/50 flex items-center justify-between gap-2">
                      <span>{isHost ? "Select Item to Auction" : "Inventory"}</span>

                      {(isHost || isModerator) && (
                        <button
                          type="button"
                          onClick={openAddCustomItem}
                          className="pointer-events-auto text-[10px] font-black uppercase tracking-widest bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded-lg border border-white/10 transition-colors"
                        >
                          + Custom
                        </button>
                      )}
                    </div>

                    {inventoryItems.map((item) => {
                      const canSelect = isHost && !isSaleActive; // CHANGE: only host selects item
                      if (isHost || isModerator) {
                        return (
                          <button
                            key={`${item.kind}:${item.id}`}
                            type="button"
                            onClick={() => {
                              if (canSelect) selectItem(item);
                            }}
                            disabled={!canSelect}
                            className={`p-3 text-left transition-colors border-b border-white/5 last:border-0 group ${
                              canSelect ? "hover:bg-white/10" : "opacity-60 cursor-not-allowed"
                            }`}
                          >
                            <div className="flex justify-between items-center w-full gap-2">
                              <span className="text-sm font-bold text-white ...">
                                  {item.name}
                                  {item.kind === "custom" && (<span className="ml-1 ...">(Custom)</span>)}
                              </span>

                              <div className="flex items-center gap-2">
                                  <span className="text-xs font-display text-dibs-neon">₹{item.startPrice}</span>

                                  {item.kind === "custom" && (isHost || isModerator) && (
                                  <button
                                      type="button"
                                      onClick={(e) => {
                                      e.stopPropagation();
                                      deleteCustomItem(item.id);
                                      }}
                                      className="p-1 rounded-md bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-zinc-400 hover:text-red-400 transition-colors"
                                      title="Delete custom item"
                                  >
                                      <Trash2 className="w-4 h-4" />
                                  </button>
                                  )}
                              </div>
                              </div>
                            <span className="text-xs text-zinc-400 truncate block mt-0.5">{item.desc}</span>
                          </button>
                        );
                      }

                      return (
                        <div
                          key={`${item.kind}:${item.id}`}
                          className="p-3 text-left transition-colors border-b border-white/5 last:border-0"
                        >
                          <div className="flex justify-between items-center w-full gap-2">
                            <span className="text-sm font-bold text-white ...">
                              {item.name}
                              {item.kind === "custom" && (<span className="ml-1 ...">(Custom)</span>)}
                            </span>
                            <span className="text-xs font-display text-dibs-neon">₹{item.startPrice}</span>
                          </div>
                          <span className="text-xs text-zinc-400 truncate block mt-0.5">{item.desc}</span>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
                </AnimatePresence>
                {/* CHANGE: show selectedItem instead of CSV-only currentItem */}
                    {selectedItem ? (
                      <div
                        onClick={() => {
                      if ((isHost && !isSaleActive) || isModerator) setShowInventory(!showInventory); // CHANGE
                        }}
                        className={`
                      w-full bg-black rounded-2xl p-3 flex flex-col gap-1 shadow-2xl border border-white/10
                      ${(isHost && !isSaleActive) || isModerator ? "cursor-pointer hover:bg-zinc-900 active:scale-95 transition-all" : ""}
                    `}
                      >
                  <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[#FF6600] uppercase tracking-wider">
                        {selectedItem.kind === "custom" ? "CUSTOM ITEM" : `ITEM #${selectedItem.id}`}
                      </span>
                                            {((isHost && !isSaleActive) || isModerator) ? (
                        <ChevronUp className={`w-4 h-4 text-zinc-500 transition-transform ${showInventory ? "rotate-180" : ""}`} />
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowInventory(!showInventory);
                          }}
                          className="p-1 rounded-md hover:bg-white/5 transition-colors"
                          aria-label="Toggle inventory"
                        >
                          <ChevronUp className={`w-4 h-4 text-zinc-500 transition-transform ${showInventory ? "rotate-180" : ""}`} />
                        </button>
                      )}

                    </div>


                    <h3 className="text-lg font-bold text-white leading-tight truncate mt-0.5">{selectedItem.name}</h3>

                    <div className="text-xs text-zinc-400 truncate">
                      {selectedItem.desc}
                    </div>
                  </div>

                ) : (
                  (isHost || isModerator) && (
                    <button
                      onClick={() => setShowInventory(!showInventory)}
                      className="bg-dibs-neon text-black font-bold text-xs px-4 py-3 rounded-xl shadow-lg hover:bg-white transition-colors flex items-center gap-2"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      {isHost ? (isLiveSellMode ? "SELECT ITEM TO SELL" : "SELECT ITEM TO AUCTION") : "MANAGE INVENTORY"}
                    </button>
                  )
                )}
            </div>
        </div>

                {/* CHANGE: custom item modal */}
        <AnimatePresence>
          {showAddCustomItem && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[80] pointer-events-auto flex items-center justify-center bg-black/70 backdrop-blur"
              onClick={() => {
                setShowAddCustomItem(false);
                resetAddCustomItemForm();
              }}
            >
              <motion.form
                initial={{ y: 20, scale: 0.98, opacity: 0 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                exit={{ y: 20, scale: 0.98, opacity: 0 }}
                onSubmit={submitAddCustomItem}
                onClick={(e) => e.stopPropagation()}
                className="w-[92%] max-w-sm bg-black border border-white/10 rounded-2xl p-4 shadow-2xl"
              >
                <div className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-3">Add Custom Item</div>

                <div className="space-y-2">
                  <input
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="Item name"
                    className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-3 text-sm text-white outline-none focus:border-white/40"
                  />
                  <input
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                    placeholder="Starting bid (number)"
                    inputMode="numeric"
                    className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-3 text-sm text-white outline-none focus:border-white/40"
                  />
                  <textarea
                    value={newItemDesc}
                    onChange={(e) => setNewItemDesc(e.target.value)}
                    placeholder="Description (optional)"
                    rows={3}
                    className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-3 text-sm text-white outline-none focus:border-white/40 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddCustomItem(false);
                      resetAddCustomItemForm();
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-white/70 hover:text-white border border-white/10 hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-[#FF6600] text-white hover:bg-[#ff8533] transition-colors"
                  >
                    Add
                  </button>
                </div>
              </motion.form>
            </motion.div>
          )}
        </AnimatePresence>


        {/* RIGHT COLUMN: HIDDEN FOR SPECTATORS */}
        {!isSpectator && (
            <div className="flex flex-col gap-2 pointer-events-auto items-end w-[40%] max-w-[10rem]"> 
                
                {/* Bidder Controls */}
                {renderBidderControls()}
            </div>
        )}
      </div>
    </div>       
    </div>
  );
};

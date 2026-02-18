import React, { useEffect, useMemo, useState } from "react";
import { onValue, ref, set, update } from "firebase/database";
import { db } from "../lib/firebase";

const cleanPhone = (raw) => {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
};

const parseCSV = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((v) => v.trim() !== ""));
};

const buildGuestUpdates = (csvText, options) => {
  const rows = parseCSV(csvText);
  if (rows.length === 0) {
    return { updates: {}, summary: { total: 0, valid: 0, invalid: 0 }, errors: [] };
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const indexOfHeader = (candidates) => {
    for (const candidate of candidates) {
      const idx = headers.indexOf(candidate);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const emailIdx = indexOfHeader(["email", "email_address"]);
  const phoneIdx = indexOfHeader(["phone_number", "phone", "phone number", "phone_no"]);
  const nameIdx = indexOfHeader(["name", "full_name"]);
  const firstIdx = indexOfHeader(["first_name", "firstname", "first name"]);
  const lastIdx = indexOfHeader(["last_name", "lastname", "last name"]);
  const approvalIdx = indexOfHeader(["approval_status", "approval"]);
  const ticketIdx = indexOfHeader(["ticket_name", "ticket"]);

  const errors = [];
  const updates = {};
  let valid = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const approval = approvalIdx !== -1 ? String(row[approvalIdx] || "").trim().toLowerCase() : "";
    if (options.onlyApproved && approval && approval !== "approved") {
      continue;
    }

    const email = emailIdx !== -1 ? String(row[emailIdx] || "").trim().toLowerCase() : "";
    const phoneRaw = phoneIdx !== -1 ? row[phoneIdx] : "";
    const phone = cleanPhone(phoneRaw);

    if (!email || !phone) {
      errors.push(`Row ${i + 1}: missing or invalid email/phone`);
      continue;
    }

    let name = nameIdx !== -1 ? String(row[nameIdx] || "").trim() : "";
    if (!name) {
      const first = firstIdx !== -1 ? String(row[firstIdx] || "").trim() : "";
      const last = lastIdx !== -1 ? String(row[lastIdx] || "").trim() : "";
      name = [first, last].filter(Boolean).join(" ").trim();
    }

    const ticketName = ticketIdx !== -1 ? String(row[ticketIdx] || "").trim() : "";

    updates[phone] = {
      email,
      phone,
      name: name || null,
      approval_status: approval || null,
      ticket_name: ticketName || null,
      source: "csv",
      updatedAt: Date.now()
    };
    valid += 1;
  }

  const total = rows.length - 1;
  const invalid = total - valid;

  return { updates, summary: { total, valid, invalid }, errors };
};

export const StreamDashboard = () => {
  const [config, setConfig] = useState({
    active_room_id: "",
    startTime: "",
    endTime: "",
    isMaintenanceMode: false
  });
  const [configDirty, setConfigDirty] = useState(false);
  const [configStatus, setConfigStatus] = useState("");
  const [rooms, setRooms] = useState({});

  const [csvText, setCsvText] = useState("");
  const [onlyApproved, setOnlyApproved] = useState(true);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const configRef = ref(db, "event_config");
    const unsub = onValue(configRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.val();
      if (!configDirty) {
        setConfig({
          active_room_id: data.active_room_id || "",
          startTime: data.startTime || "",
          endTime: data.endTime || "",
          isMaintenanceMode: !!data.isMaintenanceMode
        });
      }
    });
    return () => unsub();
  }, [configDirty]);

  useEffect(() => {
    const roomsRef = ref(db, "rooms");
    const unsub = onValue(roomsRef, (snap) => {
      setRooms(snap.exists() ? snap.val() : {});
    });
    return () => unsub();
  }, []);

  const csvBuild = useMemo(() => {
    if (!csvText) {
      return { updates: {}, summary: { total: 0, valid: 0, invalid: 0 }, errors: [] };
    }
    return buildGuestUpdates(csvText, { onlyApproved });
  }, [csvText, onlyApproved]);

  const handleSaveConfig = async () => {
    setConfigStatus("Saving...");
    try {
      await update(ref(db, "event_config"), {
        active_room_id: config.active_room_id.trim(),
        startTime: config.startTime.trim(),
        endTime: config.endTime.trim(),
        isMaintenanceMode: !!config.isMaintenanceMode
      });
      setConfigDirty(false);
      setConfigStatus("Saved.");
      setTimeout(() => setConfigStatus(""), 2000);
    } catch (err) {
      console.error(err);
      setConfigStatus("Save failed.");
    }
  };

  const handleSetActiveRoom = async (roomId) => {
    const value = String(roomId || "").trim();
    if (!value) return;
    setConfig((prev) => ({ ...prev, active_room_id: value }));
    setConfigDirty(true);
    setConfigStatus("Saving...");
    try {
      await update(ref(db, "event_config"), { active_room_id: value });
      setConfigDirty(false);
      setConfigStatus("Saved.");
      setTimeout(() => setConfigStatus(""), 2000);
    } catch (err) {
      console.error(err);
      setConfigStatus("Save failed.");
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) {
      setCsvText("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result || ""));
      setUploadStatus("");
    };
    reader.onerror = () => {
      setUploadStatus("Failed to read file.");
    };
    reader.readAsText(file);
  };

  const handleUploadGuests = async () => {
    const { updates, summary } = csvBuild;
    if (summary.valid === 0) {
      setUploadStatus("No valid guests to upload.");
      return;
    }
    setIsUploading(true);
    setUploadStatus("Uploading...");
    try {
      if (replaceExisting) {
        await set(ref(db, "allowed_guests"), updates);
      } else {
        await update(ref(db, "allowed_guests"), updates);
      }
      setUploadStatus(`Uploaded ${summary.valid} guests.`);
    } catch (err) {
      console.error(err);
      setUploadStatus("Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full h-screen overflow-y-auto bg-black text-white">
      <div className="max-w-md mx-auto px-6 py-6 space-y-8">
        <div>
          <h1 className="text-xl font-black tracking-widest uppercase">Stream Dashboard</h1>
          <p className="text-xs text-zinc-400 mt-1">Manage event config, active room, and allowed guests.</p>
        </div>

        <section className="border border-zinc-800 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-widest">Event Config</h2>

          <label className="block text-xs uppercase text-zinc-400">Active Room ID</label>
          <input
            className="w-full bg-zinc-900 border border-zinc-700 px-3 py-2 rounded text-sm"
            value={config.active_room_id}
            onChange={(e) => {
              setConfig((prev) => ({ ...prev, active_room_id: e.target.value }));
              setConfigDirty(true);
            }}
            placeholder="ROOM_ID"
          />

          <label className="block text-xs uppercase text-zinc-400">Start Time</label>
          <input
            className="w-full bg-zinc-900 border border-zinc-700 px-3 py-2 rounded text-sm"
            value={config.startTime}
            onChange={(e) => {
              setConfig((prev) => ({ ...prev, startTime: e.target.value }));
              setConfigDirty(true);
            }}
            placeholder="2026-02-18T20:00:00+05:30"
          />

          <label className="block text-xs uppercase text-zinc-400">End Time</label>
          <input
            className="w-full bg-zinc-900 border border-zinc-700 px-3 py-2 rounded text-sm"
            value={config.endTime}
            onChange={(e) => {
              setConfig((prev) => ({ ...prev, endTime: e.target.value }));
              setConfigDirty(true);
            }}
            placeholder="2026-02-18T21:00:00+05:30"
          />

          <label className="flex items-center gap-2 text-xs uppercase text-zinc-400">
            <input
              type="checkbox"
              checked={config.isMaintenanceMode}
              onChange={(e) => {
                setConfig((prev) => ({ ...prev, isMaintenanceMode: e.target.checked }));
                setConfigDirty(true);
              }}
            />
            Maintenance Mode
          </label>

          <button
            onClick={handleSaveConfig}
            className="w-full bg-white text-black py-2 rounded font-black text-xs uppercase tracking-widest"
          >
            Save Config
          </button>
          {configStatus && <div className="text-[10px] text-zinc-400">{configStatus}</div>}
        </section>

        <section className="border border-zinc-800 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-widest">Rooms</h2>
          {Object.keys(rooms).length === 0 && (
            <div className="text-xs text-zinc-500">No rooms found.</div>
          )}
          <div className="space-y-2">
            {Object.entries(rooms).map(([roomId, room]) => (
              <div key={roomId} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 px-3 py-2 rounded">
                <div className="text-xs">
                  <div className="font-mono">{roomId}</div>
                  <div className="text-[10px] text-zinc-500">
                    {room?.isLive ? "LIVE" : "OFFLINE"}
                  </div>
                </div>
                <button
                  onClick={() => handleSetActiveRoom(roomId)}
                  className="text-[10px] uppercase tracking-widest bg-white text-black px-2 py-1 rounded font-black"
                >
                  Set Active
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-zinc-800 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-widest">Allowed Guests (CSV)</h2>

          <input type="file" accept=".csv" onChange={handleFileChange} className="text-xs" />

          <label className="flex items-center gap-2 text-xs uppercase text-zinc-400">
            <input
              type="checkbox"
              checked={onlyApproved}
              onChange={(e) => setOnlyApproved(e.target.checked)}
            />
            Only Approved Rows
          </label>

          <label className="flex items-center gap-2 text-xs uppercase text-zinc-400">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
            />
            Replace Existing List
          </label>

          <div className="text-[10px] text-zinc-400">
            Total: {csvBuild.summary.total} | Valid: {csvBuild.summary.valid} | Invalid: {csvBuild.summary.invalid}
          </div>

          {csvBuild.errors.length > 0 && (
            <div className="text-[10px] text-yellow-400">
              {csvBuild.errors.slice(0, 5).map((err) => (
                <div key={err}>{err}</div>
              ))}
              {csvBuild.errors.length > 5 && <div>...and more</div>}
            </div>
          )}

          <button
            onClick={handleUploadGuests}
            disabled={isUploading}
            className="w-full bg-white text-black py-2 rounded font-black text-xs uppercase tracking-widest disabled:opacity-60"
          >
            Upload Guests
          </button>
          {uploadStatus && <div className="text-[10px] text-zinc-400">{uploadStatus}</div>}
        </section>
      </div>
    </div>
  );
};

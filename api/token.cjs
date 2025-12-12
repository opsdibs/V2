// api/token.cjs
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');

module.exports = (req, res) => {
  try {
    // 1. Log to Vercel Console (Helps debugging)
    console.log("Token Request Received:", req.query);

    // 2. Get Secrets
    const appID = process.env.VITE_AGORA_APP_ID || process.env.AGORA_APP_ID; 
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appID) {
        console.error("Missing App ID");
        return res.status(500).json({ error: 'Server Environment Error: Missing AGORA_APP_ID' });
    }
    if (!appCertificate) {
        console.error("Missing App Certificate");
        return res.status(500).json({ error: 'Server Environment Error: Missing AGORA_APP_CERTIFICATE' });
    }

    // 3. Prepare Params
    const channelName = req.query.channelName || 'CHIC';
    const uid = 0;
    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    console.log(`Generating token for Channel: ${channelName}`);

    // 4. Build Token
    const token = RtcTokenBuilder.buildTokenWithUid(
      appID,
      appCertificate,
      channelName,
      uid,
      role,
      privilegeExpiredTs
    );

    console.log("Token Generated Successfully");
    return res.status(200).json({ token });

  } catch (error) {
    console.error("Token Generation Crashed:", error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};
// api/token.js (CommonJS Version)
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');

module.exports = (req, res) => {
  // 1. Get Secrets
  // Note: Vercel might not expose VITE_ variables to backend functions easily.
  // Best practice is to check both keys just in case.
  const appID = process.env.VITE_AGORA_APP_ID || process.env.AGORA_APP_ID; 
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  const channelName = req.query.channelName || 'CHIC';
  const uid = 0;
  const role = RtcRole.PUBLISHER;
  const expirationTimeInSeconds = 3600;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  if (!appID || !appCertificate) {
    return res.status(500).json({ error: 'Credentials missing on server' });
  }

  try {
    const token = RtcTokenBuilder.buildTokenWithUid(
      appID,
      appCertificate,
      channelName,
      uid,
      role,
      privilegeExpiredTs
    );
    return res.status(200).json({ token });
  } catch (error) {
    return res.status(500).json({ error: 'Token generation failed', details: error.message });
  }
};
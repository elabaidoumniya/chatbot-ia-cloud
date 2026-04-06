/* ============================================================
   APP.JS — AI Chatbot Frontend
   Backend integration points are marked with: // [BACKEND]
   ============================================================ */

'use strict';

/* ============================================================
   CONSTANTS & CONFIG
   ============================================================ */

const CONFIG = {
  // [BACKEND] Change this to your Flask server URL when ready
  API_BASE_URL: 'http://localhost:5000',
  ENDPOINTS: {
    login:    '/auth/login',
    register: '/auth/register',
    chat:     '/chat',
    history:  '/chat/history',
    logout:   '/auth/logout',
  },
  BOT_NAME: 'NeuraChat',
  TYPING_DELAY_MIN: 800,
  TYPING_DELAY_MAX: 2000,
};

/* ============================================================
   DUMMY DATA  (remove when connecting to real backend)
   ============================================================ */

const DUMMY_RESPONSES = [
  "Hello! I'm your AI assistant. How can I help you today?",
  "That's a great question! Let me help you with that.",
  "I've been designed to optimize communication and simplify work processes, ultimately leading to smoother operations.",
  "Sure! Here's what I know about that topic. Feel free to ask me anything more specific.",
  "I understand. Let me think about that for a moment... Based on my knowledge, I'd suggest the following approach.",
  "Absolutely! This AI chatbot has been developed to help you with a wide range of tasks.",
  "Great point! I can assist you with research, writing, analysis, coding, and much more.",
  "I'm here to help make your workflow more efficient. What specific task can I assist you with?",
];

const DUMMY_USERS = [
  { id: 1, username: 'Suvigya', email: 'suvigya@example.com', password: 'password123', avatar: null },
];

const DUMMY_CHAT_HISTORY = [
  { id: 1, title: 'Project workflow tips', preview: 'How to streamline...', date: '2 days ago' },
  { id: 2, title: 'Code review help',      preview: 'Review my Python...', date: '3 days ago' },
  { id: 3, title: 'Email draft',            preview: 'Write a formal...',   date: 'Last week' },
];

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const container = document.querySelector('.toast-container') || (() => {
    const el = document.createElement('div');
    el.className = 'toast-container';
    document.body.appendChild(el);
    return el;
  })();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ============================================================
   LOCAL STORAGE HELPERS
   ============================================================ */

const Storage = {
  get: (key) => {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  },
  set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  remove: (key) => localStorage.removeItem(key),
};

/* ============================================================
   AUTH MODULE
   ============================================================ */

const Auth = {
  // Get current logged-in user
  getUser() {
    return Storage.get('currentUser');
  },

  // Require auth — redirect to login if not logged in
  requireAuth() {
    if (!this.getUser()) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  },

  // Redirect to chat if already logged in
  redirectIfLoggedIn() {
    if (this.getUser()) {
      window.location.href = 'chat.html';
    }
  },

  // Login
  async login(email, password, remember) {
    /* [BACKEND] Replace dummy check with real API call:
    const res = await fetch(CONFIG.API_BASE_URL + CONFIG.ENDPOINTS.login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    Storage.set('token', data.token);
    Storage.set('currentUser', data.user);
    return data.user;
    */

    // Dummy auth
    await new Promise(r => setTimeout(r, 800)); // simulate network delay
    const user = DUMMY_USERS.find(u => u.email === email && u.password === password);
    if (!user) throw new Error('Invalid email or password.');
    const sessionUser = { id: user.id, username: user.username, email: user.email };
    Storage.set('currentUser', sessionUser);
    if (remember) Storage.set('rememberedEmail', email);
    return sessionUser;
  },

  // Register
  async register(username, email, password) {
    /* [BACKEND] Replace with real API call:
    const res = await fetch(CONFIG.API_BASE_URL + CONFIG.ENDPOINTS.register, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Registration failed');
    return data;
    */

    await new Promise(r => setTimeout(r, 800));
    const exists = DUMMY_USERS.find(u => u.email === email);
    if (exists) throw new Error('An account with this email already exists.');
    // In real app this would save to DB
    showToast('Account created! Please log in.', 'success');
    return true;
  },

  // Logout
  logout() {
    /* [BACKEND] Call logout endpoint if needed:
    fetch(CONFIG.API_BASE_URL + CONFIG.ENDPOINTS.logout, { method: 'POST', ... });
    */
    Storage.remove('currentUser');
    Storage.remove('token');
    window.location.href = 'index.html';
  },
};

/* ============================================================
   CHAT MODULE
   ============================================================ */

const Chat = {
  messages: [],
  isTyping: false,
  conversationId: localStorage.getItem('conversationId') || `conv_${Date.now()}`,

  // Send a message to the bot
  async sendMessage(text) {
    // Save conversation ID for this session
    localStorage.setItem('conversationId', this.conversationId);

    try {
      const res = await fetch(CONFIG.API_BASE_URL + CONFIG.ENDPOINTS.chat, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          conversation_id: this.conversationId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error getting response');
      return data.response;
    } catch (err) {
      console.error('Chat API Error:', err);
      throw err;
    }
  },

  // Fetch chat history
  async getHistory() {
    /* [BACKEND]:
    const res = await fetch(CONFIG.API_BASE_URL + CONFIG.ENDPOINTS.history, {
      headers: { 'Authorization': `Bearer ${Storage.get('token')}` },
    });
    return await res.json();
    */
    return DUMMY_CHAT_HISTORY;
  },
};

/* ============================================================
   UI — CHAT PAGE
   ============================================================ */

const ChatUI = {
  elements: {
    messagesArea:  () => document.getElementById('messagesArea'),
    messageInput:  () => document.getElementById('messageInput'),
    sendBtn:       () => document.getElementById('sendBtn'),
    typingRow:     () => document.getElementById('typingRow'),
    emptyState:    () => document.getElementById('emptyState'),
    sidebar:       () => document.getElementById('sidebar'),
    toggleBtn:     () => document.getElementById('sidebarToggle'),
    historyList:   () => document.getElementById('chatHistoryList'),
    usernameEl:    () => document.getElementById('displayUsername'),
    userInitials:  () => document.getElementById('userInitials'),
    logoutBtn:     () => document.getElementById('logoutBtn'),
  },

  init() {
    if (!document.getElementById('messagesArea')) return;
    if (!Auth.requireAuth()) return;

    this.loadUser();
    this.loadHistory();
    this.bindEvents();
    this.elements.messageInput().focus();
  },

  loadUser() {
    const user = Auth.getUser();
    if (!user) return;
    const nameEl = this.elements.usernameEl();
    const initEl = this.elements.userInitials();
    if (nameEl) nameEl.textContent = user.username;
    if (initEl) initEl.textContent = user.username.charAt(0).toUpperCase();
  },

  async loadHistory() {
    const list = this.elements.historyList();
    if (!list) return;
    const history = await Chat.getHistory();
    list.innerHTML = '';
    history.forEach(item => {
      const el = document.createElement('div');
      el.className = 'chat-history-item';
      el.innerHTML = `<span class="dot"></span><span class="nav-label">${escapeHtml(item.title)}</span>`;
      el.addEventListener('click', () => showToast(`Loading: ${item.title}`, 'info'));
      list.appendChild(el);
    });
  },

  bindEvents() {
    const input   = this.elements.messageInput();
    const sendBtn = this.elements.sendBtn();
    const toggle  = this.elements.toggleBtn();
    const logout  = this.elements.logoutBtn();

    // Send on button click
    sendBtn?.addEventListener('click', () => this.handleSend());

    // Send on Enter (Shift+Enter for new line)
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    // Auto-resize textarea
    input?.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Sidebar toggle
    toggle?.addEventListener('click', () => {
      const sidebar = this.elements.sidebar();
      sidebar.classList.toggle('collapsed');
    });

    // Logout
    logout?.addEventListener('click', () => Auth.logout());

    // Suggestion chips
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (input) input.value = chip.textContent.trim();
        this.handleSend();
      });
    });
  },

  async handleSend() {
    const input = this.elements.messageInput();
    const text = input?.value.trim();
    if (!text || Chat.isTyping) return;

    // Hide empty state
    const empty = this.elements.emptyState();
    if (empty) empty.style.display = 'none';

    // Add user message
    this.appendMessage('user', text);

    // Clear input
    input.value = '';
    input.style.height = 'auto';
    input.focus();

    // Disable send button while processing
    Chat.isTyping = true;
    const sendBtn = this.elements.sendBtn();
    if (sendBtn) sendBtn.disabled = true;

    // Show typing indicator
    this.showTyping(true);

    try {
      const reply = await Chat.sendMessage(text);
      this.showTyping(false);
      this.appendMessage('bot', reply);
    } catch (err) {
      this.showTyping(false);
      showToast('Failed to get a response. Please try again.', 'error');
    } finally {
      Chat.isTyping = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  },

  appendMessage(sender, text) {
    const area = this.elements.messagesArea();
    if (!area) return;

    const user = Auth.getUser();
    const isUser = sender === 'user';
    const time = formatTime();

    const row = document.createElement('div');
    row.className = `message-row ${isUser ? 'user' : 'bot'}`;

    const avatarHtml = isUser
      ? `<div class="msg-avatar user-av">${user?.username?.charAt(0).toUpperCase() || 'U'}</div>`
      : `<div class="msg-avatar bot-av">🤖</div>`;

    const actionsHtml = `
      <div class="msg-actions">
        <button class="msg-action-btn" title="Copy" onclick="navigator.clipboard.writeText(${JSON.stringify(text)})">📋</button>
      </div>`;

    row.innerHTML = `
      ${avatarHtml}
      <div class="bubble-wrap">
        <div class="bubble ${isUser ? 'user' : 'bot'}">${escapeHtml(text)}</div>
        <span class="msg-time">${time}</span>
        ${actionsHtml}
      </div>
    `;

    // Insert before the typing row
    const typingRow = this.elements.typingRow();
    if (typingRow) {
      area.insertBefore(row, typingRow);
    } else {
      area.appendChild(row);
    }

    this.scrollToBottom();
    Chat.messages.push({ sender, text, time });
  },

  showTyping(show) {
    const row = this.elements.typingRow();
    if (row) row.style.display = show ? 'flex' : 'none';
    if (show) this.scrollToBottom();
  },

  scrollToBottom() {
    const area = this.elements.messagesArea();
    if (area) area.scrollTop = area.scrollHeight;
  },
};

/* ============================================================
   UI — LOGIN PAGE
   ============================================================ */

const LoginUI = {
  init() {
    const form = document.getElementById('loginForm');
    if (!form) return;
    Auth.redirectIfLoggedIn();
    this.prefillRemembered();
    form.addEventListener('submit', (e) => this.handleSubmit(e));
  },

  prefillRemembered() {
    const email = Storage.get('rememberedEmail');
    if (email) {
      const emailInput = document.getElementById('loginEmail');
      const rememberCb = document.getElementById('rememberMe');
      if (emailInput) emailInput.value = email;
      if (rememberCb) rememberCb.checked = true;
    }
  },

  async handleSubmit(e) {
    e.preventDefault();
    const email    = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    const remember = document.getElementById('rememberMe')?.checked;
    const btn      = document.getElementById('loginBtn');

    if (!email || !password) {
      showToast('Please fill in all fields.', 'error');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }

    try {
      await Auth.login(email, password, remember);
      window.location.href = 'chat.html';
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
    }
  },
};

/* ============================================================
   UI — REGISTER PAGE
   ============================================================ */

const RegisterUI = {
  init() {
    const form = document.getElementById('registerForm');
    if (!form) return;
    Auth.redirectIfLoggedIn();
    form.addEventListener('submit', (e) => this.handleSubmit(e));
  },

  async handleSubmit(e) {
    e.preventDefault();
    const username  = document.getElementById('regUsername')?.value.trim();
    const email     = document.getElementById('regEmail')?.value.trim();
    const password  = document.getElementById('regPassword')?.value;
    const confirm   = document.getElementById('regConfirm')?.value;
    const btn       = document.getElementById('registerBtn');

    if (!username || !email || !password || !confirm) {
      showToast('Please fill in all fields.', 'error');
      return;
    }

    if (password !== confirm) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Creating account...'; }

    try {
      await Auth.register(username, email, password);
      setTimeout(() => window.location.href = 'index.html', 1200);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
    }
  },
};

/* ============================================================
   BOOT — Initialize the right module based on current page
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Detect current page by presence of key elements
  if (document.getElementById('loginForm'))    LoginUI.init();
  if (document.getElementById('registerForm')) RegisterUI.init();
  if (document.getElementById('messagesArea')) ChatUI.init();
});
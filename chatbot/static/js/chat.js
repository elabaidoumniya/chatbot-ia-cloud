/* ─── State ──────────────────────────────────────────────────── */
let currentConvId = null;
let isStreaming = false;
const AVATAR_INITIAL = document.querySelector('.user-info .profile-avatar')?.textContent?.trim() || '?';

/* ─── DOM Refs ───────────────────────────────────────────────── */
const messagesArea   = document.getElementById('messagesArea');
const messageInput   = document.getElementById('messageInput');
const sendBtn        = document.getElementById('sendBtn');
const convList       = document.getElementById('convList');
const currentTitle   = document.getElementById('currentTitle');
const modelSelect    = document.getElementById('modelSelect');
const welcomeScreen  = document.getElementById('welcomeScreen');
const ollamaStatus   = document.getElementById('ollamaStatus');

/* ─── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    // Load first conversation if available
    const firstItem = convList.querySelector('.conv-item');
    if (firstItem) {
        currentConvId = parseInt(firstItem.dataset.id);
        loadConversation(currentConvId);
    }

    // Auto-resize textarea
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + 'px';
    });

    // Send on Enter (Shift+Enter = new line)
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Poll Ollama status every 30s
    checkOllamaStatus();
    setInterval(checkOllamaStatus, 30000);

    // Search conversations
    const searchInput = document.getElementById('searchConvs');
    let searchTimer;
    searchInput?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => searchConversations(e.target.value), 300);
    });

    // New chat button
    document.getElementById('btnNewChat')?.addEventListener('click', createNewConversation);

    // Sidebar toggle
    document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebar);
});

/* ─── Sidebar ────────────────────────────────────────────────── */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('hidden');
}

/* ─── Ollama Status ──────────────────────────────────────────── */
async function checkOllamaStatus() {
    try {
        const res = await fetch('/api/ollama/status');
        const data = await res.json();
        if (ollamaStatus) {
            ollamaStatus.className = 'ollama-status ' + (data.available ? 'online' : 'offline');
            ollamaStatus.textContent = data.available ? '● En ligne' : '● Hors ligne';
        }
        // Update model select
        if (data.models?.length && modelSelect) {
            const current = modelSelect.value;
            modelSelect.innerHTML = data.models.map(m =>
                `<option value="${m}" ${m === current ? 'selected' : ''}>${m}</option>`
            ).join('');
        }
    } catch {}
}

/* ─── Conversations ──────────────────────────────────────────── */
async function createNewConversation() {
    const model = modelSelect?.value || 'llama3.2';
    try {
        const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model })
        });
        const conv = await res.json();
        currentConvId = conv.id;
        addConvToList(conv, true);
        clearMessages();
        updateTitle('Nouvelle discussion');
        messageInput.focus();
    } catch (e) {
        showToast('Erreur lors de la création de la discussion', 'error');
    }
}

async function loadConversation(convId) {
    if (isStreaming) return;
    currentConvId = convId;

    // Highlight in sidebar
    document.querySelectorAll('.conv-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.id) === convId);
    });

    try {
        const res = await fetch(`/api/conversations/${convId}`);
        const data = await res.json();

        clearMessages();
        updateTitle(data.conversation.title);

        // Update model select
        if (modelSelect && data.conversation.model) {
            let opt = modelSelect.querySelector(`option[value="${data.conversation.model}"]`);
            if (opt) opt.selected = true;
        }

        // Render messages
        if (data.messages.length === 0) {
            showWelcome();
        } else {
            hideWelcome();
            data.messages.forEach(m => appendMessage(m.role, m.content));
        }
        scrollToBottom();
        messageInput.focus();
    } catch (e) {
        showToast('Erreur lors du chargement', 'error');
    }
}

async function deleteConversation(convId, btn) {
    if (!confirm('Supprimer cette discussion ?')) return;
    try {
        await fetch(`/api/conversations/${convId}`, { method: 'DELETE' });
        const item = convList.querySelector(`[data-id="${convId}"]`);
        item?.remove();

        if (currentConvId === convId) {
            currentConvId = null;
            clearMessages();
            showWelcome();
            updateTitle('NeuralChat');
            const next = convList.querySelector('.conv-item');
            if (next) loadConversation(parseInt(next.dataset.id));
        }
        if (!convList.querySelector('.conv-item')) {
            convList.innerHTML = '<div class="conv-empty">Aucune discussion. Commencez maintenant !</div>';
        }
    } catch (e) {
        showToast('Erreur lors de la suppression', 'error');
    }
}

async function renameConversation(convId, btn) {
    const item = convList.querySelector(`[data-id="${convId}"]`);
    const titleEl = item?.querySelector('.conv-title');
    const oldTitle = titleEl?.textContent || '';
    const newTitle = prompt('Nouveau titre :', oldTitle);
    if (!newTitle || newTitle === oldTitle) return;

    try {
        const res = await fetch(`/api/conversations/${convId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
        });
        const data = await res.json();
        if (titleEl) titleEl.textContent = data.title;
        if (currentConvId === convId) updateTitle(data.title);
    } catch (e) {
        showToast('Erreur lors du renommage', 'error');
    }
}

async function searchConversations(query) {
    try {
        const res = await fetch(`/api/conversations?search=${encodeURIComponent(query)}`);
        const data = await res.json();
        renderConvList(data.conversations);
    } catch {}
}

function renderConvList(convs) {
    if (!convs.length) {
        convList.innerHTML = '<div class="conv-empty">Aucune discussion trouvée.</div>';
        return;
    }
    convList.innerHTML = convs.map(c => `
        <div class="conv-item ${c.id === currentConvId ? 'active' : ''}"
             data-id="${c.id}"
             onclick="loadConversation(${c.id})">
            <div class="conv-title">${escapeHtml(c.title)}</div>
            <div class="conv-meta">${formatDate(c.updated_at)}</div>
            <div class="conv-actions">
                <button class="icon-btn-sm" onclick="event.stopPropagation(); renameConversation(${c.id}, this)">✎</button>
                <button class="icon-btn-sm danger" onclick="event.stopPropagation(); deleteConversation(${c.id}, this)">✕</button>
            </div>
        </div>
    `).join('');
}

function addConvToList(conv, prepend = true) {
    // Remove empty state
    const emptyEl = convList.querySelector('.conv-empty');
    if (emptyEl) emptyEl.remove();

    const html = `
        <div class="conv-item active" data-id="${conv.id}" onclick="loadConversation(${conv.id})">
            <div class="conv-title">${escapeHtml(conv.title)}</div>
            <div class="conv-meta">maintenant</div>
            <div class="conv-actions">
                <button class="icon-btn-sm" onclick="event.stopPropagation(); renameConversation(${conv.id}, this)">✎</button>
                <button class="icon-btn-sm danger" onclick="event.stopPropagation(); deleteConversation(${conv.id}, this)">✕</button>
            </div>
        </div>
    `;
    document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
    if (prepend) {
        convList.insertAdjacentHTML('afterbegin', html);
    } else {
        convList.insertAdjacentHTML('beforeend', html);
    }
}

/* ─── Messages ───────────────────────────────────────────────── */
async function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || isStreaming) return;

    // Create a new conversation if none selected
    if (!currentConvId) {
        await createNewConversation();
        if (!currentConvId) return;
    }

    isStreaming = true;
    sendBtn.disabled = true;
    messageInput.value = '';
    messageInput.style.height = 'auto';
    hideWelcome();

    // Show user message immediately
    appendMessage('user', content);
    scrollToBottom();

    // Show typing indicator
    const typingEl = appendTypingIndicator();
    scrollToBottom();

    try {
        const res = await fetch(`/api/conversations/${currentConvId}/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Erreur serveur');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let assistantBubble = null;
        let fullContent = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.split('\n');

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const data = JSON.parse(line.slice(6));

                    if (data.type === 'user_message') {
                        // Update conv title in sidebar
                        if (data.conversation?.title) {
                            const item = convList.querySelector(`[data-id="${currentConvId}"] .conv-title`);
                            if (item) item.textContent = data.conversation.title;
                            updateTitle(data.conversation.title);
                        }
                    } else if (data.type === 'chunk') {
                        typingEl.remove();
                        if (!assistantBubble) {
                            assistantBubble = appendMessageStreaming();
                        }
                        fullContent += data.content;
                        assistantBubble.innerHTML = renderMarkdown(fullContent);
                        scrollToBottom();
                    } else if (data.type === 'done') {
                        if (assistantBubble) {
                            assistantBubble.innerHTML = renderMarkdown(fullContent);
                        }
                        if (data.conversation?.title) {
                            const item = convList.querySelector(`[data-id="${currentConvId}"] .conv-title`);
                            if (item) item.textContent = data.conversation.title;
                            updateTitle(data.conversation.title);
                        }
                    } else if (data.type === 'error') {
                        typingEl.remove();
                        appendErrorMessage(data.content);
                    }
                } catch {}
            }
        }
    } catch (e) {
        typingEl?.remove();
        appendErrorMessage(e.message || 'Une erreur est survenue.');
    } finally {
        isStreaming = false;
        sendBtn.disabled = false;
        scrollToBottom();
        messageInput.focus();
    }
}

function quickPrompt(text) {
    messageInput.value = text;
    messageInput.dispatchEvent(new Event('input'));
    sendMessage();
}

/* ─── Message Rendering ──────────────────────────────────────── */
function appendMessage(role, content) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.innerHTML = `
        <div class="msg-avatar">${role === 'user' ? AVATAR_INITIAL : '✦'}</div>
        <div class="msg-bubble">${renderMarkdown(content)}</div>
    `;
    messagesArea.appendChild(div);
    return div.querySelector('.msg-bubble');
}

function appendMessageStreaming() {
    const div = document.createElement('div');
    div.className = 'msg assistant';
    div.innerHTML = `
        <div class="msg-avatar">✦</div>
        <div class="msg-bubble streaming"></div>
    `;
    messagesArea.appendChild(div);
    return div.querySelector('.msg-bubble');
}

function appendTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'msg assistant';
    div.innerHTML = `
        <div class="msg-avatar">✦</div>
        <div class="msg-bubble">
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    messagesArea.appendChild(div);
    return div;
}

function appendErrorMessage(text) {
    const div = document.createElement('div');
    div.className = 'msg assistant';
    div.innerHTML = `
        <div class="msg-avatar">✦</div>
        <div class="msg-bubble" style="border-color: rgba(240,80,96,.4); color: var(--red)">
            ⚠ ${escapeHtml(text)}
        </div>
    `;
    messagesArea.appendChild(div);
}

/* ─── Markdown Rendering ─────────────────────────────────────── */
function renderMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    // Code blocks
    html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) =>
        `<pre><code class="lang-${lang || 'text'}">${code.trim()}</code></pre>`
    );
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    // Unordered lists
    html = html.replace(/^[•\-\*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    // Paragraphs (double newline)
    html = html.replace(/\n\n/g, '</p><p>');
    // Single newline
    html = html.replace(/\n/g, '<br>');
    // Wrap in paragraph
    if (!html.startsWith('<')) html = '<p>' + html + '</p>';

    return html;
}

/* ─── UI Helpers ─────────────────────────────────────────────── */
function clearMessages() {
    messagesArea.innerHTML = '';
}
function showWelcome() {
    if (!document.getElementById('welcomeScreen')) {
        const el = document.createElement('div');
        el.className = 'welcome-screen';
        el.id = 'welcomeScreen';
        el.innerHTML = `
            <div class="welcome-icon">
                <svg width="64" height="64" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="18" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 2"/>
                    <path d="M12 20 Q16 12 20 20 Q24 28 28 20" stroke="var(--accent)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
                    <circle cx="12" cy="20" r="2.5" fill="var(--accent)"/>
                    <circle cx="28" cy="20" r="2.5" fill="var(--accent)"/>
                </svg>
            </div>
            <h2>Que puis-je faire pour vous ?</h2>
            <p>Posez n'importe quelle question, générez du code, traduisez, résumez…</p>
            <div class="quick-prompts">
                <button onclick="quickPrompt('Explique-moi le machine learning simplement')">🧠 C'est quoi le ML ?</button>
                <button onclick="quickPrompt('Écris un script Python pour trier une liste')">🐍 Script Python</button>
                <button onclick="quickPrompt('Quels sont les meilleurs conseils pour apprendre à coder ?')">📚 Apprendre à coder</button>
                <button onclick="quickPrompt('Rédige un email professionnel pour demander une réunion')">✉️ Email professionnel</button>
            </div>
        `;
        messagesArea.appendChild(el);
    }
}
function hideWelcome() {
    document.getElementById('welcomeScreen')?.remove();
}
function updateTitle(title) {
    if (currentTitle) currentTitle.textContent = title;
}
function scrollToBottom() {
    messagesArea.scrollTop = messagesArea.scrollHeight;
}
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function formatDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}
function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `flash flash-${type}`;
    toast.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:9999;';
    toast.innerHTML = `<span>${escapeHtml(msg)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}
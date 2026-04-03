console.log('🚀 Script chargé !');
document.addEventListener('DOMContentLoaded', function() {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const messages = document.getElementById('messages');
    const status = document.getElementById('status');

    // Envoyer message
    async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    addMessage('user', message);
    messageInput.value = '';
    sendButton.disabled = true;
    status.textContent = '🤔 Réponse en cours...';

    let responseStatus = null;

    try {
        console.log('🔄 Envoi:', message);
        const response = await fetch('http://127.0.0.1:5000/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message })
        });
        console.log('📡 Réponse status:', response.status);
        responseStatus = response.status;
        console.log('📡 Réponse status:', response.status);

        const data = await response.json();
        console.log('✅ Data reçue:', data.response?.substring(0, 50));
        addMessage('bot', data.response || 'Erreur');

    } catch (error) {
        console.error('❌ Fetch ERROR:', error);
        addMessage('bot', '❌ Erreur réseau');
    } finally {
        console.log('🔄 Status final:', responseStatus);
        sendButton.disabled = false;
        status.textContent = '🟢 Connecté';
        messageInput.focus();
    }
}

    // Ajouter message au chat
    function addMessage(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        messageDiv.innerHTML = `<div class="message-content">${text}</div>`;
        messages.appendChild(messageDiv);
        messages.scrollTop = messages.scrollHeight;
    }

    // Events
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    });

    // Focus auto
    messageInput.focus();
});
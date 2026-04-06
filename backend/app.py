from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import psycopg2
from datetime import datetime
import os
import json

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000"])

# Config
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = "chatbot_db"
DB_USER = "postgres"
DB_PASS = "Ka2004"


def save_conversation(conv_id, user_msg, ai_msg):
    """Sauvegarde conversation en DB"""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASS
        )
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                conversation_id VARCHAR(255),
                user_message TEXT,
                ai_response TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute(
            "INSERT INTO conversations (conversation_id, user_message, ai_response) VALUES (%s, %s, %s)",
            (conv_id, user_msg, ai_msg)
        )
        conn.commit()
        cur.close()
        conn.close()
        print(f"Sauvegardé: {conv_id}")
    except Exception as e:
        print(f"DB Error: {e}")


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "OK",
        "ollama": OLLAMA_URL,
        "flask": "running"
    })


@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        message = data.get('message', '')
        conv_id = data.get('conversation_id', 'default')

        print(f"Reçu: {message}")

        # Appel Ollama
        ollama_resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": "llama3.2:3b",
                "prompt": f"Réponds en français : {message}",
                "stream": False,
                "options": {"temperature": 0.7}
            },
            timeout=30
        )

        if ollama_resp.status_code == 200:
            response = ollama_resp.json().get('response', 'Pas de réponse')
            save_conversation(conv_id, message, response)
            print(f"Réponse: {response[:50]}...")
            return jsonify({"response": response})
        else:
            return jsonify({"response": f"Ollama erreur: {ollama_resp.status_code}"})

    except Exception as e:
        print(f"Erreur: {e}")
        return jsonify({"response": f"Erreur serveur: {str(e)}"})


if __name__ == '__main__':
    print("🚀 Flask Chatbot démarré sur http://0.0.0.0:8000")
    app.run(host='0.0.0.0', port=5000, debug=False)
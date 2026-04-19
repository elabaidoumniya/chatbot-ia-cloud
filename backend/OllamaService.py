import requests
import json
from flask import current_app


class OllamaService:
    """Service d'intégration avec l'API Ollama"""

    def __init__(self):
        self.base_url = None
        self.model = None

    def init_app(self, app):
        self.base_url = app.config['OLLAMA_BASE_URL']
        self.model = app.config['OLLAMA_MODEL']

    def _get_base_url(self):
        return current_app.config['OLLAMA_BASE_URL']

    def _get_model(self):
        return current_app.config['OLLAMA_MODEL']

    def is_available(self):
        """Vérifie si Ollama est disponible"""
        try:
            response = requests.get(f"{self._get_base_url()}/api/tags", timeout=3)
            return response.status_code == 200
        except Exception:
            return False

    def list_models(self):
        """Liste les modèles disponibles"""
        try:
            response = requests.get(f"{self._get_base_url()}/api/tags", timeout=5)
            if response.status_code == 200:
                data = response.json()
                return [m['name'] for m in data.get('models', [])]
            return []
        except Exception:
            return []

    def generate_title(self, first_message: str) -> str:
        """Génère un titre court pour la conversation"""
        try:
            prompt = f"Génère un titre court (max 6 mots) pour cette conversation basée sur: '{first_message[:200]}'. Réponds uniquement avec le titre, sans guillemets ni ponctuation finale."
            response = requests.post(
                f"{self._get_base_url()}/api/generate",
                json={
                    "model": self._get_model(),
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.7, "num_predict": 20}
                },
                timeout=10
            )
            if response.status_code == 200:
                title = response.json().get('response', '').strip()
                return title[:80] if title else 'Nouvelle discussion'
            return 'Nouvelle discussion'
        except Exception:
            return 'Nouvelle discussion'

    def chat(self, messages: list, model: str = None, stream: bool = False):
        """
        Envoie une liste de messages à Ollama et retourne la réponse.
        messages: [{"role": "user/assistant", "content": "..."}]
        """
        model = model or self._get_model()

        system_message = {
            "role": "system",
            "content": "Tu es un assistant IA intelligent, utile et bienveillant. Tu réponds de manière claire et précise. Si tu ne connais pas la réponse, dis-le honnêtement."
        }

        payload = {
            "model": model,
            "messages": [system_message] + messages,
            "stream": stream,
            "options": {
                "temperature": 0.7,
                "top_p": 0.9,
            }
        }

        if stream:
            return self._stream_chat(payload)
        else:
            return self._sync_chat(payload)

    def _sync_chat(self, payload):
        """Chat synchrone"""
        try:
            response = requests.post(
                f"{self._get_base_url()}/api/chat",
                json=payload,
                timeout=120
            )
            if response.status_code == 200:
                data = response.json()
                return {
                    'success': True,
                    'content': data.get('message', {}).get('content', ''),
                    'model': data.get('model', ''),
                    'tokens': data.get('eval_count', 0)
                }
            return {
                'success': False,
                'error': f"Erreur Ollama: {response.status_code}"
            }
        except requests.exceptions.ConnectionError:
            return {
                'success': False,
                'error': "Impossible de se connecter à Ollama. Assurez-vous qu'il est démarré."
            }
        except requests.exceptions.Timeout:
            return {
                'success': False,
                'error': "Délai d'attente dépassé. Le modèle prend trop de temps à répondre."
            }
        except Exception as e:
            return {
                'success': False,
                'error': f"Erreur inattendue: {str(e)}"
            }

    def _stream_chat(self, payload):
        """Chat en streaming - générateur"""
        try:
            response = requests.post(
                f"{self._get_base_url()}/api/chat",
                json=payload,
                stream=True,
                timeout=120
            )
            if response.status_code == 200:
                for line in response.iter_lines():
                    if line:
                        try:
                            data = json.loads(line)
                            content = data.get('message', {}).get('content', '')
                            done = data.get('done', False)
                            yield {'content': content, 'done': done}
                            if done:
                                break
                        except json.JSONDecodeError:
                            continue
            else:
                yield {'content': '', 'done': True, 'error': f"Erreur: {response.status_code}"}
        except Exception as e:
            yield {'content': '', 'done': True, 'error': str(e)}


ollama_service = OllamaService()
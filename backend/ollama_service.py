import requests
import json
from flask import current_app


class OllamaService:

    def init_app(self, app):
        pass

    def _get_base_url(self):
        return current_app.config.get('OLLAMA_BASE_URL', 'http://localhost:11434')

    def _get_model(self):
        return current_app.config.get('OLLAMA_MODEL', 'llama3.2')

    def is_available(self):
        try:
            response = requests.get(f"{self._get_base_url()}/api/tags", timeout=3)
            return response.status_code == 200
        except Exception:
            return False

    def list_models(self):
        try:
            response = requests.get(f"{self._get_base_url()}/api/tags", timeout=5)
            if response.status_code == 200:
                data = response.json()
                return [m['name'] for m in data.get('models', [])]
            return []
        except Exception:
            return []

    def generate_title(self, first_message: str) -> str:
        try:
            response = requests.post(
                f"{self._get_base_url()}/api/generate",
                json={
                    "model": self._get_model(),
                    "prompt": f"Génère un titre court (max 6 mots) pour cette conversation: '{first_message[:200]}'. Réponds uniquement avec le titre.",
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
        model = model or self._get_model()
        system_message = {
            "role": "system",
            "content": "Tu es un assistant IA intelligent et bienveillant. Tu réponds en français de manière claire."
        }
        payload = {
            "model": model,
            "messages": [system_message] + messages,
            "stream": stream,
            "options": {"temperature": 0.7, "top_p": 0.9}
        }
        if stream:
            return self._stream_chat(payload)
        else:
            return self._sync_chat(payload)

    def _sync_chat(self, payload):
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
            return {'success': False, 'error': f"Erreur Ollama: {response.status_code}"}
        except requests.exceptions.ConnectionError:
            return {'success': False, 'error': "Impossible de se connecter à Ollama. Lancez 'ollama serve'."}
        except requests.exceptions.Timeout:
            return {'success': False, 'error': "Délai dépassé."}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def _stream_chat(self, payload):
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
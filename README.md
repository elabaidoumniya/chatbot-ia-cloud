# NeuralChat — Lancer le projet

## Prérequis

- Python 3.10+
- PostgreSQL installé et démarré
- Ollama installé et démarré ([télécharger ici](https://ollama.com/download))

---

## 1. Cloner et installer

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux / Mac
source .venv/bin/activate

pip install -r requirements.txt
```

---

## 2. Configurer le fichier .env

Copiez `.env.example` en `.env` et remplissez :

```env
DATABASE_URL=postgresql://chatbot_user:votre_mot_de_passe@localhost:5432/chatbot_db
SECRET_KEY=generez-avec-la-commande-ci-dessous
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
```

Pour générer la SECRET_KEY :

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## 3. Créer la base de données PostgreSQL

```bash
psql -U postgres
```

```sql
CREATE USER chatbot_user WITH PASSWORD 'votre_mot_de_passe';
CREATE DATABASE chatbot_db OWNER chatbot_user;
GRANT ALL PRIVILEGES ON DATABASE chatbot_db TO chatbot_user;
\q
```

---

## 4. Initialiser les tables

```bash
python -c "from app import create_app; from models import db; app = create_app(); app.app_context().push(); db.create_all(); print('Tables créées')"
```

---

## 5. Démarrer Ollama et télécharger le modèle

```bash
ollama serve
ollama pull llama3.2:3b
```

---

## 6. Lancer l'application

```bash
python app.py
```

L'application tourne sur : **http://localhost:5000**

---

## Vérification rapide

```bash
# Tester Ollama
python -c "
from app import create_app
from ollama_service import ollama_service
app = create_app()
with app.app_context():
    print('Ollama disponible:', ollama_service.is_available())
    print('Modèles:', ollama_service.list_models())
"
```

---

## Structure des fichiers

```
chatbot/
├── app.py               # Point d'entrée Flask
├── Config.py            # Configuration (.env)
├── models.py            # Modèles base de données
├── forms.py             # Formulaires
├── ollama_service.py    # Intégration Ollama
├── AuthRoutes.py        # Routes /auth/*
├── ChatRoutes.py        # Routes /api/*
├── requirements.txt
├── .env                 # À créer (ne pas committer)
├── .env.example         # Modèle
├── templates/
└── static/
```
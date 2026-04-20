from flask import Blueprint, render_template, request, jsonify, Response, stream_with_context
from flask_login import login_required, current_user
from models import db, Conversation, Message
from ollama_service import ollama_service
from datetime import datetime
import json

chat_bp = Blueprint('chat', __name__)


@chat_bp.route('/')
@login_required
def index():
    conversations = current_user.conversations\
        .filter_by(is_archived=False)\
        .order_by(Conversation.updated_at.desc())\
        .limit(20).all()
    models = ollama_service.list_models()
    ollama_ok = ollama_service.is_available()
    return render_template('chat/index.html',
                           conversations=conversations,
                           models=models,
                           ollama_ok=ollama_ok)


# ── API: Conversations ────────────────────────────────────────────────────────

@chat_bp.route('/api/conversations', methods=['GET'])
@login_required
def get_conversations():
    page = request.args.get('page', 1, type=int)
    archived = request.args.get('archived', 'false') == 'true'
    search = request.args.get('search', '').strip()

    query = current_user.conversations.filter_by(is_archived=archived)

    if search:
        query = query.filter(Conversation.title.ilike(f'%{search}%'))

    convs = query.order_by(Conversation.updated_at.desc()).paginate(
        page=page, per_page=20, error_out=False
    )
    return jsonify({
        'conversations': [c.to_dict() for c in convs.items],
        'total': convs.total,
        'pages': convs.pages,
        'current_page': page
    })


@chat_bp.route('/api/conversations', methods=['POST'])
@login_required
def create_conversation():
    data = request.get_json() or {}
    model = data.get('model', 'llama3.2')

    conv = Conversation(
        title='Nouvelle discussion',
        user_id=current_user.id,
        model=model
    )
    db.session.add(conv)
    db.session.commit()
    return jsonify(conv.to_dict()), 201


@chat_bp.route('/api/conversations/<int:conv_id>', methods=['GET'])
@login_required
def get_conversation(conv_id):
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first_or_404()
    messages = conv.messages.order_by(Message.created_at.asc()).all()
    return jsonify({
        'conversation': conv.to_dict(),
        'messages': [m.to_dict() for m in messages]
    })


@chat_bp.route('/api/conversations/<int:conv_id>', methods=['PUT'])
@login_required
def update_conversation(conv_id):
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first_or_404()
    data = request.get_json() or {}
    if 'title' in data:
        conv.title = data['title'][:255]
    if 'is_archived' in data:
        conv.is_archived = data['is_archived']
    if 'model' in data:
        conv.model = data['model']
    db.session.commit()
    return jsonify(conv.to_dict())


@chat_bp.route('/api/conversations/<int:conv_id>', methods=['DELETE'])
@login_required
def delete_conversation(conv_id):
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first_or_404()
    db.session.delete(conv)
    db.session.commit()
    return jsonify({'message': 'Conversation supprimée'}), 200


# ── API: Messages ─────────────────────────────────────────────────────────────

@chat_bp.route('/api/conversations/<int:conv_id>/messages', methods=['POST'])
@login_required
def send_message(conv_id):
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first_or_404()
    data = request.get_json() or {}
    content = data.get('content', '').strip()

    if not content:
        return jsonify({'error': 'Le message ne peut pas être vide'}), 400

    # Sauvegarder le message utilisateur
    user_msg = Message(
        conversation_id=conv.id,
        role='user',
        content=content
    )
    db.session.add(user_msg)
    db.session.commit()

    # Auto-générer un titre si c'est le 1er message
    if conv.get_message_count() == 1:
        title = ollama_service.generate_title(content)
        conv.title = title

    # Préparer l'historique pour Ollama
    all_messages = conv.messages.order_by(Message.created_at.asc()).all()
    history = [{'role': m.role, 'content': m.content} for m in all_messages]

    # Appel Ollama
    result = ollama_service.chat(history, model=conv.model)

    if result['success']:
        ai_msg = Message(
            conversation_id=conv.id,
            role='assistant',
            content=result['content'],
            tokens_used=result.get('tokens', 0)
        )
        db.session.add(ai_msg)
        conv.updated_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            'user_message': user_msg.to_dict(),
            'assistant_message': ai_msg.to_dict(),
            'conversation': conv.to_dict()
        })
    else:
        db.session.delete(user_msg)
        db.session.commit()
        return jsonify({'error': result['error']}), 500


@chat_bp.route('/api/conversations/<int:conv_id>/stream', methods=['POST'])
@login_required
def stream_message(conv_id):
    """Endpoint SSE pour le streaming des réponses"""
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first_or_404()
    data = request.get_json() or {}
    content = data.get('content', '').strip()

    if not content:
        return jsonify({'error': 'Message vide'}), 400

    # Sauvegarder le message utilisateur
    user_msg = Message(conversation_id=conv.id, role='user', content=content)
    db.session.add(user_msg)
    db.session.commit()

    # Auto-titre
    if conv.get_message_count() == 1:
        title = ollama_service.generate_title(content)
        conv.title = title
        db.session.commit()

    # Historique
    all_messages = conv.messages.order_by(Message.created_at.asc()).all()
    history = [{'role': m.role, 'content': m.content} for m in all_messages]

    def generate():
        full_response = ''
        try:
            # Envoyer le message utilisateur d'abord
            yield f"data: {json.dumps({'type': 'user_message', 'message': user_msg.to_dict(), 'conversation': conv.to_dict()})}\n\n"

            for chunk in ollama_service.chat(history, model=conv.model, stream=True):
                if 'error' in chunk:
                    yield f"data: {json.dumps({'type': 'error', 'content': chunk['error']})}\n\n"
                    break
                full_response += chunk['content']
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk['content']})}\n\n"

                if chunk.get('done'):
                    break

            # Sauvegarder la réponse complète
            if full_response:
                ai_msg = Message(
                    conversation_id=conv.id,
                    role='assistant',
                    content=full_response
                )
                db.session.add(ai_msg)
                conv.updated_at = datetime.utcnow()
                db.session.commit()
                yield f"data: {json.dumps({'type': 'done', 'message': ai_msg.to_dict(), 'conversation': conv.to_dict()})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
        }
    )


@chat_bp.route('/api/conversations/<int:conv_id>/messages/<int:msg_id>', methods=['DELETE'])
@login_required
def delete_message(conv_id, msg_id):
    conv = Conversation.query.filter_by(id=conv_id, user_id=current_user.id).first_or_404()
    msg = Message.query.filter_by(id=msg_id, conversation_id=conv.id).first_or_404()
    db.session.delete(msg)
    db.session.commit()
    return jsonify({'message': 'Message supprimé'}), 200


# ── API: Statut Ollama ────────────────────────────────────────────────────────

@chat_bp.route('/api/ollama/status')
@login_required
def ollama_status():
    available = ollama_service.is_available()
    models = ollama_service.list_models() if available else []
    return jsonify({'available': available, 'models': models})
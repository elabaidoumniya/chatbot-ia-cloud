from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_user, logout_user, login_required, current_user
from models import db, User
from forms import LoginForm, RegistrationForm
import random

auth_bp = Blueprint('auth', __name__)

AVATAR_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f97316', '#eab308', '#22c55e', '#14b8a6',
    '#3b82f6', '#06b6d4'
]


@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('chat.index'))

    form = RegistrationForm()
    if form.validate_on_submit():
        user = User(
            username=form.username.data,
            email=form.email.data.lower(),
            avatar_color=random.choice(AVATAR_COLORS)
        )
        user.set_password(form.password.data)
        db.session.add(user)
        db.session.commit()
        flash('Compte créé avec succès ! Connectez-vous maintenant.', 'success')
        return redirect(url_for('auth.login'))

    return render_template('auth/register.html', form=form)


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('chat.index'))

    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(email=form.email.data.lower()).first()
        if user and user.check_password(form.password.data):
            login_user(user, remember=form.remember.data)
            user.update_last_seen()
            next_page = request.args.get('next')
            flash(f'Bienvenue, {user.username} !', 'success')
            return redirect(next_page or url_for('chat.index'))
        else:
            flash('Email ou mot de passe incorrect.', 'error')

    return render_template('auth/login.html', form=form)


@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Déconnexion réussie.', 'info')
    return redirect(url_for('auth.login'))


@auth_bp.route('/profile')
@login_required
def profile():
    stats = {
        'total_conversations': current_user.conversations.count(),
        'active_conversations': current_user.conversations.filter_by(is_archived=False).count(),
        'total_messages': sum(c.get_message_count() for c in current_user.conversations.all())
    }
    return render_template('auth/profile.html', stats=stats)
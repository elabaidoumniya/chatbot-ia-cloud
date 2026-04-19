from flask import Flask, redirect, url_for
from flask_login import LoginManager
from flask_migrate import Migrate
from Config import config
from models import db, bcrypt, User
from OllamaService import ollama_service

migrate = Migrate()
login_manager = LoginManager()


def create_app(config_name='default'):
    app = Flask(__name__)
    app.config.from_object(config[config_name])

    # Extensions
    db.init_app(app)
    bcrypt.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    ollama_service.init_app(app)

    # Flask-Login
    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Veuillez vous connecter pour accéder à cette page.'
    login_manager.login_message_category = 'info'

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # Blueprints
    from backend import auth_bp
    from backend import chat_bp

    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(chat_bp, url_prefix='')

    # Redirect racine
    @app.route('/')
    def root():
        return redirect(url_for('chat.index'))

    # Créer les tables si nécessaire
    with app.app_context():
        db.create_all()

    return app


if __name__ == '__main__':
    app = create_app('development')
    app.run(debug=True, host='0.0.0.0', port=5000)
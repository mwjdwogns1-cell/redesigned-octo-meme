import os
import json
import flask

from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

app = flask.Flask(__name__)
app.secret_key = os.urandom(24)

CLIENT_SECRETS_FILE = 'client_secret.json'
SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events'
]

TOKEN_FILE = 'token.json'
SYNC_TOKEN_FILE = 'sync_tokens.json'


def get_google_flow():
    """Initializes and returns the Google OAuth Flow object."""
    return Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE,
        scopes=SCOPES,
        redirect_uri=flask.url_for('oauth2callback', _external=True)
    )

@app.route('/')
def index():
    if os.path.exists(TOKEN_FILE):
        return flask.redirect(flask.url_for('profile'))
    return flask.render_template('index.html')

@app.route('/login')
def login():
    if not os.path.exists(CLIENT_SECRETS_FILE):
        return "Error: client_secret.json not found. Please follow the setup instructions in README.md."

    flow = get_google_flow()
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        prompt='consent'
    )
    flask.session['state'] = state
    return flask.redirect(authorization_url)

@app.route('/oauth2callback')
def oauth2callback():
    state = flask.session['state']
    flow = get_google_flow()
    flow.fetch_token(authorization_response=flask.request.url)

    if not state or state != flask.request.args['state']:
        return "State mismatch error.", 400

    credentials = flow.credentials

    # Store the credentials
    with open(TOKEN_FILE, 'w') as token_file:
        token_file.write(credentials.to_json())

    # On first auth, record historyId and syncToken
    if not os.path.exists(SYNC_TOKEN_FILE):
        # Build services
        gmail_service = build('gmail', 'v1', credentials=credentials)
        calendar_service = build('calendar', 'v3', credentials=credentials)

        # Get Gmail historyId
        profile = gmail_service.users().getProfile(userId='me').execute()
        history_id = profile.get('historyId')

        # Get Calendar syncToken
        events_result = calendar_service.events().list(calendarId='primary', maxResults=1).execute()
        sync_token = events_result.get('nextSyncToken')

        sync_data = {
            'gmail_history_id': history_id,
            'calendar_sync_token': sync_token
        }
        with open(SYNC_TOKEN_FILE, 'w') as sync_file:
            json.dump(sync_data, sync_file)

    return flask.redirect(flask.url_for('profile'))

@app.route('/profile')
def profile():
    if not os.path.exists(TOKEN_FILE):
        return flask.redirect(flask.url_for('index'))

    with open(TOKEN_FILE, 'r') as token_file:
        credentials_data = json.load(token_file)

    sync_data = {}
    if os.path.exists(SYNC_TOKEN_FILE):
        with open(SYNC_TOKEN_FILE, 'r') as sync_file:
            sync_data = json.load(sync_file)

    return flask.render_template('profile.html', credentials=credentials_data, sync_tokens=sync_data)

@app.route('/logout')
def logout():
    if os.path.exists(TOKEN_FILE):
        os.remove(TOKEN_FILE)
    if os.path.exists(SYNC_TOKEN_FILE):
        os.remove(SYNC_TOKEN_FILE)
    flask.session.clear()
    return flask.redirect(flask.url_for('index'))


if __name__ == '__main__':
    # This is used when running locally only. When deploying to a web server,
    # a WSGI server like Gunicorn should be used instead.
    app.run(host='127.0.0.1', port=5000, debug=True)

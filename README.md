# Google OAuth Web App Example

This project is a simple web application that demonstrates how to implement Google OAuth 2.0 for web applications to access Google APIs. It specifically shows how to get authorization for the Gmail and Google Calendar APIs, store tokens, and fetch the initial `historyId` for Gmail and `syncToken` for Google Calendar.

## Setup Instructions

To run this application, you need to configure your Google Cloud project and get your client credentials. Follow these steps carefully.

### 1. Create a Google Cloud Project

If you don't have one already, create a new project in the Google Cloud Console:

- Go to the [Google Cloud Console](https://console.cloud.google.com/).
- Click the project drop-down and select "New Project".
- Give your project a name and click "Create".

### 2. Enable APIs

You need to enable the Gmail API and the Google Calendar API for your project.

- **Enable the Gmail API:** [https://console.cloud.google.com/apis/library/gmail.googleapis.com](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
- **Enable the Google Calendar API:** [https://console.cloud.google.com/apis/library/calendar-json.googleapis.com](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)

Click the "Enable" button for both APIs.

### 3. Create OAuth 2.0 Credentials

Next, you need to create OAuth 2.0 credentials for your web application.

- Go to the [Credentials page](https://console.cloud.google.com/apis/credentials) in the Google Cloud Console.
- Click on "**+ CREATE CREDENTIALS**" and select "**OAuth client ID**".
- For "Application type", select "**Web application**".
- Give it a name, for example, "Web client 1".
- Under "**Authorized redirect URIs**", click "**+ ADD URI**" and enter the following URI:
  ```
  http://127.0.0.1:5000/oauth2callback
  ```
- Click "**Create**".

### 4. Download Client Secret File

After creating the credentials, a window will pop up showing your "Client ID" and "Client Secret". You can close this, and then from the credentials list, find the credentials you just created and click the download icon (a down arrow) on the right side.

- This will download a JSON file.
- **Rename this file to `client_secret.json`**.
- **Place this `client_secret.json` file in the root directory of this project.**

## Running the Application

Once you have completed the setup above, you can run the application locally.

### 1. Install Dependencies

Install the required Python libraries using pip:

```bash
pip install -r requirements.txt
```

### 2. Run the Flask App

Execute the following command in your terminal:

```bash
export FLASK_APP=app.py
export FLASK_ENV=development
flask run
```

Alternatively, you can run the `app.py` file directly:

```bash
python app.py
```

The application will be available at `http://127.0.0.1:5000`.

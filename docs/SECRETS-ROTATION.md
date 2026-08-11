# CE secrets rotation note (post-audit 2026-07-31)

Local `.env` is gitignored. Treat previously used Gmail App Passwords and any
shared SMTP credentials as **compromised**:

1. Revoke the old Google App Password.
2. Create a new App Password and set `SMTP_PASSWORD=` in `.env`.
3. Rotate `JWT_SECRET_KEY` if this install was ever shared/copied (invalidates sessions).

License Server rotation steps: see `/Users/arun/RAGSUITE_License/docs/SECRETS-ROTATION.md`.

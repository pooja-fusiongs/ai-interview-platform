from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from jose import JWTError, jwt
import os

from database import get_db
from models import User
from api.auth.jwt_handler import get_password_hash, SECRET_KEY, ALGORITHM

router = APIRouter()

RESET_TOKEN_EXPIRE_MINUTES = 15
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://ai-interview-platform-unqg.vercel.app")


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordConfirm(BaseModel):
    token: str
    new_password: str


def create_reset_token(email: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": email, "type": "password_reset", "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_reset_token(token: str) -> str:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        token_type = payload.get("type")
        if email is None or token_type != "password_reset":
            raise HTTPException(status_code=400, detail="Invalid reset token")
        return email
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")


def send_password_reset_email(email: str, reset_link: str) -> bool:
    import requests

    BREVO_API_KEY = os.getenv("BREVO_API_KEY")
    SENDER_EMAIL = os.getenv("SENDER_EMAIL", "pooja@fusiongs.com")

    if not BREVO_API_KEY:
        print(f"[ForgotPassword] BREVO_API_KEY not set, skipping email. Reset link: {reset_link}")
        return False

    try:
        html_content = f"""
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
        <tr><td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#fff; border-radius:8px; border:1px solid #e5e7eb;">
                <tr><td style="padding:40px;">
                    <h2 style="margin:0 0 20px; color:#020291; font-size:22px;">Reset Your Password</h2>
                    <p style="color:#374151; font-size:15px;">
                        We received a request to reset your password. Click the button below to set a new password.
                    </p>
                    <p style="color:#6b7280; font-size:13px;">
                        This link will expire in {RESET_TOKEN_EXPIRE_MINUTES} minutes.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin:25px 0;">
                        <tr><td align="center">
                            <a href="{reset_link}"
                               style="background:#020291; color:#ffffff; text-decoration:none;
                                      padding:12px 28px; font-size:14px; font-weight:600;
                                      border-radius:4px; display:inline-block;">
                                Reset Password
                            </a>
                        </td></tr>
                    </table>
                    <p style="color:#9ca3af; font-size:13px;">
                        If you didn't request this, you can safely ignore this email.
                    </p>
                    <p style="color:#6b7280; font-size:14px; margin-top:20px;">
                        - <strong>FGS Interview Platform Team</strong>
                    </p>
                </td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>"""

        response = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "accept": "application/json",
                "content-type": "application/json",
                "api-key": BREVO_API_KEY,
            },
            json={
                "sender": {"name": "FGS Interview Platform", "email": SENDER_EMAIL},
                "to": [{"email": email}],
                "subject": "Reset Your Password - FGS Interview Platform",
                "htmlContent": html_content,
            },
        )
        print(f"[ForgotPassword] Reset email sent to {email}, status: {response.status_code}")
        return response.status_code in (200, 201)
    except Exception as e:
        print(f"[ForgotPassword] Failed to send reset email: {e}")
        return False


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user:
        # Explicit 404 so the UI can direct the user to sign up instead of
        # silently claiming an email was sent (which confuses users who never
        # had an account and causes real support tickets).
        print(f"[ForgotPassword] No user found for email: {body.email}")
        raise HTTPException(
            status_code=404,
            detail="No account found with this email. Please sign up first.",
        )

    token = create_reset_token(user.email)
    reset_link = f"{FRONTEND_URL}/reset-password?token={token}"
    sent = send_password_reset_email(user.email, reset_link)

    if not sent:
        raise HTTPException(
            status_code=502,
            detail="Failed to send reset email. Please try again in a few minutes.",
        )

    return {"message": "Reset link sent to your email."}


@router.post("/reset-password-confirm")
def reset_password_confirm(body: ResetPasswordConfirm, db: Session = Depends(get_db)):
    email = verify_reset_token(body.token)

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    user.hashed_password = get_password_hash(body.new_password)
    db.commit()

    return {"message": "Password has been reset successfully. You can now sign in."}
